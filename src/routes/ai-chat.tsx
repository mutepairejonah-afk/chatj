import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Send, Loader2, Trash2, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { aiChatAssist } from "@/lib/api-client";
import { usePremium } from "@/hooks/usePremium";

export const Route = createFileRoute("/ai-chat")({
  component: AIChatPage,
  head: () => ({ meta: [{ title: "AI Assistant — ChatApp" }] }),
});

interface AIMsg {
  id: string;
  role: "user" | "ai";
  text: string;
  ts: Date;
}

const STORAGE_KEY = "ai_chat_history_v1";

const SUGGESTIONS = [
  "Help me write a message to a friend",
  "Translate something for me",
  "Summarize a topic",
  "Give me a fun fact",
];

function AIChatPage() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { isPro } = usePremium();

  const [messages, setMessages] = useState<AIMsg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return (JSON.parse(raw) as any[]).map((m) => ({
          ...m,
          ts: new Date(m.ts),
        }));
      }
    } catch (err) {
      console.warn("Failed to load AI chat history from localStorage:", err);
    }
    return [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-80)));
    } catch (err) {
      console.warn("Failed to persist AI chat history:", err);
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || loading || !userId) return;
    setInput("");

    const userMsg: AIMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: question,
      ts: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const ctx = messages
        .slice(-10)
        .map((m) => ({ sender: m.role === "user" ? "User" : "AI", text: m.text }));
      const { reply } = await aiChatAssist({
        data: { clerkUserId: userId, question, recentMessages: ctx },
      });
      setMessages((prev) => [
        ...prev,
        { id: `ai-${Date.now()}`, role: "ai", text: reply, ts: new Date() },
      ]);
    } catch (err) {
      console.error("[AI Chat] request failed:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Sorry, I couldn't respond right now. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: "ai",
          text: message,
          ts: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, userId, messages]);

  const clearHistory = () => {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { console.warn("Failed to clear AI chat history:", err); }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header — matches chat.$id style */}
      <header className="flex items-center gap-3 px-3 pb-2 pt-[max(env(safe-area-inset-top),12px)] bg-card border-b border-border">
        <button
          onClick={() => navigate({ to: "/" })}
          className="rounded-full bg-secondary p-2 text-muted-foreground shrink-0"
        >
          <ArrowLeft size={18} />
        </button>

        {/* AI Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-md">
          <Sparkles size={19} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-foreground leading-tight">AI Assistant</p>
          <p className="text-[11px] text-violet-500 font-medium">
            Powered by AI{isPro ? " Pro" : ""}
          </p>
        </div>

        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
            title="Clear conversation"
          >
            <Trash2 size={17} />
          </button>
        )}
      </header>

      {/* Messages list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4 space-y-3"
      >
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-5 text-center py-10"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
              <Sparkles size={34} className="text-violet-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">AI Assistant</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-[260px]">
                Ask me anything — answers, ideas, translations, summaries, and more.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "ai" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 mb-0.5">
                  <Sparkles size={12} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-border text-foreground rounded-bl-sm"
                }`}
              >
                {msg.role === "ai" && (
                  <span className="text-[10px] text-violet-500 font-semibold block mb-0.5">
                    AI Assistant
                  </span>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                <span className="text-[10px] opacity-50 block text-right mt-1">
                  {msg.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-end gap-2 justify-start"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600">
              <Sparkles size={12} className="text-white" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-2 w-2 rounded-full bg-violet-500"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Input bar — same style as chat.$id */}
      <div className="px-3 pb-[max(env(safe-area-inset-bottom),8px)] py-2 bg-card border-t border-border">
        <div className="flex items-center gap-2">
          <div
            className={`flex-1 rounded-2xl px-4 py-2.5 bg-secondary transition-all duration-200 ${
              loading ? "opacity-70" : ""
            }`}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask AI anything…"
              className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
              disabled={loading}
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md shadow-violet-500/30 disabled:opacity-40 transition-opacity"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
