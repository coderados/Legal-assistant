import { PDFParse } from "pdf-parse"

export async function extractText(file: File): Promise<{ text: string; type: string }> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    // @ts-expect-error — pdf-parse ships ESM named export PDFParse while @types/pdf-parse describes CJS default.
    const data = (await PDFParse(buffer)) as { text: string }
    return { text: data.text, type: "pdf" }
  }

  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
    return { text: buffer.toString("utf-8"), type: "txt" }
  }

  if (file.name.toLowerCase().endsWith(".md")) {
    return { text: buffer.toString("utf-8"), type: "md" }
  }

  throw new Error(`Unsupported file type: ${file.type || file.name}`)
}
