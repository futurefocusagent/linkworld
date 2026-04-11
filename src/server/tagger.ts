import { embedQuery } from './embeddings.js'
import { resolveTag, setLinkTags, type Tag } from './db.js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

interface TaggingResult {
  tags: Tag[]
  raw: string[]
}

// Generate tags for content using Claude
async function generateTagCandidates(title: string, markdown: string): Promise<string[]> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not set, skipping auto-tagging')
    return []
  }

  const truncatedMarkdown = markdown.slice(0, 4000)
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Generate exactly 10 tags for this webpage. Include tags for:
- Topic/subject matter (e.g., "machine learning", "art")
- Content type (e.g., "tutorial", "news article", "documentation")
- Domain/field (e.g., "technology", "culture")
- Key concepts mentioned
- Target audience if apparent

Title: ${title}

Content preview:
${truncatedMarkdown}

Output ONLY the 10 tags as a comma-separated list, lowercase, no explanations. Example: machine learning, tutorial, python, beginner, data science, neural networks, deep learning, ai, programming, education`
      }]
    })
  })

  if (!response.ok) {
    console.error('Claude tagging failed:', await response.text())
    return []
  }

  const data = await response.json() as { content: { text: string }[] }
  const text = data.content[0]?.text || ''
  
  // Parse comma-separated tags
  const tags = text
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && t.length < 50)
    .slice(0, 10)
  
  return tags
}

// Process tags with semantic deduplication
export async function autoTagLink(
  linkId: number,
  title: string,
  markdown: string
): Promise<TaggingResult> {
  const candidates = await generateTagCandidates(title, markdown)
  
  if (candidates.length === 0) {
    return { tags: [], raw: [] }
  }

  const resolvedTags: Tag[] = []
  
  for (const candidate of candidates) {
    try {
      // Embed the tag candidate (use RETRIEVAL_QUERY since we're searching)
      const embedding = await embedQuery(candidate)
      
      // Resolve to existing or create new tag
      const tag = await resolveTag(candidate, embedding, 0.85)
      resolvedTags.push(tag)
    } catch (err) {
      console.error(`Failed to resolve tag "${candidate}":`, err)
    }
  }

  // Dedupe by ID (in case semantic matching returned same tag twice)
  const uniqueTags = [...new Map(resolvedTags.map(t => [t.id, t])).values()]
  
  // Associate tags with link
  await setLinkTags(linkId, uniqueTags.map(t => t.id))
  
  return { tags: uniqueTags, raw: candidates }
}
