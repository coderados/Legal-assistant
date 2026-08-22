import { NextRequest, NextResponse } from "next/server"
import { v4 as uuid } from "uuid"
import { db } from "@/lib/db"
import { extractText } from "@/lib/documents"
import { chunkText, embedAndStore } from "@/lib/rag"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const description = (formData.get("description") as string) ?? ""

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const { text, type } = await extractText(file)
    if (text.trim().length === 0) {
      return NextResponse.json({ error: "No extractable text found in file" }, { status: 400 })
    }

    const documentId = uuid()
    const now = Date.now()

    db.prepare(
      `INSERT INTO documents (id, name, description, source_type, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(documentId, file.name, description, type, now)

    const chunks = chunkText(text).map((content, index) => ({
      content,
      metadata: { index, source: file.name },
    }))

    await embedAndStore(documentId, chunks)

    return NextResponse.json({
      id: documentId,
      name: file.name,
      chunks: chunks.length,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    )
  }
}
