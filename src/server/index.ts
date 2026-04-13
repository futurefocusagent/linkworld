import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  initDb, insertLink, getLinksChronological, searchLinks, searchLinksByTagText,
  findSimilarToLink, getLinkById, getLinkCount,
  getAllTags, getLinkTags, setLinkTags, resolveTag,
  searchTagsByName, deleteTag, mergeTags, getLinksByTag,
  getTagById, findLinksSimilarToTag
} from './db.js'
import { scrapeUrl } from './firecrawl.js'
import { embedDocument, embedQuery } from './embeddings.js'
import { autoTagLink } from './tagger.js'
import { generateMetadata } from './titlegen.js'
import { initImageStorage, downloadAndSaveImage, extractFirstImage, getImageUrl, getStorageDir, generatePlaceholder } from './images.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// Submit a new link
app.post('/api/links', async (req, res) => {
  try {
    const { url } = req.body
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url required' })
    }

    console.log(`Processing link: ${url}`)

    // 1. Scrape with Firecrawl
    const scraped = await scrapeUrl(url)
    
    // 2. Generate title and description if needed (PDFs, missing OG data)
    let title = scraped.title
    let ogDescription = scraped.ogDescription
    
    const needsTitle = scraped.needsGeneratedTitle || !title
    const needsDescription = !ogDescription
    
    if (needsTitle || needsDescription) {
      console.log(`  Generating metadata (title: ${needsTitle}, description: ${needsDescription})...`)
      const generated = await generateMetadata(scraped.markdown, url)
      
      if (needsTitle) {
        title = generated.title
        console.log(`  Generated title: ${title}`)
      } else {
        console.log(`  Scraped title: ${title}`)
      }
      
      if (needsDescription && generated.description) {
        ogDescription = generated.description
        console.log(`  Generated description: ${ogDescription}`)
      }
    } else {
      console.log(`  Scraped: ${title}`)
    }

    // 3. Download and save image (OG image or first content image, fallback to placeholder)
    let savedImage: string | null = null
    const imageUrl = scraped.ogImage || extractFirstImage(scraped.markdown)
    if (imageUrl) {
      console.log(`  Downloading image: ${imageUrl.slice(0, 60)}...`)
      savedImage = await downloadAndSaveImage(imageUrl)
    }
    
    // Generate placeholder if no image could be downloaded
    if (!savedImage) {
      console.log('  No image available, generating placeholder...')
      savedImage = generatePlaceholder(title, url)
    }

    // 4. Generate embedding from markdown content (RETRIEVAL_DOCUMENT for storage)
    const textForEmbedding = `${title}\n\n${ogDescription || ''}\n\n${scraped.markdown}`
    const embedding = await embedDocument(textForEmbedding)
    console.log(`  Embedding: ${embedding.length} dimensions`)

    // 5. Save to database (store local image path, not original URL)
    const link = await insertLink({
      url,
      title,
      markdown: scraped.markdown,
      ogTitle: scraped.ogTitle,
      ogDescription: ogDescription,
      ogImage: savedImage ? getImageUrl(savedImage) : undefined,
      embedding,
    })
    console.log(`  Saved as ID: ${link.id}`)

    // 6. Auto-generate tags (async, don't block response)
    autoTagLink(link.id, title, scraped.markdown)
      .then(result => console.log(`  Tagged with ${result.tags.length} tags:`, result.tags.map(t => t.name)))
      .catch(err => console.error('  Auto-tagging failed:', err))

    res.json({ ok: true, link: { id: link.id, url: link.url, title: link.title } })
  } catch (err) {
    console.error('Error processing link:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

// Get links chronologically (with tags)
app.get('/api/links', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
    const offset = parseInt(req.query.offset as string) || 0
    const tagId = req.query.tag ? parseInt(req.query.tag as string) : undefined
    
    let links
    if (tagId) {
      links = await getLinksByTag(tagId, limit)
    } else {
      links = await getLinksChronological(limit, offset)
    }
    
    // Attach tags to each link
    const linksWithTags = await Promise.all(
      links.map(async link => ({
        ...link,
        tags: await getLinkTags(link.id)
      }))
    )
    
    const total = await getLinkCount()
    res.json({ links: linksWithTags, total })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Search links by semantic similarity + tag text matching
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string
    if (!query) {
      return res.status(400).json({ error: 'q (query) required' })
    }

    // Run both searches in parallel
    const [embedding, tagMatches] = await Promise.all([
      embedQuery(query),
      searchLinksByTagText(query, 20)
    ])
    
    const semanticResults = await searchLinks(embedding, 20)
    
    // Merge results: tag matches first (with high similarity), then semantic
    const tagMatchIds = new Set(tagMatches.map(l => l.id))
    const mergedResults: (typeof semanticResults[0])[] = []
    
    // Add tag matches first with boosted similarity
    for (const link of tagMatches) {
      mergedResults.push({ ...link, similarity: 0.99 })
    }
    
    // Add semantic results that aren't already in tag matches
    for (const link of semanticResults) {
      if (!tagMatchIds.has(link.id)) {
        mergedResults.push(link)
      }
    }
    
    // Limit to 20 total
    const finalResults = mergedResults.slice(0, 20)
    
    // Attach tags
    const resultsWithTags = await Promise.all(
      finalResults.map(async link => ({
        ...link,
        tags: await getLinkTags(link.id)
      }))
    )
    
    res.json({ results: resultsWithTags })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Find similar links to a given link
app.get('/api/links/:id/similar', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const link = await getLinkById(id)
    if (!link) {
      return res.status(404).json({ error: 'Link not found' })
    }

    const similar = await findSimilarToLink(id, 20)
    res.json({ source: { id: link.id, title: link.title, url: link.url }, similar })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Get single link details with tags
app.get('/api/links/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const link = await getLinkById(id)
    if (!link) {
      return res.status(404).json({ error: 'Link not found' })
    }
    const tags = await getLinkTags(id)
    // Include markdown if requested
    const includeContent = req.query.content === 'true'
    if (includeContent) {
      res.json({ ...link, tags })
    } else {
      // Exclude markdown by default (it's large)
      const { markdown, ...rest } = link as typeof link & { markdown?: string }
      res.json({ ...rest, tags })
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Update tags for a link
app.put('/api/links/:id/tags', async (req, res) => {
  try {
    const linkId = parseInt(req.params.id, 10)
    const { tags } = req.body as { tags: string[] }
    
    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'tags array required' })
    }

    // Resolve each tag (create or find existing)
    const resolvedTags = await Promise.all(
      tags.map(async name => {
        const embedding = await embedQuery(name)
        return resolveTag(name, embedding, 0.85)
      })
    )
    
    // Dedupe by ID
    const uniqueTags = [...new Map(resolvedTags.map(t => [t.id, t])).values()]
    
    await setLinkTags(linkId, uniqueTags.map(t => t.id))
    res.json({ tags: uniqueTags })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Add tags to a link (append, does not replace existing)
app.post('/api/links/:id/tags', async (req, res) => {
  try {
    const linkId = parseInt(req.params.id, 10)
    const { tags } = req.body as { tags: string[] }

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'tags array required' })
    }

    const link = await getLinkById(linkId)
    if (!link) {
      return res.status(404).json({ error: 'Link not found' })
    }

    // Resolve each new tag (create or find existing, with semantic dedup)
    const resolvedNew = await Promise.all(
      tags.map(async name => {
        const embedding = await embedQuery(name)
        return resolveTag(name, embedding, 0.85)
      })
    )

    // Merge with existing tag IDs
    const existing = await getLinkTags(linkId)
    const existingIds = new Set(existing.map(t => t.id))
    for (const t of resolvedNew) existingIds.add(t.id)

    await setLinkTags(linkId, [...existingIds])

    const updated = await getLinkTags(linkId)
    res.json({ tags: updated })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ============ TAG ENDPOINTS ============

// Get all tags with counts
app.get('/api/tags', async (req, res) => {
  try {
    const search = req.query.q as string
    let tags
    if (search) {
      tags = await searchTagsByName(search)
    } else {
      tags = await getAllTags()
    }
    res.json({ tags })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Get tag detail with exact matches and semantically similar links
app.get('/api/tags/:id', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id, 10)
    const tag = await getTagById(tagId)
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' })
    }

    // Get exact matches (links explicitly tagged)
    const exactMatches = await getLinksByTag(tagId, 50)
    const exactMatchIds = exactMatches.map(l => l.id)
    
    // Attach tags to exact matches
    const exactWithTags = await Promise.all(
      exactMatches.map(async link => ({
        ...link,
        tags: await getLinkTags(link.id)
      }))
    )

    // Get semantically similar links (using tag embedding)
    let similar: Awaited<ReturnType<typeof findLinksSimilarToTag>> = []
    if (tag.embedding_text) {
      const embedding = tag.embedding_text
        .slice(1, -1)
        .split(',')
        .map(Number)
      similar = await findLinksSimilarToTag(embedding, exactMatchIds, 20)
      
      // Attach tags to similar
      similar = await Promise.all(
        similar.map(async link => ({
          ...link,
          tags: await getLinkTags(link.id)
        }))
      ) as typeof similar
    }

    res.json({
      tag: { id: tag.id, name: tag.name },
      exact: exactWithTags,
      similar
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Delete a tag
app.delete('/api/tags/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    await deleteTag(id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Merge tags
app.post('/api/tags/merge', async (req, res) => {
  try {
    const { sourceId, targetId } = req.body
    if (!sourceId || !targetId) {
      return res.status(400).json({ error: 'sourceId and targetId required' })
    }
    await mergeTags(sourceId, targetId)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Backfill images for existing links (admin endpoint)
app.post('/api/admin/backfill-images', async (req, res) => {
  try {
    const links = await getLinksChronological(500, 0)
    const results: { id: number; title: string; result: string }[] = []
    
    for (const link of links) {
      // Skip if already has local image
      if (link.og_image?.startsWith('/images/')) {
        results.push({ id: link.id, title: link.title, result: 'already local' })
        continue
      }
      
      // Get full link data with markdown
      const fullLink = await getLinkById(link.id)
      if (!fullLink) continue
      
      // Try OG image first, then first content image
      const imageUrl = (fullLink as any).og_image || extractFirstImage((fullLink as any).markdown || '')
      
      let savedImage: string | null = null
      
      if (imageUrl && !imageUrl.startsWith('/images/')) {
        savedImage = await downloadAndSaveImage(imageUrl)
      }
      
      // Generate placeholder if no image could be downloaded
      if (!savedImage) {
        savedImage = generatePlaceholder(link.title, link.url)
      }
      
      // Update database
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
      await pool.query(
        'UPDATE linkworld.links SET og_image = $1 WHERE id = $2',
        [getImageUrl(savedImage), link.id]
      )
      await pool.end()
      results.push({ id: link.id, title: link.title, result: `saved: ${savedImage}` })
    }
    
    res.json({ ok: true, results })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Serve saved images from persistent storage
app.use('/images', express.static(getStorageDir()))

// Serve static files
const clientDist = path.join(__dirname, '../client')
app.use(express.static(clientDist))
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), err => {
    if (err) res.status(500).send('Client not found')
  })
})

async function boot() {
  try {
    // Initialize storage
    initImageStorage()
    
    await initDb()
    app.listen(PORT, () => {
      console.log(`LinkWorld running on port ${PORT}`)
      console.log(`Image storage: ${getStorageDir()}`)
    })
  } catch (err) {
    console.error('Boot failed:', err)
    process.exit(1)
  }
}

boot()
