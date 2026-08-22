import OpenAI from "openai"

let agnesClient: OpenAI | null = null
let openaiClient: OpenAI | null = null

// Lazy constructors: route modules are imported during `next build`, so
// avoid constructing clients (which require API keys) at module load time.
export function getAgnesClient(): OpenAI {
  if (!agnesClient) {
    agnesClient = new OpenAI({
      apiKey: process.env.AGNES_API_KEY,
      baseURL: "https://apihub.agnes-ai.com/v1",
    })
  }
  return agnesClient
}

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

export const AGNES_MODEL = process.env.AGNES_MODEL ?? "agnes-2.5-flash"
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"

export async function createEmbedding(text: string) {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return response.data[0].embedding
}
