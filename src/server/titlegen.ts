const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// Generate a title from content using Gemini Flash
export async function generateTitle(markdown: string, url: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set, using URL as title')
    return url
  }

  const truncated = markdown.slice(0, 2000)
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Extract or generate a concise title for this document. If it's an academic paper, use the paper title. If it's documentation, use the main heading. Output ONLY the title, nothing else.

URL: ${url}

Content:
${truncated}`
            }]
          }],
          generationConfig: {
            maxOutputTokens: 50,
            temperature: 0.1
          }
        })
      }
    )

    if (!response.ok) {
      console.error('Title generation failed:', await response.text())
      return url
    }

    const data = await response.json() as { candidates: { content: { parts: { text: string }[] } }[] }
    const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    
    return title || url
  } catch (err) {
    console.error('Title generation error:', err)
    return url
  }
}
