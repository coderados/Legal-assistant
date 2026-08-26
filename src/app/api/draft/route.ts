import { NextRequest, NextResponse } from "next/server"
import { createAgnesThinkingCompletion } from "@/lib/ai"
import { retrieveRelevantChunks } from "@/lib/rag"

const DRAFT_SYSTEM_PROMPT = `You are a careful legal drafting assistant focused on United States federal law and California state law.

CRITICAL: You are not a lawyer. The documents you generate are templates and starting points only. They do not constitute legal advice and must be reviewed by a qualified, licensed attorney before filing or use.

When drafting:
- Base the draft on the legal sources provided in the context and explain the legal interpretation briefly in a preamble.
- Cite specific codes, statutes, regulations, or rules where they support the document. Use bracket citations like [Source 1], [Source 2], etc.
- Produce a clear, well-structured document appropriate for the requested template.
- Include bracketed placeholders like [PLAINTIFF NAME], [DATE], [COURT NAME], etc., where specific facts are needed.
- Add a footer note reminding the user to have the draft reviewed by an attorney.
- If the context lacks information needed for a particular section, note the gap rather than inventing law.`

const TEMPLATES: Record<string, string> = {
  "demand-letter":
    "Draft a formal demand letter. Include: parties, factual background, legal basis, specific demand, deadline for response, and consequence of non-compliance.",
  "motion-to-dismiss":
    "Draft a motion to dismiss under federal and California law. Include: caption, introduction, statement of facts, grounds for dismissal (e.g., lack of jurisdiction, failure to state a claim), legal argument, and prayer for relief.",
  "complaint":
    "Draft a civil complaint for California state court. Include: caption, parties, jurisdiction and venue, factual allegations (numbered paragraphs), causes of action, and prayer for relief.",
  "contract":
    "Draft a general services contract under California law. Include: recitals, scope of services, payment terms, termination, limitation of liability, governing law, and signature blocks.",
  "cease-desist":
    "Draft a cease and desist letter. Identify the wrongful conduct, legal basis for the demand, specific actions to stop, deadline, and consequences of continued conduct.",
}

export async function POST(request: NextRequest) {
  try {
    const { template, facts } = (await request.json()) as { template: string; facts: string }

    if (!TEMPLATES[template]) {
      return NextResponse.json({ error: "Unknown template" }, { status: 400 })
    }
    if (typeof facts !== "string" || facts.trim().length === 0) {
      return NextResponse.json({ error: "Facts are required" }, { status: 400 })
    }

    const query = `${TEMPLATES[template]}\n\nUser facts:\n${facts}`
    // Retrieval is best-effort: a missing OPENAI_API_KEY or a native sqlite
    // failure should not prevent the draft from being generated.
    let chunks: Awaited<ReturnType<typeof retrieveRelevantChunks>> = []
    try {
      chunks = await retrieveRelevantChunks(query)
    } catch (retrievalError) {
      console.error("RAG retrieval failed (drafting without sources):", retrievalError)
    }
    const context = chunks
      .map((c, i) => `[Source ${i + 1}${c.metadata?.source ? ` - ${c.metadata.source}` : ""}]\n${c.content}`)
      .join("\n\n---\n\n")

    const system = `${DRAFT_SYSTEM_PROMPT}\n\n## Requested template\n${TEMPLATES[template]}\n\n## Retrieved legal sources\n${context || "No uploaded legal sources are available yet."}`

    const draft = await createAgnesThinkingCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: facts },
      ],
      { temperature: 0.3, maxTokens: 4096 },
    )

    return NextResponse.json({
      draft,
      sources: chunks.map((c, i) => ({
        index: i + 1,
        source: typeof c.metadata?.source === "string" ? c.metadata.source : "Uploaded source",
        content: c.content.slice(0, 500),
      })),
    })
  } catch (error) {
    console.error("Draft error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Draft generation failed" },
      { status: 500 }
    )
  }
}
