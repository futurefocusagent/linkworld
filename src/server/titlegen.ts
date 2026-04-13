const GEMINI_API_KEY = process.env.GEMINI_API_KEY

interface GeneratedMetadata {
  title: string
  description: string | null
}

// Generate title and description from content using Gemini Flash
export async function generateMetadata(markdown: string, url: string): Promise<GeneratedMetadata> {
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set, using URL as title')
    return { title: url, description: null }
  }

  const truncated = markdown.slice(0, 3000)
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a title and description for this document.

Rules:
- Title: concise, under 100 characters. For papers use the paper title, for docs use the main heading.
- Description: 1-2 sentences summarizing the key content, under 200 characters.

Output ONLY valid JSON in this format, nothing else:
{"title": "...", "description": "..."}

URL: ${url}

Content:
${truncated}`
            }]
          }],
          generationConfig: {
            maxOutputTokens: 150,
            temperature: 0.1
          }
        })
      }
    )

    if (!response.ok) {
      console.error('Metadata generation failed:', await response.text())
      return { title: url, description: null }
    }

    const data = await response.json() as { candidates: { content: { parts: { text: string }[] } }[] }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    
    // Parse JSON response
    try {
      const parsed = JSON.parse(text)
      return {
        title: parsed.title || url,
        description: parsed.description || null
      }
    } catch {
      // Fallback: treat as plain title
      return { title: text || url, description: null }
    }
  } catch (err) {
    console.error('Metadata generation error:', err)
    return { title: url, description: null }
  }
}

// Legacy function for backwards compatibility
export async function generateTitle(markdown: string, url: string): Promise<string> {
  const metadata = await generateMetadata(markdown, url)
  return metadata.title
}
