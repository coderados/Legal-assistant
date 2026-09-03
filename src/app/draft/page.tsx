"use client";

import { useState } from "react";

const TEMPLATES = [
  { value: "demand-letter", label: "Demand letter" },
  { value: "motion-to-dismiss", label: "Motion to dismiss" },
  { value: "complaint", label: "Civil complaint (California)" },
  { value: "contract", label: "Services contract" },
  { value: "cease-desist", label: "Cease and desist letter" },
];

const CUSTOM_TEMPLATE_VALUE = "custom";

export default function DraftPage() {
  const [template, setTemplate] = useState(TEMPLATES[0].value);
  const [customTitle, setCustomTitle] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [facts, setFacts] = useState("");
  const [draft, setDraft] = useState("");
  const [sources, setSources] = useState<{ index: number; source: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const isCustom = template === CUSTOM_TEMPLATE_VALUE;

  function selectCustomTemplate() {
    setTemplate(CUSTOM_TEMPLATE_VALUE);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!facts.trim()) return;
    if (isCustom && !customInstructions.trim()) return;

    setLoading(true);
    setDraft("");
    setSources([]);
    setError(null);

    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          facts,
          ...(isCustom
            ? { customTitle, customInstructions }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        draft?: string;
        sources?: { index: number; source: string; content: string }[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Draft generation failed");
      } else {
        setDraft(data.draft ?? "");
        setSources(data.sources ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft generation failed");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(draft);
  }

  function readAloud() {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(draft);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function stopReading() {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Document drafting</h1>
      <p className="mt-2 text-zinc-600">
        Describe the facts and choose a template. The draft will be grounded in your uploaded legal
        sources when available.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <label className="block text-sm font-medium">Template</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTemplate(t.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                template === t.value
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={selectCustomTemplate}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              isCustom
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-dashed border-indigo-400 bg-white text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            + Custom document
          </button>
        </div>

        {isCustom && (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <label className="block text-sm font-medium">Document title / type</label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g. Non-disclosure agreement, Power of attorney, Lease addendum…"
              className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />

            <label className="mt-4 block text-sm font-medium">Drafting instructions</label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={4}
              placeholder="Describe the structure and content you want: required sections, clauses, tone, governing law, parties, etc."
              className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <p className="mt-2 text-xs text-indigo-700">
              Use this to draft any legal document not covered by the templates above.
            </p>
          </div>
        )}

        <label className="mt-4 block text-sm font-medium">Facts & context</label>
        <textarea
          value={facts}
          onChange={(e) => setFacts(e.target.value)}
          rows={8}
          placeholder="Describe the parties, dispute, injuries, relief sought, and any relevant dates or statutes…"
          className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />

        <button
          type="submit"
          disabled={loading || !facts.trim() || (isCustom && !customInstructions.trim())}
          className="mt-4 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Drafting…" : "Generate draft"}
        </button>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>

      {draft && (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Draft</h2>
            <div className="flex gap-2">
              <button
                onClick={speaking ? stopReading : readAloud}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                {speaking ? "Stop voice" : "Read aloud"}
              </button>
              <button
                onClick={copyToClipboard}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                Copy
              </button>
            </div>
          </div>
          <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-900">
            {draft}
          </pre>

          {sources.length > 0 && (
            <div className="mt-6 border-t border-zinc-200 pt-4">
              <h3 className="text-sm font-semibold">Sources used</h3>
              <ul className="mt-2 space-y-2">
                {sources.map((source) => (
                  <li key={source.index} className="text-sm text-zinc-700">
                    <span className="font-medium">[{source.index}] {source.source}</span>
                    <p className="text-zinc-600">{source.content}…</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
