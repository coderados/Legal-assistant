import { NextResponse } from "next/server"
import { listDocuments, deleteDocument } from "@/lib/rag"

export async function GET() {
  try {
    const docs = listDocuments()
    return NextResponse.json({ documents: docs })
  } catch (error) {
    console.error("Documents list error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list documents" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }
    deleteDocument(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Document delete error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete document" },
      { status: 500 }
    )
  }
}
