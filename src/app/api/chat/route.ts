import { NextRequest } from "next/server"
import { getAgnesClient, AGNES_MODEL } from "@/lib/ai"
import { retrieveRelevantChunks } from "@/lib/rag"

const LEGAL_SYSTEM_PROMPT = `You are a careful legal research assistant focused on United States federal law and California state law.

CRITICAL: You are not a lawyer. The information you provide is for general educational and research purposes only and does not constitute legal advice. Always encourage the user to consult a qualified, licensed attorney for advice specific to their situation.

When answering:
- Provide a concise legal interpretation first, then support it with the retrieved sources.
- Cite specific codes, statutes, regulations, bills, definitions, or rules when they are relevant. Use bracket citations like [Source 1], [Source 2], etc.
- If a source names a specific code section (e.g., "Cal. Civ. Code § 1714" or "18 U.S.C. § 1001"), include that citation in your answer.
- If the retrieved sources do not contain enough information, say so clearly and do not invent law, cases, or citations.
- Keep responses clear, organized, and practical. Use numbered lists or short paragraphs when helpful.
- Flag when a question may require jurisdiction-specific analysis beyond federal/California law or when facts are missing.`

export async function POST(request: NextRequest) {
  try {
    const { messages } = (await request.json()) as { messages: { role: "user" | "assistant"; content: string }[] }
    const lastUserMessage = messages.filter((m) => m.role === "user").at(-1)

    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: "No user message found" }), { status: 400 })
    }

    // Retrieval is best-effort: a missing OPENAI_API_KEY, an empty database,
    // or a native sqlite failure should not prevent the LLM from answering.
    let chunks: Awaited<ReturnType<typeof retrieveRelevantChunks>> = []
    try {
      chunks = await retrieveRelevantChunks(lastUserMessage.content)
    } catch (retrievalError) {
      console.error("RAG retrieval failed (continuing without sources):", retrievalError)
    }
    const context = chunks
      .map((c, i) => `[Source ${i + 1}${c.metadata?.source ? ` - ${c.metadata.source}` : ""}]\n${c.content}`)
      .join("\n\n---\n\n")

    const augmentedSystem = `${LEGAL_SYSTEM_PROMPT}\n\n## Retrieved legal sources\n${context || "No uploaded legal sources are available yet."}`

    const stream = await getAgnesClient().chat.completions.create({
      model: AGNES_MODEL,
      messages: [{ role: "system", content: augmentedSystem }, ...messages],
      stream: true,
      temperature: 0.3,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              sources: chunks.map((c, i) => ({
                index: i + 1,
                source: typeof c.metadata?.source === "string" ? c.metadata.source : "Uploaded source",
                content: c.content.slice(0, 500),
              })),
            })}\n\n`
          )
        )

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Chat error:", error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Chat failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
