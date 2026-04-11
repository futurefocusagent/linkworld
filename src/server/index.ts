import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, insertLink, getLinksChronological, searchLinks, findSimilarToLink, getLinkById, getLinkCount } from './db.js'
import { scrapeUrl } from './firecrawl.js'
import { embedDocument, embedQuery } from './embeddings.js'

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

    res.json({ ok: true, link: { id: link.id, url: link.url, title: link.title } })
  } catch (err) {
    console.error('Error processing link:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

// Get links chronologically
app.get('/api/links', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
    const offset = parseInt(req.query.offset as string) || 0
    const links = await getLinksChronological(limit, offset)
    const total = await getLinkCount()
    res.json({ links, total })
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
    res.json({ results })
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

// Get single link details
app.get('/api/links/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const link = await getLinkById(id)
    if (!link) {
      return res.status(404).json({ error: 'Link not found' })
    }
    res.json(link)
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
