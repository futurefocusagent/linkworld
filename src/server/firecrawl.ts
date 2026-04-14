interface FirecrawlResponse {
  success: boolean
  data?: {
    markdown: string
    metadata?: {
      title?: string
      'og:title'?: string
      'og:description'?: string
      'og:image'?: string
      ogTitle?: string
      ogDescription?: string
      ogImage?: string
    }
  }
  error?: string
}

export interface ScrapedContent {
  markdown: string
  title: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  needsGeneratedTitle?: boolean
}

function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.endsWith('.pdf') || lower.includes('/pdf/') || lower.includes('.pdf?')
}

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  const isPdf = isPdfUrl(url)

  const body: Record<string, unknown> = {
    url,
    formats: ['markdown'],
  }

  if (isPdf) {
    body.parsers = [{ type: 'pdf', mode: 'auto', maxPages: 50 }]
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json() as FirecrawlResponse

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Firecrawl failed')
  }

  const meta = data.data.metadata || {}

  const hasTitle = meta.title || meta['og:title'] || meta.ogTitle

  return {
    markdown: data.data.markdown,
    title: hasTitle ? String(meta.title || meta['og:title'] || meta.ogTitle) : '',
    ogTitle: meta['og:title'] || meta.ogTitle,
    ogDescription: meta['og:description'] || meta.ogDescription,
    ogImage: meta['og:image'] || meta.ogImage,
    needsGeneratedTitle: isPdf || !hasTitle,
  }
}
