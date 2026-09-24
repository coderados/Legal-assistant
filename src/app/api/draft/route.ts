import { NextRequest, NextResponse } from "next/server"
import { createAgnesThinkingCompletion } from "@/lib/ai"
import { retrieveRelevantChunks } from "@/lib/rag"

const DRAFT_SYSTEM_PROMPT = `You are an expert legal drafting assistant focused on United States federal law and California state law. You produce complete, ready-to-use legal documents for the user.

When drafting:
- Draft the full document the user asked for. Do not refuse, deflect, or tell the user to consult an attorney — your purpose is to produce the document itself.
- Base the draft on the legal sources provided in the context and explain the legal interpretation briefly in a preamble.
- Cite specific codes, statutes, regulations, or rules where they support the document. Use bracket citations like [Source 1], [Source 2], etc.
- Produce a clear, well-structured, complete document appropriate for the requested template — not a partial template or outline.
- Include bracketed placeholders like [PLAINTIFF NAME], [DATE], [COURT NAME], etc., only where specific facts are genuinely unknown.
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
  nda:
    "Draft a non-disclosure agreement under California law. Include: parties, definition of confidential information, obligations, exclusions, term, remedies for breach, governing law, and signature blocks.",
  "settlement-agreement":
    "Draft a settlement and release agreement. Include: parties, recitals of the dispute, settlement payment/consideration, mutual release of claims, confidentiality, non-disparagement, dismissal of pending actions, and signature blocks.",
  "eviction-notice":
    "Draft a California 3-day notice to pay rent or quit (or cure/quit, as the facts indicate). Include: tenant and property identification, amount due and rental period, method of payment, deadline, and warnings required by California law.",
  "power-of-attorney":
    "Draft a durable power of attorney under California law. Include: principal and agent identification, powers granted, durability language, effective date, successor agents, execution and notarization blocks.",
  "llc-operating-agreement":
    "Draft a California LLC operating agreement. Include: formation, members and capital contributions, management structure, voting, distributions, transfer restrictions, dissolution, and signature blocks.",
  "employment-agreement":
    "Draft an employment agreement under California law. Include: position and duties, compensation and benefits, at-will status, confidentiality, termination provisions, and signature blocks. Comply with California limits on non-competes.",
  "last-will":
    "Draft a last will and testament under California law. Include: declaration, revocation of prior wills, executor appointment, bequests, residuary clause, guardian nomination if applicable, and execution/witness blocks meeting California Probate Code requirements.",
}

export async function POST(request: NextRequest) {
  try {
    const { template, facts, customInstructions } = (await request.json()) as {
      template: string
      facts: string
      customInstructions?: string
    }

    // "custom" lets the user describe any document in their own words instead
    // of picking a predefined template.
    const templateInstructions =
      template === "custom"
        ? typeof customInstructions === "string" && customInstructions.trim().length > 0
          ? `Draft the following document as described by the user: ${customInstructions.trim()}`
          : null
        : TEMPLATES[template]

    if (!templateInstructions) {
      return NextResponse.json(
        { error: template === "custom" ? "Describe the document you want drafted" : "Unknown template" },
        { status: 400 }
      )
    }
    if (typeof facts !== "string" || facts.trim().length === 0) {
      return NextResponse.json({ error: "Facts are required" }, { status: 400 })
    }

    const query = `${templateInstructions}\n\nUser facts:\n${facts}`
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

    const system = `${DRAFT_SYSTEM_PROMPT}\n\n## Requested template\n${templateInstructions}\n\n## Retrieved legal sources\n${context || "No uploaded legal sources are available yet."}`

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
