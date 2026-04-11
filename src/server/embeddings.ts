// Using Gemini embedding (3072 dimensions)
const EMBEDDING_MODEL = 'gemini-embedding-001'

export async function getEmbedding(text: string): Promise<number[]> {
  // Truncate to ~8000 chars to stay within token limits
  const truncated = text.slice(0, 8000)
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: truncated }] },
      }),
    }
  )
  
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini embedding failed: ${err}`)
  }
  
  const data = await response.json() as { embedding: { values: number[] } }
  return data.embedding.values
}
