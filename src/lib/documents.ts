import { PDFParse } from "pdf-parse"

export async function extractText(file: File): Promise<{ text: string; type: string }> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    // pdf-parse v2 exports `PDFParse` as a class: construct it with the raw
    // bytes, then await getText() for the extracted document text.
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return { text: result.text, type: "pdf" }
    } finally {
      await parser.destroy().catch(() => {})
    }
  }

  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
    return { text: buffer.toString("utf-8"), type: "txt" }
  }

  if (file.name.toLowerCase().endsWith(".md")) {
    return { text: buffer.toString("utf-8"), type: "md" }
  }

  throw new Error(`Unsupported file type: ${file.type || file.name}`)
}
