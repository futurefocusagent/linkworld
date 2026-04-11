import pg from 'pg'
const { Pool } = pg

// Internal Render URLs don't use SSL, external ones do
const isInternal = process.env.DATABASE_URL?.match(/@dpg-[^.]+\//) !== null
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isInternal ? false : { rejectUnauthorized: false },
})

export interface Link {
  id: number
  url: string
  title: string
  markdown: string
  og_title: string | null
  og_description: string | null
  og_image: string | null
  embedding: number[]
  created_at: Date
}

export async function initDb() {
  // Enable pgvector extension
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`)

  // Create linkworld schema
  await pool.query(`CREATE SCHEMA IF NOT EXISTS linkworld`)

  // Create links table with vector embedding
  await pool.query(`
    CREATE TABLE IF NOT EXISTS linkworld.links (
      id SERIAL PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      markdown TEXT NOT NULL,
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      embedding vector(3072),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Tags table with embeddings for semantic deduplication
  await pool.query(`
    CREATE TABLE IF NOT EXISTS linkworld.tags (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      embedding vector(3072),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Junction table for link-tag associations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS linkworld.link_tags (
      link_id INTEGER REFERENCES linkworld.links(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES linkworld.tags(id) ON DELETE CASCADE,
      PRIMARY KEY (link_id, tag_id)
    )
  `)

  console.log('LinkWorld DB initialized')
}

export async function insertLink(data: {
  url: string
  title: string
  markdown: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  embedding: number[]
}): Promise<Link> {
  const result = await pool.query<Link>(
    `INSERT INTO linkworld.links 
      (url, title, markdown, og_title, og_description, og_image, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (url) DO UPDATE SET
       title = EXCLUDED.title,
       markdown = EXCLUDED.markdown,
       og_title = EXCLUDED.og_title,
       og_description = EXCLUDED.og_description,
       og_image = EXCLUDED.og_image,
       embedding = EXCLUDED.embedding
     RETURNING *`,
    [
      data.url,
      data.title,
      data.markdown,
      data.ogTitle ?? null,
      data.ogDescription ?? null,
      data.ogImage ?? null,
      `[${data.embedding.join(',')}]`,
    ]
  )
  return result.rows[0]
}

export async function getLinksChronological(limit = 100, offset = 0): Promise<Link[]> {
  const result = await pool.query<Link>(
    `SELECT id, url, title, og_title, og_description, og_image, created_at
     FROM linkworld.links
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  return result.rows
}

export async function searchLinks(embedding: number[], limit = 20): Promise<(Link & { similarity: number })[]> {
  const result = await pool.query<Link & { similarity: number }>(
    `SELECT id, url, title, og_title, og_description, og_image, created_at,
            1 - (embedding <=> $1::vector) as similarity
     FROM linkworld.links
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [`[${embedding.join(',')}]`, limit]
  )
  return result.rows
}

export async function getLinkById(id: number): Promise<Link | null> {
  const result = await pool.query<Link>(
    `SELECT * FROM linkworld.links WHERE id = $1`,
    [id]
  )
  return result.rows[0] ?? null
}

export async function findSimilarToLink(linkId: number, limit = 20): Promise<(Link & { similarity: number })[]> {
  const result = await pool.query<Link & { similarity: number }>(
    `SELECT l2.id, l2.url, l2.title, l2.og_title, l2.og_description, l2.og_image, l2.created_at,
            1 - (l2.embedding <=> l1.embedding) as similarity
     FROM linkworld.links l1, linkworld.links l2
     WHERE l1.id = $1 AND l2.id != $1
     ORDER BY l2.embedding <=> l1.embedding
     LIMIT $2`,
    [linkId, limit]
  )
  return result.rows
}

export async function getLinkCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM linkworld.links`)
  return parseInt(result.rows[0].count, 10)
}

// ============ TAG FUNCTIONS ============

export interface Tag {
  id: number
  name: string
  embedding: number[] | null
  created_at: Date
  count?: number
}

// Find semantically similar tags (for deduplication)
export async function findSimilarTag(
  embedding: number[],
  threshold = 0.85
): Promise<Tag | null> {
  const result = await pool.query<Tag & { similarity: number }>(
    `SELECT id, name, created_at,
            1 - (embedding <=> $1::vector) as similarity
     FROM linkworld.tags
     WHERE 1 - (embedding <=> $1::vector) >= $2
     ORDER BY embedding <=> $1::vector
     LIMIT 1`,
    [`[${embedding.join(',')}]`, threshold]
  )
  return result.rows[0] ?? null
}

// Create a new tag with embedding
export async function createTag(name: string, embedding: number[]): Promise<Tag> {
  const result = await pool.query<Tag>(
    `INSERT INTO linkworld.tags (name, embedding)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name.toLowerCase().trim(), `[${embedding.join(',')}]`]
  )
  return result.rows[0]
}

// Get or create tag with semantic deduplication
export async function resolveTag(
  candidateName: string,
  embedding: number[],
  threshold = 0.85
): Promise<Tag> {
  // First check for exact name match
  const exactMatch = await pool.query<Tag>(
    `SELECT * FROM linkworld.tags WHERE LOWER(name) = LOWER($1)`,
    [candidateName.trim()]
  )
  if (exactMatch.rows[0]) {
    return exactMatch.rows[0]
  }

  // Check for semantic match
  const similar = await findSimilarTag(embedding, threshold)
  if (similar) {
    return similar
  }

  // Create new tag
  return createTag(candidateName, embedding)
}

// Associate tags with a link
export async function setLinkTags(linkId: number, tagIds: number[]): Promise<void> {
  // Clear existing tags
  await pool.query(`DELETE FROM linkworld.link_tags WHERE link_id = $1`, [linkId])
  
  // Insert new associations
  if (tagIds.length > 0) {
    const values = tagIds.map((tagId, i) => `($1, $${i + 2})`).join(', ')
    await pool.query(
      `INSERT INTO linkworld.link_tags (link_id, tag_id) VALUES ${values}
       ON CONFLICT DO NOTHING`,
      [linkId, ...tagIds]
    )
  }
}

// Get tags for a link
export async function getLinkTags(linkId: number): Promise<Tag[]> {
  const result = await pool.query<Tag>(
    `SELECT t.* FROM linkworld.tags t
     JOIN linkworld.link_tags lt ON lt.tag_id = t.id
     WHERE lt.link_id = $1
     ORDER BY t.name`,
    [linkId]
  )
  return result.rows
}

// Get all tags with usage counts
export async function getAllTags(): Promise<(Tag & { count: number })[]> {
  const result = await pool.query<Tag & { count: number }>(
    `SELECT t.id, t.name, t.created_at,
            COUNT(lt.link_id)::integer as count
     FROM linkworld.tags t
     LEFT JOIN linkworld.link_tags lt ON lt.tag_id = t.id
     GROUP BY t.id
     ORDER BY count DESC, t.name`
  )
  return result.rows
}

// Search tags by name (prefix match)
export async function searchTagsByName(query: string): Promise<Tag[]> {
  const result = await pool.query<Tag>(
    `SELECT * FROM linkworld.tags
     WHERE name ILIKE $1
     ORDER BY name
     LIMIT 20`,
    [`%${query}%`]
  )
  return result.rows
}

// Delete a tag
export async function deleteTag(tagId: number): Promise<void> {
  await pool.query(`DELETE FROM linkworld.tags WHERE id = $1`, [tagId])
}

// Merge tags (move all associations from source to target, delete source)
export async function mergeTags(sourceId: number, targetId: number): Promise<void> {
  await pool.query(
    `UPDATE linkworld.link_tags SET tag_id = $2 WHERE tag_id = $1
     ON CONFLICT DO NOTHING`,
    [sourceId, targetId]
  )
  await deleteTag(sourceId)
}

// Get links by tag
export async function getLinksByTag(tagId: number, limit = 100): Promise<Link[]> {
  const result = await pool.query<Link>(
    `SELECT l.id, l.url, l.title, l.og_title, l.og_description, l.og_image, l.created_at
     FROM linkworld.links l
     JOIN linkworld.link_tags lt ON lt.link_id = l.id
     WHERE lt.tag_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2`,
    [tagId, limit]
  )
  return result.rows
}
