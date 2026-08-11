import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/tanstack-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall,
  Search, Trash2, X, Loader2, MoreVertical, BadgeCheck, Sparkles,
} from "lucide-react";
import { getCallHistory, deleteCallLog, clearCallHistory, getOrCreateDirectConversation } from "@/lib/api.functions";
import { ProfilePreview } from "@/components/ProfilePreview";
import { AICallModal } from "@/components/AICallModal";

export const Route = createFileRoute("/calls")({
  component: CallsPage,
  head: () => ({
    meta: [
      { title: "Calls — ChatApp" },
      { name: "description", content: "Recent calls" },
    ],
  }),
});

function relativeCallTime(d: Date) {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDuration(secs: number) {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function CallsPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "missed">("all");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [previewClerkId, setPreviewClerkId] = useState<string | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any>(null);
  const [aiCallOpen, setAiCallOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = await getCallHistory({ data: { clerkUserId: userId } });
      setLogs(rows || []);
    } catch (err) {
      console.error("Failed to load call history:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter((l: any) => {
    if (tab === "missed" && !(l.status === "missed" && l.direction === "incoming")) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (l.peerProfile?.display_name || "").toLowerCase().includes(q) ||
        (l.peerProfile?.username || "").toLowerCase().includes(q);
    }
    return true;
  });

  const handleCall = async (peerClerkId: string, kind: "audio" | "video") => {
    if (!userId) return;
    try {
      // Open or create the 1:1 conversation, then route to chat where startCall happens
      const conv = await getOrCreateDirectConversation({
        data: { clerkUserId: userId, otherClerkId: peerClerkId },
      });
      navigate({
        to: "/chat/$id",
        params: { id: conv.id },
        search: { call: kind } as any,
      });
    } catch (err) {
      console.error("Failed to start call:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    setLogs((prev) => prev.filter((l) => l.id !== id));
    try { await deleteCallLog({ data: { callLogId: id, clerkUserId: userId } }); }
    catch (err) { console.error(err); load(); }
  };

  const handleClearAll = async () => {
    if (!userId) return;
    setLogs([]);
    setConfirmClear(false);
    try { await clearCallHistory({ data: { clerkUserId: userId } }); }
    catch (err) { console.error(err); load(); }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Calls</h1>
          <div className="flex gap-2 relative">
            <button
              onClick={() => setSearchOpen((s) => !s)}
              className={`rounded-full p-2 transition-colors ${searchOpen ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <button
              onClick={() => setMenuOpen((m) => !m)}
              className="rounded-full bg-secondary p-2 text-muted-foreground"
              aria-label="More"
            >
              <MoreVertical size={18} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  className="absolute right-0 top-12 z-30 rounded-xl bg-card shadow-xl ring-1 ring-border p-1 min-w-[180px]"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button
                    onClick={() => { setMenuOpen(false); setConfirmClear(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-secondary rounded-lg text-left"
                  >
                    <Trash2 size={14} /> Clear call history
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2 rounded-full bg-secondary px-3 py-2">
                <Search size={16} className="text-muted-foreground" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search by name or @handle"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-muted-foreground"><X size={14} /></button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 grid grid-cols-2 rounded-full bg-secondary p-1 text-xs">
          {(["all", "missed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full py-1.5 font-semibold capitalize transition-colors ${
                tab === t ? "bg-background text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              {t === "all" ? "All" : "Missed"}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center px-8 text-muted-foreground">
          <PhoneCall size={36} className="mb-3 opacity-60" />
          <p className="text-sm">{tab === "missed" ? "No missed calls." : "No calls yet."}</p>
          <p className="text-xs mt-1 opacity-80">Tap voice/video on any chat to start one.</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* AI Assistant pinned entry */}
        {tab === "all" && !search.trim() && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 px-4 py-3 active:bg-secondary/40 border-b border-border/40"
          >
            <div className="shrink-0 relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 via-fuchsia-500/60 to-amber-400/60">
                <Sparkles size={24} className="text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-[15px] font-medium text-foreground">AI Assistant</p>
                <BadgeCheck size={14} className="text-primary shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Voice · Powered by AI</p>
            </div>
            <button
              onClick={() => setAiCallOpen(true)}
              className="rounded-full bg-primary/15 p-2.5 text-primary"
              aria-label="Start AI voice call"
            >
              <Phone size={18} />
            </button>
          </motion.div>
        )}

        {filtered.map((l: any, i: number) => {
          const peer = l.peerProfile;
          const name = peer?.display_name || "Unknown";
          const avatar =
            peer?.avatar_url ||
            `https://api.dicebear.com/9.x/avataaars/svg?seed=${l.peerClerkId}`;
          const missed = l.status === "missed" && l.direction === "incoming";
          const rejected = l.status === "rejected";
          const peerIsAdmin = peer?.is_admin || false;
          const peerIsVerified = peer?.is_admin || peer?.verified || peer?.subscription_tier === "pro";
          const Icon =
            missed ? PhoneMissed
              : l.direction === "incoming" ? PhoneIncoming
              : PhoneOutgoing;
          const iconColor =
            missed ? "text-destructive"
              : rejected ? "text-amber-500"
              : "text-online";
          const subtitle = missed
            ? "Missed"
            : rejected
              ? "Declined"
              : l.duration_seconds
                ? fmtDuration(l.duration_seconds)
                : l.direction === "incoming" ? "Incoming" : "Outgoing";
          return (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.025, 0.3) }}
              className="flex items-center gap-3 px-4 py-3 active:bg-secondary/40"
            >
              <button
                onClick={() => { setPreviewClerkId(l.peerClerkId); setPreviewProfile(peer); }}
                className="shrink-0 rounded-full focus:outline-none"
                aria-label={`View ${name}`}
              >
                <img
                  src={avatar}
                  alt=""
                  className={`h-12 w-12 rounded-full bg-muted object-cover ring-2 ${
                    peerIsAdmin ? "ring-red-500/60" : peerIsVerified ? "ring-primary/60" : "ring-transparent"
                  }`}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className={`text-[15px] font-medium truncate ${missed ? "text-destructive" : "text-foreground"}`}>
                    {name}
                  </p>
                  {peerIsAdmin && <BadgeCheck size={13} className="text-red-500 shrink-0" />}
                  {!peerIsAdmin && peerIsVerified && <BadgeCheck size={13} className="text-primary shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <Icon size={13} className={iconColor} />
                  <span className="truncate">{subtitle} · {relativeCallTime(new Date(l.started_at))}</span>
                </div>
              </div>
              <button
                onClick={() => handleCall(l.peerClerkId, l.kind === "video" ? "video" : "audio")}
                className="rounded-full bg-secondary p-2.5 text-primary"
                aria-label={l.kind === "video" ? "Video call back" : "Voice call back"}
              >
                {l.kind === "video" ? <Video size={18} /> : <Phone size={18} />}
              </button>
              <button
                onClick={() => handleDelete(l.id)}
                className="rounded-full p-2 text-muted-foreground/60 hover:text-destructive"
                aria-label="Delete entry"
              >
                <Trash2 size={15} />
              </button>
            </motion.div>
          );
        })}
      </div>

      <ProfilePreview
        open={!!previewClerkId}
        onClose={() => setPreviewClerkId(null)}
        clerkUserId={previewClerkId}
        initialName={previewProfile?.display_name}
        initialAvatarUrl={previewProfile?.avatar_url}
        initialUsername={previewProfile?.username}
        onCall={(kind) => previewClerkId && handleCall(previewClerkId, kind)}
      />

      <AICallModal open={aiCallOpen} onClose={() => setAiCallOpen(false)} />

      {/* Clear all confirm */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setConfirmClear(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card w-full max-w-sm rounded-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[15px] font-semibold text-foreground mb-1">Clear call history?</h3>
              <p className="text-xs text-muted-foreground mb-4">This will delete all your call entries. The action can't be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmClear(false)} className="flex-1 rounded-full bg-secondary py-2 text-sm">Cancel</button>
                <button onClick={handleClearAll} className="flex-1 rounded-full bg-destructive text-destructive-foreground py-2 text-sm font-medium">Clear all</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
