import pg from 'pg'
const { Pool } = pg

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
      embedding vector(768),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Create index for vector similarity search
  await pool.query(`
    CREATE INDEX IF NOT EXISTS links_embedding_idx 
    ON linkworld.links 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
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
