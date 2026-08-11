import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, Volume2, VolumeX, Sparkles, Phone } from "lucide-react";
import { aiChatAssist } from "@/lib/api.functions";
import { useAuth } from "@clerk/tanstack-start";

type Message = { role: "user" | "ai"; text: string };

interface AICallModalProps {
  open: boolean;
  onClose: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function AICallModal({ open, onClose }: AICallModalProps) {
  const { userId } = useAuth();
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("Hello! I'm your AI assistant. Tap the mic to start talking.");
  const [muted, setMuted] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const historyRef = useRef<Message[]>([]);
  // Keep ref in sync with state so sendToAI always has the latest snapshot
  // without needing `history` in its dependency array (which causes a new fn
  // reference on every AI reply, in turn recreating startListening on every turn).
  const pushHistory = (msgs: Message[]) => {
    historyRef.current = msgs;
    setHistory(msgs);
  };
  const [duration, setDuration] = useState(0);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startedRef = useRef(false);
  // Holds the latest transcript synchronously so recognition.onend isn't
  // caught by the stale-closure problem (setTranscript is async).
  const liveTranscriptRef = useRef("");

  useEffect(() => {
    if (open) {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAll();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [open]);

  function fmtDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  const stopAll = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setStatus("idle");
    setTranscript("");
    startedRef.current = false;
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis || speakerOff) {
      setStatus("idle");
      return;
    }
    window.speechSynthesis.cancel();
    setStatus("speaking");
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utter.voice = preferred;
    utter.onend = () => setStatus("idle");
    utter.onerror = () => setStatus("idle");
    window.speechSynthesis.speak(utter);
  }, [speakerOff]);

  const sendToAI = useCallback(async (text: string) => {
    if (!text.trim()) { setStatus("idle"); return; }
    setStatus("thinking");
    const userMsg: Message = { role: "user", text };
    const nextHistory = [...historyRef.current, userMsg];
    pushHistory(nextHistory);

    const recentMessages = nextHistory.slice(-10).map((m) => ({
      sender: m.role === "user" ? "User" : "AI",
      text: m.text,
    }));

    try {
      const res = await aiChatAssist({
        data: {
          clerkUserId: userId || "anon",
          question: text,
          recentMessages,
        },
      });
      const reply = (res as any)?.reply || "I'm having trouble responding right now.";
      setAiText(reply);
      pushHistory([...nextHistory, { role: "ai", text: reply }]);
      speak(reply);
    } catch {
      const errMsg = "Sorry, I couldn't connect to the AI right now.";
      setAiText(errMsg);
      speak(errMsg);
    }
  }, [userId, speak]);

  const startListening = useCallback(() => {
    if (muted) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setAiText("Speech recognition isn't supported in this browser. Try Chrome.");
      return;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => { setStatus("listening"); setTranscript(""); liveTranscriptRef.current = ""; };
    recognition.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join("");
      liveTranscriptRef.current = t;
      setTranscript(t);
    };
    recognition.onend = () => {
      setStatus("thinking");
      const t = liveTranscriptRef.current;
      liveTranscriptRef.current = "";
      if (t.trim()) sendToAI(t.trim());
      else setStatus("idle");
    };
    recognition.onerror = () => { setStatus("idle"); setTranscript(""); };
    recognition.start();
  }, [muted, sendToAI]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
  }, []);

  const handleClose = () => {
    stopAll();
    pushHistory([]);
    setAiText("Hello! I'm your AI assistant. Tap the mic to start talking.");
    onClose();
  };

  const pulseColors: Record<string, string> = {
    idle: "bg-primary/20",
    listening: "bg-green-500/25",
    thinking: "bg-amber-500/20",
    speaking: "bg-primary/25",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-between bg-[#0e1621] pb-safe pt-safe"
        >
          {/* Header */}
          <div className="flex w-full items-center justify-between px-5 pt-6">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <span className="text-sm font-semibold text-primary">AI Assistant</span>
            </div>
            <span className="text-sm font-mono text-muted-foreground tabular-nums">{fmtDuration(duration)}</span>
          </div>

          {/* AI Avatar + Pulse rings */}
          <div className="flex flex-col items-center gap-6 flex-1 justify-center">
            <div className="relative flex items-center justify-center">
              {(status === "listening" || status === "speaking") && (
                <>
                  <span className={`absolute h-40 w-40 rounded-full ${pulseColors[status]} animate-ping opacity-60`} />
                  <span className={`absolute h-32 w-32 rounded-full ${pulseColors[status]} animate-pulse`} />
                </>
              )}
              <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 via-fuchsia-500/60 to-amber-400/60 shadow-2xl">
                <Sparkles size={44} className="text-white drop-shadow" />
              </div>
            </div>

            {/* Status text */}
            <div className="text-center px-8 space-y-2">
              <p className="text-base font-semibold text-foreground">
                {status === "listening" && "Listening…"}
                {status === "thinking" && "Thinking…"}
                {status === "speaking" && "Speaking…"}
                {status === "idle" && "AI Assistant"}
              </p>
              {status === "listening" && transcript && (
                <p className="text-sm text-muted-foreground italic">"{transcript}"</p>
              )}
              {(status === "idle" || status === "speaking") && (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{aiText}</p>
              )}
              {status === "thinking" && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              )}
            </div>

            {/* Recent exchange pill */}
            {history.length > 0 && (
              <div className="mx-6 rounded-2xl bg-secondary/40 p-3 max-w-xs w-full max-h-[120px] overflow-y-auto scrollbar-hide">
                {history.slice(-4).map((m, i) => (
                  <p key={i} className={`text-[12px] leading-snug mb-1 last:mb-0 ${m.role === "user" ? "text-foreground/80" : "text-primary/90"}`}>
                    <span className="font-semibold">{m.role === "user" ? "You: " : "AI: "}</span>
                    {m.text}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex w-full items-center justify-around px-8 pb-10">
            {/* Mute */}
            <button
              onClick={() => { setMuted((m) => !m); if (!muted && recognitionRef.current) recognitionRef.current.abort(); }}
              className={`flex h-14 w-14 flex-col items-center justify-center rounded-full transition-colors gap-1 ${muted ? "bg-muted-foreground/30" : "bg-secondary"}`}
            >
              {muted ? <MicOff size={22} className="text-muted-foreground" /> : <Mic size={22} className="text-foreground" />}
              <span className="text-[10px] text-muted-foreground">{muted ? "Unmute" : "Mute"}</span>
            </button>

            {/* Main Mic button */}
            <button
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={stopListening}
              disabled={status === "thinking" || muted}
              className={`flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-all ${
                status === "listening"
                  ? "bg-green-500 scale-110"
                  : status === "thinking"
                  ? "bg-amber-500/60 cursor-not-allowed"
                  : "bg-primary active:scale-95"
              }`}
              aria-label={status === "listening" ? "Release to send" : "Hold to speak"}
            >
              <Mic size={32} className="text-white" />
            </button>

            {/* Speaker */}
            <button
              onClick={() => {
                setSpeakerOff((s) => !s);
                if (!speakerOff && window.speechSynthesis) window.speechSynthesis.cancel();
              }}
              className={`flex h-14 w-14 flex-col items-center justify-center rounded-full transition-colors gap-1 ${speakerOff ? "bg-muted-foreground/30" : "bg-secondary"}`}
            >
              {speakerOff ? <VolumeX size={22} className="text-muted-foreground" /> : <Volume2 size={22} className="text-foreground" />}
              <span className="text-[10px] text-muted-foreground">{speakerOff ? "Unmute" : "Speaker"}</span>
            </button>
          </div>

          {/* End call */}
          <div className="pb-8 flex flex-col items-center gap-1">
            <button
              onClick={handleClose}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive shadow-xl active:scale-95 transition-transform"
              aria-label="End call"
            >
              <Phone size={26} className="text-white rotate-[135deg]" />
            </button>
            <span className="text-[11px] text-muted-foreground mt-1">End call</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
