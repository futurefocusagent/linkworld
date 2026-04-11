import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Gemini text-embedding-004 produces 768-dimensional embeddings
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })

export async function getEmbedding(text: string): Promise<number[]> {
  // Truncate to ~8000 chars to stay within token limits
  const truncated = text.slice(0, 8000)
  
  const result = await model.embedContent(truncated)
  return result.embedding.values
}
