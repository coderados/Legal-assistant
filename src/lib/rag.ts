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
    start = Math.max(start + 1, boundary - overlap)
    if (start >= text.length) break
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

  const insert = db.transaction((rows: { id: string; content: string; embedding: number[]; metadata: string }[]) => {
    for (const row of rows) {
      stmt.run(row.id, documentId, row.content, JSON.stringify(row.embedding), row.metadata, Date.now())
    }
  })

  const rows = await Promise.all(
    chunks.map(async (chunk, index) => {
      const embedding = await createEmbedding(chunk.content)
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
  const topKValue = Number(process.env.RAG_TOP_K ?? topK)
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

  const queryEmbedding = await createEmbedding(query)

  const scored = all
    .map((row) => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : null,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      score: row.embedding ? cosineSimilarity(queryEmbedding, JSON.parse(row.embedding) as number[]) : 0,
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
