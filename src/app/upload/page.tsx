"use client";

import { useEffect, useState } from "react";

interface Document {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  created_at: number;
  chunk_count: number;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDocuments() {
    try {
      const res = await fetch("/api/documents");
      const data = (await res.json()) as { documents: Document[] };
      setDocuments(data.documents ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("description", description);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Upload failed");
      } else {
        setFile(null);
        setDescription("");
        await loadDocuments();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(id: string) {
    if (!confirm("Delete this source and all its indexed chunks?")) return;
    await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadDocuments();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Legal sources</h1>
      <p className="mt-2 text-zinc-600">
        Upload PDFs or plain-text legal reference books. They will be chunked, embedded, and used
        to ground chat and drafting responses.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <label className="block text-sm font-medium">File (PDF or text)</label>
        <input
          type="file"
          accept=".pdf,.txt,.md"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm"
        />

        <label className="mt-4 block text-sm font-medium">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Black’s Law Dictionary 11th ed."
          className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />

        <button
          type="submit"
          disabled={uploading || !file}
          className="mt-4 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload and index"}
        </button>
      </form>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Indexed sources</h2>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-500">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No sources uploaded yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{doc.name}</p>
                  {doc.description && (
                    <p className="text-sm text-zinc-600">{doc.description}</p>
                  )}
                  <p className="text-xs text-zinc-500">
                    {doc.source_type.toUpperCase()} • {doc.chunk_count} chunks •{" "}
                    {new Date(doc.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteDoc(doc.id)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
