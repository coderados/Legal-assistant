import { getDb } from "./db"
import { createEmbedding } from "./ai"

export interface Chunk {
  id: string
  documentId: string
  content: string
  embedding: number[] | null
  metadata: Record<string, unknown>
}

export function chunkText(text: string, maxChars = 1500, overlap = 150): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length)
    const boundary = end < text.length ? findBoundary(text, end, overlap) : end
    chunks.push(text.slice(start, boundary).trim())
    // Stop once the final chunk is emitted; otherwise `boundary - overlap`
    // moves start forward by a single character and re-emits the tail as
    // dozens of near-duplicate chunks.
    if (boundary >= text.length) break
    start = Math.max(start + 1, boundary - overlap)
  }
  return chunks.filter((c) => c.length > 0)
}

function findBoundary(text: string, target: number, window: number) {
  const searchStart = Math.max(target - window, 0)
  const searchEnd = Math.min(target + window, text.length)
  const segment = text.slice(searchStart, searchEnd)
  const matches = Array.from(segment.matchAll(/\n\n|\n|\./g))
  if (matches.length === 0) return target
  const best = matches.reduce((prev, curr) =>
    Math.abs(curr.index! + searchStart - target) < Math.abs(prev.index! + searchStart - target) ? curr : prev
  )
  return best.index! + searchStart + best[0].length
}

export async function embedAndStore(
  documentId: string,
  chunks: { content: string; metadata?: Record<string, unknown> }[]
) {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO chunks (id, document_id, content, embedding, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const insert = db.transaction((rows: { id: string; content: string; embedding: number[] | null; metadata: string }[]) => {
    for (const row of rows) {
      stmt.run(
        row.id,
        documentId,
        row.content,
        row.embedding ? JSON.stringify(row.embedding) : null,
        row.metadata,
        Date.now()
      )
    }
  })

  const rows = await Promise.all(
    chunks.map(async (chunk, index) => {
      // Embeddings are best-effort: without OPENAI_API_KEY (or on an OpenAI
      // outage) the upload must still succeed. Chunks stored without an
      // embedding are found by keyword fallback at retrieval time.
      let embedding: number[] | null = null
      try {
        embedding = await createEmbedding(chunk.content)
      } catch (embeddingError) {
        if (index === 0) {
          console.warn("[rag] Embedding unavailable, storing chunks without vectors:", embeddingError)
        }
      }
      return {
        id: `${documentId}-${index}`,
        content: chunk.content,
        embedding,
        metadata: JSON.stringify(chunk.metadata ?? {}),
      }
    })
  )

  insert(rows)
  return rows.length
}

function keywordScore(query: string, content: string): number {
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3)
    )
  )
  if (terms.length === 0) return 0
  const haystack = content.toLowerCase()
  let score = 0
  for (const term of terms) {
    let index = haystack.indexOf(term)
    while (index !== -1) {
      score += 1
      index = haystack.indexOf(term, index + term.length)
    }
  }
  // Normalize by content length so longer chunks don't win by default.
  return score / Math.sqrt(content.length)
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function retrieveRelevantChunks(query: string, topK = 5): Promise<Chunk[]> {
  const parsedTopK = Number(process.env.RAG_TOP_K)
  // A malformed RAG_TOP_K (NaN, 0, negative) would silently break retrieval,
  // so fall back to the default whenever the value is not a positive integer.
  const topKValue = Number.isFinite(parsedTopK) && parsedTopK > 0 ? Math.floor(parsedTopK) : topK
  const all = getDb()
    .prepare("SELECT id, document_id, content, embedding, metadata FROM chunks")
    .all() as {
    id: string
    document_id: string
    content: string
    embedding: string | null
    metadata: string
  }[]

  if (all.length === 0) return []

  const parsed = all.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : null,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }))

  // Vector search is only possible when both the query and at least one chunk
  // have embeddings. Otherwise fall back to keyword scoring so documents
  // uploaded without OPENAI_API_KEY are still retrievable.
  let queryEmbedding: number[] | null = null
  try {
    queryEmbedding = await createEmbedding(query)
  } catch (embeddingError) {
    console.warn("[rag] Query embedding unavailable, using keyword fallback:", embeddingError)
  }
  const useVectors = queryEmbedding !== null && parsed.some((row) => row.embedding !== null)

  const scored = parsed
    .map((row) => ({
      ...row,
      score:
        useVectors && queryEmbedding
          ? row.embedding
            ? cosineSimilarity(queryEmbedding, row.embedding)
            : 0
          : keywordScore(query, row.content),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topKValue)

  return scored.map((s) => ({
    id: s.id,
    documentId: s.documentId,
    content: s.content,
    embedding: s.embedding,
    metadata: s.metadata,
  }))
}

export function listDocuments() {
  return getDb()
    .prepare(
      `SELECT d.id, d.name, d.description, d.source_type, d.created_at,
              COUNT(c.id) AS chunk_count
       FROM documents d
       LEFT JOIN chunks c ON c.document_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at DESC`
    )
    .all() as {
    id: string
    name: string
    description: string | null
    source_type: string
    created_at: number
    chunk_count: number
  }[]
}

export function deleteDocument(id: string) {
  getDb().prepare("DELETE FROM documents WHERE id = ?").run(id)
}
