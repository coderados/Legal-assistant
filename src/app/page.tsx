import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
          Legal research & drafting assistant
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          Upload your legal reference books, ask questions about U.S. federal and California law,
          and generate document drafts grounded in your sources.
        </p>

        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Disclaimer:</strong> This tool is for research and drafting assistance only. It is
          not a lawyer and does not provide legal advice. Always consult a qualified, licensed
          attorney before filing or relying on any generated document.
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Link
            href="/upload"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 transition hover:border-zinc-300 hover:bg-zinc-100"
          >
            <h2 className="font-semibold">Upload sources</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Add PDFs or text files to power semantic search.
            </p>
          </Link>
          <Link
            href="/chat"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 transition hover:border-zinc-300 hover:bg-zinc-100"
          >
            <h2 className="font-semibold">Ask questions</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Chat with an AI assistant grounded in your uploaded law books.
            </p>
          </Link>
          <Link
            href="/draft"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 transition hover:border-zinc-300 hover:bg-zinc-100"
          >
            <h2 className="font-semibold">Draft documents</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Generate complaints, demand letters, contracts, and more.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
