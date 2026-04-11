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

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
    }),
  })

  const data = await response.json() as FirecrawlResponse
  
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Firecrawl failed')
  }

  const meta = data.data.metadata || {}
  
  const hasTitle = meta.title || meta['og:title'] || meta.ogTitle
  
  return {
    markdown: data.data.markdown,
    title: hasTitle ? String(meta.title || meta['og:title'] || meta.ogTitle) : '', // Empty if no title, will be generated
    ogTitle: meta['og:title'] || meta.ogTitle,
    ogDescription: meta['og:description'] || meta.ogDescription,
    ogImage: meta['og:image'] || meta.ogImage,
    needsGeneratedTitle: !hasTitle,
  }
}
