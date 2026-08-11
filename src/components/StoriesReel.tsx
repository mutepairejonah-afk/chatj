import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { Plus, X, Image as ImageIcon, Type, Loader2, Trash2, Eye, Send, ChevronDown, Video } from "lucide-react";
import {
  getStories, createStory, uploadStoryMedia, markStoryViewed, deleteStory,
  getStoryViewers, getStoryViewCounts, getOrCreateDirectConversation, sendMessage,
} from "@/lib/api-client";

import { getSocket } from "@/lib/socket";

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v|ogv)(\?|$)/i.test(url);
}

const STORY_GRADIENTS = [
  "from-pink-500 via-fuchsia-500 to-purple-600",
  "from-amber-400 via-orange-500 to-rose-500",
  "from-sky-400 via-cyan-500 to-emerald-500",
  "from-indigo-500 via-violet-500 to-fuchsia-500",
  "from-rose-400 via-red-500 to-orange-500",
  "from-emerald-400 via-teal-500 to-sky-500",
];

const QUICK_REACTIONS = ["❤️", "😍", "😂", "😮", "👏", "🔥"];

function pickGradient(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return STORY_GRADIENTS[h % STORY_GRADIENTS.length];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function timeLeft(expires: string) {
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h left`;
  return `${m}m left`;
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STORY_DURATION_MS = 5000;

export function StoriesReel() {
  const { userId } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await getStories({ data: { clerkUserId: userId } });
      setGroups(res?.groups || []);
    } catch (err) {
      console.error("Failed to load stories:", err);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const myGroup = groups.find((g) => g.isMine);
  const myStoryCount = myGroup?.stories?.length || 0;

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
        {/* My story / add button */}
        <button
          onClick={() => {
            if (myGroup && myGroup.stories.length > 0) {
              setViewerIdx(groups.findIndex((g) => g.isMine));
            } else {
              setComposerOpen(true);
            }
          }}
          className="flex flex-col items-center gap-1 shrink-0 focus:outline-none"
        >
          <div className="relative">
            <div className={`p-[2px] rounded-full ${
              myStoryCount > 0
                ? "bg-gradient-to-tr from-primary via-fuchsia-500 to-amber-400"
                : "bg-transparent"
            }`}>
              <div className={`rounded-full ${myStoryCount > 0 ? "bg-background p-[2px]" : ""}`}>
                <div className="flex h-14 w-14 items-center justify-center rounded-full overflow-hidden bg-secondary">
                  {myGroup?.profile?.avatar_url ? (
                    <img src={myGroup.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl text-muted-foreground">👤</span>
                  )}
                </div>
              </div>
            </div>
            <span
              onClick={(e) => { e.stopPropagation(); setComposerOpen(true); }}
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground border-2 border-background cursor-pointer z-10"
            >
              <Plus size={11} strokeWidth={3} />
            </span>
            {myStoryCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground border border-background z-10">
                {myStoryCount}
              </span>
            )}
          </div>
          <span className="text-[11px] text-foreground font-medium">
            {myStoryCount > 0 ? `My story` : "Add story"}
          </span>
        </button>

        {loading && (
          <div className="flex items-center gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                <div className="h-16 w-16 rounded-full bg-secondary animate-pulse" />
                <div className="h-3 w-12 bg-secondary rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {!loading && groups
          .filter((g) => !g.isMine)
          .map((g) => {
            const idx = groups.indexOf(g);
            const name = g.profile?.display_name || "User";
            const unseenCount = g.stories.filter((s: any) => !s.seen).length;
            return (
              <button
                key={g.clerkUserId}
                onClick={() => setViewerIdx(idx)}
                className="flex flex-col items-center gap-1 shrink-0 focus:outline-none"
              >
                <div className="relative">
                  <div className={`p-[2px] rounded-full ${
                    g.allSeen
                      ? "bg-muted"
                      : "bg-gradient-to-tr from-primary via-fuchsia-500 to-amber-400"
                  }`}>
                    <div className="rounded-full bg-background p-[2px]">
                      <img
                        src={g.profile?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${g.clerkUserId}`}
                        alt={name}
                        className="h-13 w-13 h-[52px] w-[52px] rounded-full object-cover bg-muted"
                      />
                    </div>
                  </div>
                  {!g.allSeen && unseenCount > 1 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground border border-background">
                      {unseenCount}
                    </span>
                  )}
                  {(g.profile?.is_admin || g.profile?.verified || g.profile?.subscription_tier === "pro") && (
                    <span className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-background z-10">
                      <svg viewBox="0 0 24 24" fill="none" className={`h-3.5 w-3.5 ${g.profile?.is_admin ? "text-red-500" : "text-primary"}`} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                      </svg>
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-foreground max-w-[64px] truncate">{name}</span>
              </button>
            );
          })}
      </div>

      {composerOpen && userId && (
        <StoryComposer
          clerkUserId={userId}
          onClose={() => setComposerOpen(false)}
          onPosted={() => { setComposerOpen(false); load(); }}
        />
      )}

      {viewerIdx !== null && (
        <StoryViewer
          groups={groups}
          startIndex={viewerIdx}
          myClerkId={userId || ""}
          onClose={() => { setViewerIdx(null); load(); }}
          onDeleted={() => { setViewerIdx(null); load(); }}
          onStoryViewed={(viewedClerkUserId: string) => {
            setGroups((prev) =>
              prev.map((g) => {
                if (g.clerkUserId !== viewedClerkUserId) return g;
                const updatedStories = g.stories.map((s: any) => ({ ...s, seen: true }));
                return { ...g, stories: updatedStories, allSeen: true };
              })
            );
          }}
        />
      )}
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────
function StoryComposer({
  clerkUserId, onClose, onPosted,
}: {
  clerkUserId: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [mode, setMode] = useState<"text" | "image" | "video">("text");
  const [text, setText] = useState("");
  const [bg, setBg] = useState(STORY_GRADIENTS[0]);
  const [media, setMedia] = useState<{ file: File; url: string; type: "image" | "video" } | null>(null);
  const [posting, setPosting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const onImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 10 * 1024 * 1024) { alert("Image must be under 10MB"); return; }
    if (media) URL.revokeObjectURL(media.url);
    setMedia({ file: f, url: URL.createObjectURL(f), type: "image" });
    setMode("image");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const onVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("video/")) return;
    if (f.size > 100 * 1024 * 1024) { alert("Video must be under 100MB"); return; }
    if (media) URL.revokeObjectURL(media.url);
    setMedia({ file: f, url: URL.createObjectURL(f), type: "video" });
    setMode("video");
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const clearMedia = () => {
    if (media) { URL.revokeObjectURL(media.url); setMedia(null); }
  };

  const canSubmit = mode === "text" ? !!text.trim() : !!media;

  const submit = async () => {
    if (!canSubmit) return;
    setPosting(true);
    try {
      let imageUrl: string | undefined;
      if (media) {
        const b64 = await fileToBase64(media.file);
        const up = await uploadStoryMedia({
          data: {
            clerkUserId,
            fileName: media.file.name,
            fileBase64: b64,
            contentType: media.file.type,
          },
        });
        imageUrl = up.publicUrl;
      }
      await createStory({
        data: {
          clerkUserId,
          text: text.trim() || undefined,
          imageUrl,
          backgroundColor: mode === "text" ? bg : undefined,
        },
      });
      clearMedia();
      onPosted();
    } catch (err: any) {
      console.error("Failed to post story:", err);
      alert(err?.message || "Failed to post story");
    } finally {
      setPosting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => !posting && onClose()}
      >
        <motion.div
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="w-full max-w-md rounded-t-3xl bg-card overflow-hidden flex flex-col max-h-[96dvh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <button onClick={() => !posting && onClose()} className="p-1 text-muted-foreground"><X size={20} /></button>
            <h3 className="font-semibold text-foreground">New Story</h3>
            <button
              onClick={submit}
              disabled={posting || !canSubmit}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 flex items-center gap-1.5"
            >
              {posting ? <Loader2 size={14} className="animate-spin" /> : <><Send size={13} /> Share</>}
            </button>
          </div>

          {/* Mode tabs */}
          <div className="grid grid-cols-3 gap-1 mx-3 mt-3 mb-2 p-1 bg-secondary rounded-full text-xs">
            <button
              onClick={() => setMode("text")}
              className={`rounded-full py-1.5 font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === "text" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Type size={13} /> Text
            </button>
            <button
              onClick={() => { imageInputRef.current?.click(); }}
              className={`rounded-full py-1.5 font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === "image" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <ImageIcon size={13} /> Photo
            </button>
            <button
              onClick={() => { videoInputRef.current?.click(); }}
              className={`rounded-full py-1.5 font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === "video" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Video size={13} /> Video
            </button>
          </div>

          {/* Hidden file inputs */}
          <input ref={imageInputRef} type="file" accept="image/*" onChange={onImageFile} className="hidden" />
          <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoFile} className="hidden" />

          <div className="overflow-y-auto">
            {mode === "text" ? (
              <div className="px-3 pb-4 flex flex-col gap-3">
                <div className={`aspect-[9/14] max-h-[400px] rounded-2xl bg-gradient-to-br ${bg} flex items-center justify-center p-6`}>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type your story…"
                    maxLength={500}
                    rows={5}
                    className="w-full resize-none bg-transparent text-white text-2xl font-bold text-center placeholder:text-white/50 outline-none"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {STORY_GRADIENTS.map((g) => (
                    <button
                      key={g}
                      onClick={() => setBg(g)}
                      className={`shrink-0 h-9 w-9 rounded-full bg-gradient-to-br ${g} transition-transform ${bg === g ? "ring-2 ring-foreground ring-offset-2 ring-offset-card scale-110" : "scale-100"}`}
                      aria-label="Pick background"
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground text-right">{text.length}/500</p>
              </div>
            ) : (
              <div className="px-3 pb-4 flex flex-col gap-3">
                {media ? (
                  <div className="relative">
                    {media.type === "video" ? (
                      <video src={media.url} className="w-full max-h-[400px] object-contain rounded-2xl bg-black" muted playsInline controls />
                    ) : (
                      <img src={media.url} alt="preview" className="w-full max-h-[400px] object-contain rounded-2xl bg-black" />
                    )}
                    <button
                      onClick={clearMedia}
                      className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm"
                    >
                      <X size={16} />
                    </button>
                    {media.type === "video" && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white font-medium flex items-center gap-1">
                        <Video size={10} /> Video
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => mode === "video" ? videoInputRef.current?.click() : imageInputRef.current?.click()}
                    className="aspect-[9/14] max-h-[400px] rounded-2xl bg-secondary flex flex-col items-center justify-center gap-3 text-muted-foreground border-2 border-dashed border-border hover:border-primary/50 transition-colors"
                  >
                    {mode === "video" ? <Video size={36} /> : <ImageIcon size={36} />}
                    <span className="text-sm font-medium">Tap to choose a {mode === "video" ? "video" : "photo"}</span>
                    <span className="text-xs text-muted-foreground/60">{mode === "video" ? "Up to 100MB" : "Up to 10MB"}</span>
                  </button>
                )}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Add a caption (optional)…"
                  maxLength={500}
                  rows={2}
                  className="w-full resize-none rounded-xl bg-secondary p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Viewer ──────────────────────────────────────────────────────────────
function StoryViewer({
  groups, startIndex, myClerkId, onClose, onDeleted, onStoryViewed,
}: {
  groups: any[];
  startIndex: number;
  myClerkId: string;
  onClose: () => void;
  onDeleted: () => void;
  onStoryViewed?: (clerkUserId: string) => void;
}) {
  const navigate = useNavigate();
  const [groupIdx, setGroupIdx] = useState(startIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState(0); // -1 back, 1 forward
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersData, setViewersData] = useState<{ viewers: any[]; count: number } | null>(null);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const startedAt = useRef<number>(Date.now());
  const elapsedBefore = useRef(0);
  const rafRef = useRef<number | null>(null);

  const group = groups[groupIdx];
  const story = group?.stories?.[storyIdx];
  const isMine = group?.isMine;

  // Load view counts for own stories
  useEffect(() => {
    if (!isMine || !group?.stories?.length || !myClerkId) return;
    const ids = group.stories.map((s: any) => s.id);
    getStoryViewCounts({ data: { storyIds: ids, clerkUserId: myClerkId } })
      .then((counts) => setViewCounts(counts as Record<string, number>))
      .catch(() => {});
  }, [isMine, group?.clerkUserId, myClerkId]);

  const advance = useCallback(() => {
    if (!group) return;
    setDirection(1);
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx(storyIdx + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(groupIdx + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [group, storyIdx, groupIdx, groups.length, onClose]);

  const goBack = useCallback(() => {
    setDirection(-1);
    if (storyIdx > 0) {
      setStoryIdx(storyIdx - 1);
    } else if (groupIdx > 0) {
      const prev = groups[groupIdx - 1];
      setGroupIdx(groupIdx - 1);
      setStoryIdx(prev.stories.length - 1);
    }
  }, [storyIdx, groupIdx, groups]);

  // Reset progress on story change
  useEffect(() => {
    setProgress(0);
    elapsedBefore.current = 0;
    startedAt.current = Date.now();
    setConfirmDelete(false);
    setViewersOpen(false);
  }, [groupIdx, storyIdx]);

  // Mark viewed + optimistically update ring in parent
  useEffect(() => {
    if (!story?.id || !myClerkId || story.clerk_user_id === myClerkId) return;
    markStoryViewed({ data: { storyId: story.id, clerkUserId: myClerkId } }).catch(() => {});
    // Let parent know this group's stories are being viewed so it turns the ring gray
    if (group?.clerkUserId) {
      onStoryViewed?.(group.clerkUserId);
    }
  }, [story?.id, myClerkId, story?.clerk_user_id, group?.clerkUserId]);

  // Pause when typing reply
  const isReplying = document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT";

  // Animation frame progress loop
  useEffect(() => {
    const shouldPause = paused || viewersOpen || confirmDelete;
    if (shouldPause) {
      elapsedBefore.current += Date.now() - startedAt.current;
      startedAt.current = Date.now();
      return;
    }
    startedAt.current = Date.now();
    const tick = () => {
      const elapsed = elapsedBefore.current + (Date.now() - startedAt.current);
      const p = Math.min(elapsed / STORY_DURATION_MS, 1);
      setProgress(p);
      if (p >= 1) {
        advance();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [paused, advance, groupIdx, storyIdx, viewersOpen, confirmDelete]);

  const openViewers = async () => {
    if (!story?.id || !myClerkId) return;
    setViewersOpen(true);
    setViewersLoading(true);
    try {
      const result = await getStoryViewers({ data: { storyId: story.id, clerkUserId: myClerkId } });
      setViewersData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setViewersLoading(false);
    }
  };

  const sendReaction = async (emoji: string) => {
    if (!myClerkId || !group?.clerkUserId) return;
    setReplyText(emoji);
    await sendReply(emoji);
  };

  const sendReply = async (text: string) => {
    const msg = text.trim();
    if (!msg || !myClerkId || !group?.clerkUserId) return;
    setReplySending(true);
    try {
      const conv = await getOrCreateDirectConversation({
        data: { clerkUserId: myClerkId, otherClerkId: group.clerkUserId },
      });
      if (conv?.id) {
        const socket = getSocket(myClerkId);
        const tempId = `temp-${Date.now()}`;
        await sendMessage({
          data: {
            conversationId: conv.id,
            clerkUserId: myClerkId,
            text: msg,
          },
        });
        socket?.emit("message:new", { conversationId: conv.id, fromClerkId: myClerkId });
        setReplyText("");
      }
    } catch (err: any) {
      console.error("Reply failed:", err);
    } finally {
      setReplySending(false);
    }
  };

  const handleDelete = async () => {
    if (!story?.id || !myClerkId) return;
    try {
      await deleteStory({ data: { storyId: story.id, clerkUserId: myClerkId } });
      onDeleted();
    } catch (err) {
      console.error(err);
    }
  };

  if (!story || !group) return null;

  const viewCount = story?.id ? (viewCounts[story.id] || 0) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none"
      >
        <motion.div
          key={`${groupIdx}-${storyIdx}`}
          initial={{ x: direction >= 0 ? "6%" : "-6%", opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction >= 0 ? "-6%" : "6%", opacity: 0.6 }}
          transition={{ type: "tween", duration: 0.18 }}
          className="relative w-full max-w-md h-full max-h-[100dvh] flex flex-col overflow-hidden"
        >
          {/* Progress bars */}
          <div className="absolute top-0 left-0 right-0 z-30 px-2 pt-2 pb-1 flex gap-1">
            {group.stories.map((_: any, i: number) => (
              <div key={i} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white rounded-full"
                  style={{
                    width: i < storyIdx ? "100%" : i === storyIdx ? `${progress * 100}%` : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 px-3 pt-7 pb-2 flex items-center gap-2.5 bg-gradient-to-b from-black/60 to-transparent">
            <img
              src={group.profile?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${group.clerkUserId}`}
              alt=""
              className="h-8 w-8 rounded-full bg-muted object-cover ring-1 ring-white/30"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate drop-shadow">
                {isMine ? "Your story" : (group.profile?.display_name || "User")}
              </p>
              <p className="text-white/70 text-[11px]">{timeLeft(story.expires_at)}</p>
            </div>
            {isMine && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2 text-white/70 hover:text-white transition-colors"
                aria-label="Delete"
              >
                <Trash2 size={17} />
              </button>
            )}
            {isMine && confirmDelete && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white"
                >
                  Keep
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-2 text-white" aria-label="Close">
              <X size={21} />
            </button>
          </div>

          {/* Pause overlay */}
          <AnimatePresence>
            {paused && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              >
                <div className="rounded-full bg-black/40 p-4 backdrop-blur-sm">
                  <span className="text-white text-2xl">⏸</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tap zones */}
          <button
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
            onClick={(e) => { e.stopPropagation(); goBack(); }}
            className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
            aria-label="Previous"
          />
          <button
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
            onClick={(e) => { e.stopPropagation(); advance(); }}
            className="absolute right-0 top-0 bottom-0 w-2/3 z-10"
            aria-label="Next"
          />

          {/* Content */}
          {story.image_url ? (
            isVideoUrl(story.image_url) ? (
              <video
                key={story.id}
                src={story.image_url}
                autoPlay
                playsInline
                loop
                muted={false}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                key={story.id}
                src={story.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            )
          ) : (
            <div
              key={story.id}
              className={`w-full h-full bg-gradient-to-br ${story.background_color || pickGradient(story.id)} flex items-center justify-center p-8`}
            >
              <p className="text-white text-3xl font-bold text-center leading-snug drop-shadow-lg whitespace-pre-wrap">
                {story.text}
              </p>
            </div>
          )}

          {/* Media caption */}
          {story.image_url && story.text && !viewersOpen && (
            <div className="absolute bottom-[80px] left-0 right-0 z-20 px-4">
              <div className="rounded-xl bg-black/50 backdrop-blur-sm px-3 py-2">
                <p className="text-white text-sm leading-snug whitespace-pre-wrap">{story.text}</p>
              </div>
            </div>
          )}

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            {isMine ? (
              /* Own story: show view count → tap to see viewers */
              <div className="flex flex-col gap-1 pb-safe-or-4 px-4 pb-6 bg-gradient-to-t from-black/70 to-transparent pt-8">
                <button
                  onClick={openViewers}
                  className="flex items-center gap-2 text-white/90 hover:text-white transition-colors self-start"
                >
                  <Eye size={16} />
                  <span className="text-sm font-medium">
                    {viewCount === 0 ? "No views yet" : `${viewCount} view${viewCount !== 1 ? "s" : ""}`}
                  </span>
                  <ChevronDown size={14} className="opacity-60" />
                </button>
              </div>
            ) : (
              /* Others: emoji reactions + reply input */
              <div className="flex flex-col gap-2 pb-6 px-3 bg-gradient-to-t from-black/80 to-transparent pt-6">
                <div className="flex items-center gap-2 justify-center">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      className="text-xl active:scale-125 transition-transform hover:scale-110"
                      disabled={replySending}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onFocus={() => setPaused(true)}
                    onBlur={() => setPaused(false)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(replyText); } }}
                    placeholder={`Reply to ${group.profile?.display_name || "story"}…`}
                    className="flex-1 rounded-full bg-white/15 border border-white/20 px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none backdrop-blur-sm focus:border-white/40"
                  />
                  <button
                    onClick={() => sendReply(replyText)}
                    disabled={!replyText.trim() || replySending}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-opacity shrink-0"
                  >
                    {replySending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Viewers sheet */}
        <AnimatePresence>
          {viewersOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 max-w-md mx-auto z-40 rounded-t-3xl bg-card overflow-hidden max-h-[60dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-foreground">
                  <Eye size={16} className="text-muted-foreground" />
                  <span className="font-semibold text-sm">
                    {viewersData ? `${viewersData.count} viewer${viewersData.count !== 1 ? "s" : ""}` : "Viewers"}
                  </span>
                </div>
                <button onClick={() => setViewersOpen(false)} className="p-1 text-muted-foreground">
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {viewersLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                  </div>
                ) : !viewersData || viewersData.viewers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Eye size={32} className="opacity-30" />
                    <p className="text-sm">No one has viewed this story yet</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {viewersData.viewers.map((v: any) => (
                      <li key={v.clerkUserId} className="flex items-center gap-3 px-4 py-3">
                        <img
                          src={v.profile?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${v.clerkUserId}`}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover bg-muted shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {v.profile?.display_name || "User"}
                          </p>
                          {v.profile?.username && (
                            <p className="text-xs text-muted-foreground">@{v.profile.username}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{relativeTime(v.viewedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
