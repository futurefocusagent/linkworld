import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  initDb, insertLink, getLinksChronological, searchLinks,
  findSimilarToLink, getLinkById, getLinkCount,
  getAllTags, getLinkTags, setLinkTags, resolveTag,
  searchTagsByName, deleteTag, mergeTags, getLinksByTag
} from './db.js'
import { scrapeUrl } from './firecrawl.js'
import { embedDocument, embedQuery } from './embeddings.js'
import { autoTagLink } from './tagger.js'

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
    console.log(`  Scraped: ${scraped.title}`)

    // 2. Generate embedding from markdown content (RETRIEVAL_DOCUMENT for storage)
    const textForEmbedding = `${scraped.title}\n\n${scraped.ogDescription || ''}\n\n${scraped.markdown}`
    const embedding = await embedDocument(textForEmbedding)
    console.log(`  Embedding: ${embedding.length} dimensions`)

    // 3. Save to database
    const link = await insertLink({
      url,
      title: scraped.title,
      markdown: scraped.markdown,
      ogTitle: scraped.ogTitle,
      ogDescription: scraped.ogDescription,
      ogImage: scraped.ogImage,
      embedding,
    })
    console.log(`  Saved as ID: ${link.id}`)

    // 4. Auto-generate tags (async, don't block response)
    autoTagLink(link.id, scraped.title, scraped.markdown)
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

// Search links by semantic similarity
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string
    if (!query) {
      return res.status(400).json({ error: 'q (query) required' })
    }

    // Use RETRIEVAL_QUERY task type for search queries
    const embedding = await embedQuery(query)
    const results = await searchLinks(embedding, 20)
    
    // Attach tags
    const resultsWithTags = await Promise.all(
      results.map(async link => ({
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
    res.json({ ...link, tags })
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
    await initDb()
    app.listen(PORT, () => {
      console.log(`LinkWorld running on port ${PORT}`)
    })
  } catch (err) {
    console.error('Boot failed:', err)
    process.exit(1)
  }
}

boot()
