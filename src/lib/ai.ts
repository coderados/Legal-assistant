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
export const AGNES_FALLBACK_MODEL = process.env.AGNES_FALLBACK_MODEL ?? "agnes-2.0-flash"
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"

// Agnes 2.5 "Thinking" mode is enabled via the OpenAI-compatible extension
// field `chat_template_kwargs`. Not every Agnes deployment accepts that field,
// so we retry without it (and finally on the previous-generation model).
type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

interface ThinkingCompletionOptions {
  temperature?: number
  maxTokens?: number
  thinkingBudget?: number
}

/**
 * Create a non-streaming chat completion on Agnes 2.5 with Thinking mode
 * enabled, transparently falling back to a plain Agnes 2.5 request and then to
 * the legacy model if the extension field or model is rejected.
 */
export async function createAgnesThinkingCompletion(
  messages: ChatMessage[],
  options: ThinkingCompletionOptions = {},
): Promise<string> {
  const client = getAgnesClient()
  const { temperature = 0.3, maxTokens = 2048, thinkingBudget = 2048 } = options

  const attempts: Record<string, unknown>[] = [
    // Primary: Agnes 2.5 with Thinking mode enabled.
    {
      model: AGNES_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      chat_template_kwargs: { enable_thinking: true, thinking_budget: thinkingBudget },
    },
    // Fallback 1: plain Agnes 2.5 (no Thinking extension field).
    { model: AGNES_MODEL, messages, temperature, max_tokens: maxTokens },
    // Fallback 2: previous-generation model.
    { model: AGNES_FALLBACK_MODEL, messages, temperature, max_tokens: maxTokens },
  ]

  let lastError: unknown
  for (const params of attempts) {
    try {
      const completion = await client.chat.completions.create(
        params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      )
      const content = completion.choices?.[0]?.message?.content
      if (typeof content === "string" && content.trim()) return content
      lastError = new Error("Empty completion content")
    } catch (err) {
      lastError = err
      console.warn(`[ai] Agnes attempt failed (model=${String(params.model)}), trying fallback:`, err)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Agnes completion failed")
}

export async function createEmbedding(text: string) {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return response.data[0].embedding
}
