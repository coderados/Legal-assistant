import OpenAI from "openai"

export const agnesClient = new OpenAI({
  apiKey: process.env.AGNES_API_KEY,
  baseURL: "https://apihub.agnes-ai.com/v1",
})

export const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const AGNES_MODEL = process.env.AGNES_MODEL ?? "agnes-2.5-flash"
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"

export async function createEmbedding(text: string) {
  const response = await openaiClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return response.data[0].embedding
}
