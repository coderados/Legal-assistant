"use client";

import { useState, useRef, useEffect } from "react";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionHandle {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionHandle;
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
  const [conversationMode, setConversationMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Refs that hold the live truth for the voice loop (state is async).
  const messagesRef = useRef<Message[]>(messages);
  const conversationRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null);
  const loopActiveRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Stop everything (mic + speech) when leaving the page.
  useEffect(() => {
    return () => {
      loopActiveRef.current = false;
      conversationRef.current = false;
      recognitionRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis.cancel();
    };
  }, []);

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

  // Core send: takes an explicit message list (from the ref, so the voice loop
  // never reads stale state), streams the reply, and returns the full text.
  async function sendMessages(conversation: Message[]): Promise<string> {
    setLoading(true);
    setActiveSources(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });

      if (!response.ok) {
        let message = "Sorry, something went wrong. Please try again.";
        try {
          const err = (await response.json()) as { error?: string };
          if (err.error) message = `⚠️ ${err.error}`;
        } catch {
          // Non-JSON error body; keep the generic message.
        }
        setMessages((prev) => [...prev, { role: "assistant", content: message }]);
        return "";
      }

      if (!response.body) throw new Error("Empty response body from server");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let streamError: string | null = null;
      let sources: Source[] = [];

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      // Parse SSE events with a buffer: a single TCP chunk can split a `data:`
      // line (or even a JSON payload) mid-event, so lines must be accumulated
      // across reads before being parsed.
      let buffer = "";
      const handleSseData = (data: string) => {
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as {
            content?: string;
            sources?: Source[];
            error?: string;
          };
          if (parsed.error) streamError = parsed.error;
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
      };
      const processEvents = (text: string) => {
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          handleSseData(line.slice(6));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        // Keep the last (possibly incomplete) event in the buffer.
        buffer = events.pop() ?? "";
        for (const event of events) processEvents(event);
      }
      // Flush any trailing event that was not terminated by a blank line.
      buffer += decoder.decode();
      if (buffer.trim()) processEvents(buffer);

      const finalContent = streamError
        ? assistantContent
          ? `${assistantContent}\n\n⚠️ ${streamError}`
          : `⚠️ ${streamError}`
        : assistantContent;
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: finalContent, sources };
        return next;
      });
      return finalContent;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `⚠️ ${error.message}`
          : "Sorry, something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
      return "";
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messagesRef.current, userMessage];
    setMessages(updatedMessages);
    setInput("");

    await sendMessages(updatedMessages);
  }

  // ---- Conversation mode (hands-free voice loop) ----

  // Speak the reply, resolve when done so the loop can listen again.
  function speakAndWait(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve();
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  }

  // One round: listen → transcript → send → speak reply → resolve.
  function runConversationTurn(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve();
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        alert("Voice input is not supported in this browser.");
        resolve();
        return;
      }

      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      let gotResult = false;

      recognition.onstart = () => setListening(true);
      recognition.onerror = () => setListening(false);
      recognition.onend = () => {
        setListening(false);
        // If no speech was captured, resolve so the loop can decide to retry/stop.
        if (!gotResult) resolve();
      };
      recognition.onresult = async (event) => {
        gotResult = true;
        const transcript = event.results[0][0].transcript.trim();
        if (!transcript) {
          resolve();
          return;
        }

        const userMessage: Message = { role: "user", content: transcript };
        const updatedMessages = [...messagesRef.current, userMessage];
        setMessages(updatedMessages);

        const reply = await sendMessages(updatedMessages);
        if (reply && conversationRef.current && loopActiveRef.current) {
          await speakAndWait(reply);
        }
        resolve();
      };

      try {
        recognition.start();
      } catch {
        resolve();
      }
    });
  }

  async function conversationLoop() {
    while (conversationRef.current && loopActiveRef.current) {
      // Avoid overlapping turns.
      await runConversationTurn();
    }
  }

  function startConversation() {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    setConversationMode(true);
    conversationRef.current = true;
    loopActiveRef.current = true;
    void conversationLoop();
  }

  function stopConversation() {
    conversationRef.current = false;
    loopActiveRef.current = false;
    setConversationMode(false);
    setListening(false);
    recognitionRef.current?.abort();
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
  }

  function toggleConversation() {
    if (conversationMode) stopConversation();
    else startConversation();
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
            disabled={conversationMode}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-50"
          />
          <button
            type="button"
            onClick={toggleConversation}
            aria-pressed={conversationMode}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${
              conversationMode
                ? "bg-red-600 text-white hover:bg-red-700"
                : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                conversationMode ? (listening ? "animate-pulse bg-white" : "bg-white/60") : "bg-zinc-400"
              }`}
            />
            {conversationMode ? "End conversation" : "Conversation"}
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim() || conversationMode}
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
        {conversationMode && (
          <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
            <span className={`inline-block h-2 w-2 rounded-full ${listening ? "animate-pulse bg-green-500" : "bg-zinc-300"}`} />
            {listening
              ? "Listening… speak now."
              : loading
                ? "Thinking…"
                : "Speaking reply… (or starting next turn)"}
            <span className="ml-1 text-zinc-400">Text still appears above. Click “End conversation” to stop.</span>
          </p>
        )}
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
