"use client";

import { useState, useRef, useEffect } from "react";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onresult: ((event: SpeechRecognitionEvent) => void) | null;
      start(): void;
    };
    webkitSpeechRecognition?: Window["SpeechRecognition"];
  }
}

interface Source {
  index: number;
  source: string;
  content: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello. I can help you research U.S. federal and California legal topics and answer questions based on your uploaded sources. Remember, I am not a lawyer and this is not legal advice.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSources, setActiveSources] = useState<Source[] | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function speak(text: string, index: number) {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    synth.speak(utterance);
  }

  function stopSpeaking() {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeakingIndex(null);
  }

  function startListening() {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.start();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setActiveSources(null);

    const updatedMessages = [...messages, userMessage];
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: updatedMessages }),
    });

    if (!response.ok || !response.body) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
      setLoading(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";
    let sources: Source[] = [];

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as {
            content?: string;
            sources?: Source[];
          };
          if (parsed.sources) {
            sources = parsed.sources;
            setActiveSources(parsed.sources);
          }
          if (parsed.content) {
            assistantContent += parsed.content;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: assistantContent, sources };
              return next;
            });
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col gap-4 px-4 py-6 lg:flex-row">
      <div className="flex flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`group max-w-[90%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                message.role === "user"
                  ? "ml-auto bg-zinc-900 text-white"
                  : "mr-auto bg-zinc-100 text-zinc-900"
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.role === "assistant" && message.content && (
                <button
                  onClick={() =>
                    speakingIndex === index ? stopSpeaking() : speak(message.content, index)
                  }
                  className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                >
                  {speakingIndex === index ? "Stop voice" : "Read aloud"}
                </button>
              )}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 border-t border-zinc-300 pt-2">
                  <p className="text-xs font-semibold text-zinc-600">Cited sources</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {message.sources.map((source) => (
                      <button
                        key={source.index}
                        onClick={() => setActiveSources(message.sources ?? null)}
                        className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-700 shadow-sm hover:bg-zinc-50"
                      >
                        [{source.index}] {source.source}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === "user" && (
            <div className="mr-auto max-w-[85%] rounded-2xl bg-zinc-100 px-5 py-3 text-sm text-zinc-500">
              Retrieving sources and drafting answer…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a legal question…"
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="button"
            onClick={startListening}
            disabled={listening}
            className="rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {listening ? "Listening…" : "Voice"}
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>

      {activeSources && (
        <aside className="lg:w-80 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Retrieved sources</h2>
            <button
              onClick={() => setActiveSources(null)}
              className="text-sm text-zinc-500 hover:text-zinc-800"
            >
              Close
            </button>
          </div>
          <ul className="mt-4 space-y-4">
            {activeSources.map((source) => (
              <li key={source.index} className="text-sm">
                <p className="font-medium text-zinc-900">
                  [{source.index}] {source.source}
                </p>
                <p className="mt-1 text-zinc-600">{source.content}…</p>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
