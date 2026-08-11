import { createFileRoute } from "@tanstack/react-router";
import {
  Heart,
  MessageCircle,
  Search,
  Plus,
  X,
  Image as ImageIcon,
  Loader2,
  Trash2,
  ImageOff,
  Send,
  MoreHorizontal,
  Share2,
  Bell,
  Play,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { getMoments, toggleMomentLike, createMoment, uploadMomentImage, deleteMoment } from "@/lib/api-client";
import { relativeTime } from "@/lib/mock-data";
import { MomentComments } from "@/components/MomentComments";
import { StoriesReel } from "@/components/StoriesReel";

export const Route = createFileRoute("/discover")({
  component: DiscoverPage,
  head: () => ({
    meta: [
      { title: "Discover - ChatApp" },
      { name: "description", content: "Text-first social posts and moments" },
    ],
  }),
});

type MomentPost = {
  id: string;
  user: {
    name: string;
    avatar: string;
  };
  text?: string | null;
  image?: string | null;
  isVideo: boolean;
  timestamp: Date;
  likes: number;
  comments: number;
  liked: boolean;
  clerkUserId: string;
};

const CHIPS = ["All", "For you", "Following", "Trending", "Photos", "Videos", "Text"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v|ogv)(\?|$)/i.test(url);
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function abbreviate(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/* ─────────────────────────────────────────────────────────────────────────
   Feed card — single-column, editorial post layout.
   Avatar + name + timestamp up top, text as the lede, media (if any) as a
   full-bleed rounded panel below, then a quiet action row.
   ────────────────────────────────────────────────────────────────────── */
function FeedCard({
  moment,
  liked,
  likeCount,
  canDelete,
  onLike,
  onDelete,
  onComments,
  index,
}: {
  moment: MomentPost;
  liked: boolean;
  likeCount: number;
  canDelete: boolean;
  onLike: () => void;
  onDelete: () => void;
  onComments: () => void;
  index: number;
}) {
  const hasMedia = !!moment.image;
  const [menuOpen, setMenuOpen] = useState(false);
  const [justLiked, setJustLiked] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  const handleLikeClick = () => {
    if (!liked) {
      setJustLiked(true);
      setTimeout(() => setJustLiked(false), 500);
    }
    onLike();
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm shadow-black/[0.02] transition-shadow hover:shadow-md hover:shadow-black/[0.04]"
    >
      {/* ── Header row ── */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="relative shrink-0">
          <div className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-background">
            <img src={moment.user.avatar} alt="" className="h-full w-full object-cover" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold leading-tight text-foreground">{moment.user.name}</p>
          <p className="text-[12px] text-muted-foreground">{relativeTime(new Date(moment.timestamp))}</p>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal size={18} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-9 z-30 min-w-[150px] overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-xl shadow-black/10"
              >
                <button
                  onClick={() => {
                    onComments();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  <MessageCircle size={15} /> Comments
                </button>
                <button
                  onClick={() => {
                    onLike();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  <Heart size={15} className={liked ? "fill-current text-rose-500" : ""} />
                  {liked ? "Unlike" : "Like"}
                </button>
                {canDelete && (
                  <button
                    onClick={() => {
                      onDelete();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Text lede ── */}
      {moment.text && (
        <p className="whitespace-pre-wrap px-4 pt-3 text-[15px] leading-relaxed text-foreground">{moment.text}</p>
      )}

      {/* ── Media ── */}
      {hasMedia && (
        <div className="relative mt-3 w-full overflow-hidden bg-secondary">
          {moment.isVideo ? (
            <div className="group relative aspect-[4/5] w-full sm:aspect-video">
              <video src={moment.image!} playsInline muted loop preload="metadata" className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity group-hover:bg-black/25">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur transition-transform group-hover:scale-105">
                  <Play size={22} className="ml-0.5 fill-foreground text-foreground" />
                </div>
              </div>
            </div>
          ) : (
            <div className="aspect-[4/5] w-full sm:aspect-video">
              <img
                src={moment.image!}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Action row ── */}
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          onClick={handleLikeClick}
          className="relative flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <span className="relative flex items-center justify-center">
            <Heart
              size={19}
              className={`transition-all duration-150 ${liked ? "scale-110 fill-rose-500 text-rose-500" : ""}`}
            />
            <AnimatePresence>
              {justLiked && (
                <motion.span
                  initial={{ scale: 0.4, opacity: 0.9 }}
                  animate={{ scale: 2.1, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full bg-rose-500/40"
                />
              )}
            </AnimatePresence>
          </span>
          <span className={liked ? "text-rose-500" : ""}>{abbreviate(likeCount)}</span>
        </button>

        <button
          onClick={onComments}
          className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <MessageCircle size={18} />
          <span>{abbreviate(moment.comments)}</span>
        </button>

        <button className="ml-auto flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Share2 size={17} />
        </button>
      </div>
    </motion.article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Shorts shelf — horizontal reel of vertical video previews.
   ────────────────────────────────────────────────────────────────────── */
function ShortsShelf({ moments, likedPosts, onLike }: { moments: MomentPost[]; likedPosts: Set<string>; onLike: (id: string) => void }) {
  const videos = moments.filter((m) => m.isVideo || (m.image && isVideoUrl(m.image)));
  if (videos.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-orange-400">
            <Play size={12} className="ml-0.5 fill-white text-white" />
          </div>
          <h2 className="text-[15px] font-bold text-foreground">Shorts</h2>
        </div>
        <button className="text-xs font-semibold text-primary hover:underline">See all</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {videos.map((m) => {
          const liked = likedPosts.has(m.id);
          return (
            <div
              key={m.id}
              className="group relative w-32 shrink-0 overflow-hidden rounded-2xl bg-secondary shadow-sm ring-1 ring-border/50 aspect-[9/16]"
            >
              <video src={m.image!} playsInline muted preload="metadata" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-2.5">
                <p className="line-clamp-2 text-[11px] font-medium leading-tight text-white">{m.text || "Video"}</p>
                <button
                  onClick={() => onLike(m.id)}
                  className={`mt-1.5 flex items-center gap-1 text-[11px] font-bold ${liked ? "text-rose-400" : "text-white/85"}`}
                >
                  <Heart size={12} className={liked ? "fill-rose-400" : ""} />
                  {abbreviate(m.likes)}
                </button>
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
                  <Play size={15} className="ml-0.5 fill-foreground text-foreground" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Skeleton placeholder — shown while the feed loads.
   ────────────────────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="h-10 w-10 rounded-full bg-secondary" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded-full bg-secondary" />
          <div className="h-2.5 w-16 rounded-full bg-secondary" />
        </div>
      </div>
      <div className="space-y-2 px-4 pt-4">
        <div className="h-3 w-full rounded-full bg-secondary" />
        <div className="h-3 w-4/5 rounded-full bg-secondary" />
      </div>
      <div className="mt-4 aspect-[4/5] w-full bg-secondary sm:aspect-video" />
      <div className="flex gap-3 px-4 py-3">
        <div className="h-6 w-12 rounded-full bg-secondary" />
        <div className="h-6 w-12 rounded-full bg-secondary" />
      </div>
    </div>
  );
}

function DiscoverPage() {
  const { userId } = useAuth();
  const [moments, setMoments] = useState<MomentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [composeMedia, setComposeMedia] = useState<{ file: File; url: string; type: "image" | "video" } | null>(null);
  const [posting, setPosting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState("All");
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    async function load() {
      try {
        const dbMoments = await getMoments({ data: { clerkUserId: userId! } });
        setMoments(
          dbMoments.map((m: any) => ({
            id: m.id,
            user: {
              name: m.profile?.display_name || "User",
              avatar: m.profile?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${m.clerk_user_id}`,
            },
            text: m.text,
            image: m.image_url,
            isVideo: m.image_url ? isVideoUrl(m.image_url) : false,
            timestamp: new Date(m.created_at),
            likes: m.likesCount || 0,
            comments: m.commentsCount || 0,
            liked: m.likedByMe || false,
            clerkUserId: m.clerk_user_id,
          }))
        );
      } catch (err) {
        console.error("Failed to load moments:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  useEffect(() => {
    setLikedPosts(new Set(moments.filter((m) => m.liked).map((m) => m.id)));
  }, [moments]);

  const filtered = useMemo(() => {
    let list = moments;
    if (tab === "mine") list = list.filter((m) => m.clerkUserId === userId);
    if (activeChip === "Photos") list = list.filter((m) => m.image && !m.isVideo);
    else if (activeChip === "Videos") list = list.filter((m) => m.isVideo);
    else if (activeChip === "Text") list = list.filter((m) => !m.image);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((m) => (m.text || "").toLowerCase().includes(q) || m.user.name.toLowerCase().includes(q));
    }
    return list;
  }, [moments, tab, query, userId, activeChip]);

  const handleToggleLike = useCallback(
    async (momentId: string) => {
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (next.has(momentId)) next.delete(momentId);
        else next.add(momentId);
        return next;
      });
      if (userId) {
        try {
          await toggleMomentLike({ data: { momentId, clerkUserId: userId } });
        } catch (err) {
          console.error("Failed to toggle like:", err);
        }
      }
    },
    [userId]
  );

  const handleDelete = useCallback(
    async (momentId: string) => {
      if (!userId) return;
      try {
        await deleteMoment({ data: { clerkUserId: userId, momentId } });
        setMoments((prev) => prev.filter((m) => m.id !== momentId));
      } catch (err) {
        console.error("Failed to delete:", err);
      }
    },
    [userId]
  );

  const bumpCommentCount = useCallback((momentId: string) => {
    setMoments((prev) => prev.map((m) => (m.id === momentId ? { ...m, comments: m.comments + 1 } : m)));
  }, []);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVid = file.type.startsWith("video/");
    const isImg = file.type.startsWith("image/");
    if (!isImg && !isVid) return;
    const maxSize = isVid ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(isVid ? "Video must be under 100MB" : "Image must be under 10MB");
      return;
    }
    if (composeMedia) URL.revokeObjectURL(composeMedia.url);
    setComposeMedia({ file, url: URL.createObjectURL(file), type: isVid ? "video" : "image" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetComposer = () => {
    setComposeText("");
    if (composeMedia) URL.revokeObjectURL(composeMedia.url);
    setComposeMedia(null);
  };

  const handlePost = async () => {
    if (!userId || (!composeText.trim() && !composeMedia)) return;
    setPosting(true);
    try {
      let imageUrl: string | undefined;
      if (composeMedia) {
        const base64 = await fileToBase64(composeMedia.file);
        const result = await uploadMomentImage({
          data: { clerkUserId: userId, fileName: composeMedia.file.name, fileBase64: base64, contentType: composeMedia.file.type },
        });
        imageUrl = result.publicUrl;
      }
      const saved = await createMoment({ data: { clerkUserId: userId, text: composeText.trim() || undefined, imageUrl } });
      setMoments((prev) => [
        {
          id: saved.id,
          user: { name: "You", avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${userId}` },
          text: saved.text,
          image: saved.image_url,
          isVideo: saved.image_url ? isVideoUrl(saved.image_url) : false,
          timestamp: new Date(saved.created_at),
          likes: 0,
          comments: 0,
          liked: false,
          clerkUserId: userId,
        },
        ...prev,
      ]);
      resetComposer();
      setShowCompose(false);
    } catch (err: any) {
      alert(err?.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const hasComposerContent = composeText.trim().length > 0 || !!composeMedia;
  const composerChars = composeText.length;
  const composerLimit = 2000;
  const composerPct = Math.min(100, (composerChars / composerLimit) * 100);

  const visibleChips = ["All", "My posts", ...CHIPS.slice(1)];

  return (
    <div className="flex h-full flex-col bg-background text-foreground overflow-hidden">
      {/* ══ Top bar ══════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-1 px-4 pt-[env(safe-area-inset-top)]">
          <div className="mr-auto flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-sm shadow-primary/30">
              <Sparkles size={15} className="text-white" />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight">Discover</span>
          </div>

          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-secondary transition-colors"
            aria-label="Search"
          >
            <Search size={19} />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-secondary transition-colors" aria-label="Notifications">
            <Bell size={19} />
          </button>
        </div>

        {/* Search bar */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden px-4"
            >
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border/70 bg-secondary/70 px-4 py-2.5">
                <Search size={15} className="shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search posts and people..."
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                    <X size={15} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Segmented filter pills with sliding highlight ── */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {visibleChips.map((chip) => {
            const isActive = chip === "My posts" ? tab === "mine" : tab === "all" && activeChip === chip;
            return (
              <button
                key={chip}
                onClick={() => {
                  if (chip === "My posts") {
                    setTab("mine");
                    setActiveChip("All");
                  } else {
                    setTab("all");
                    setActiveChip(chip);
                  }
                }}
                className="relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              >
                {isActive && (
                  <motion.span
                    layoutId="discover-chip-highlight"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    className="absolute inset-0 rounded-full bg-foreground"
                  />
                )}
                <span className={`relative z-10 ${isActive ? "text-background" : "text-muted-foreground hover:text-foreground"}`}>
                  {chip}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ══ Main scrollable content ══════════════════════════════════════ */}
      <main
        className="flex-1 overflow-y-auto px-4 pb-24 pt-4"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
      >
        <style>{`
          main::-webkit-scrollbar { width: 6px; }
          main::-webkit-scrollbar-track { background: transparent; }
          main::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
          main::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
        `}</style>

        {/* ── Stories shelf ── */}
        {userId && (
          <div className="-mx-4 mb-5 border-b border-border/70 px-4 pb-4">
            <StoriesReel />
          </div>
        )}

        {/* ── Shorts shelf ── */}
        {!loading && <ShortsShelf moments={filtered} likedPosts={likedPosts} onLike={handleToggleLike} />}

        {/* ── Loading skeletons ── */}
        {loading && (
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-secondary to-secondary/50 ring-1 ring-border/60">
              <ImageOff size={28} className="text-muted-foreground" />
            </div>
            <p className="text-base font-bold">{tab === "mine" ? "No posts yet" : "Nothing here yet"}</p>
            <p className="mt-1.5 max-w-[240px] text-sm text-muted-foreground">
              {tab === "mine" ? "Your first post will show up here." : "Be the first to share something with everyone."}
            </p>
            <button
              onClick={() => setShowCompose(true)}
              className="mt-5 flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary/80 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-transform active:scale-95"
            >
              <Plus size={16} /> Create post
            </button>
          </div>
        )}

        {/* ── Feed ── */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map((moment, i) => {
              const liked = likedPosts.has(moment.id);
              const likeDelta = liked && !moment.liked ? 1 : !liked && moment.liked ? -1 : 0;
              const likeCount = Math.max(0, moment.likes + likeDelta);
              return (
                <FeedCard
                  key={moment.id}
                  index={i}
                  moment={moment}
                  liked={liked}
                  likeCount={likeCount}
                  canDelete={moment.clerkUserId === userId}
                  onLike={() => handleToggleLike(moment.id)}
                  onDelete={() => handleDelete(moment.id)}
                  onComments={() => setCommentsOpen(moment.id)}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* ══ Floating compose button ══════════════════════════════════════ */}
      <motion.button
        onClick={() => setShowCompose(true)}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/30"
        aria-label="New post"
      >
        <Plus size={24} />
      </motion.button>

      {/* ══ Compose sheet ═════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => !posting && setShowCompose(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              className="max-h-[92dvh] w-full max-w-md overflow-hidden rounded-t-[2rem] bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1.5 w-10 rounded-full bg-border" />
              </div>

              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <button
                  onClick={() => !posting && setShowCompose(false)}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <span className="text-[15px] font-bold">New post</span>
                <button
                  onClick={handlePost}
                  disabled={posting || !hasComposerContent}
                  className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary/80 px-4 py-1.5 text-sm font-bold text-white shadow-sm shadow-primary/30 transition-opacity disabled:opacity-30"
                >
                  {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                  {posting ? "" : "Post"}
                </button>
              </div>

              <div className="overflow-y-auto px-4 py-4">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-secondary text-sm font-bold text-primary ring-2 ring-background">
                    {userId ? initials("You") : "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">You</p>
                    <textarea
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      placeholder="What's on your mind?"
                      maxLength={composerLimit}
                      rows={5}
                      autoFocus
                      className="mt-1 w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                    />

                    {composeMedia && (
                      <div className="relative mt-3 overflow-hidden rounded-2xl border border-border/70 bg-secondary">
                        {composeMedia.type === "video" ? (
                          <video src={composeMedia.url} controls className="max-h-72 w-full bg-black object-contain" />
                        ) : (
                          <img src={composeMedia.url} alt="" className="max-h-72 w-full object-cover" />
                        )}
                        <button
                          onClick={() => {
                            URL.revokeObjectURL(composeMedia.url);
                            setComposeMedia(null);
                          }}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/85"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
                        aria-label="Add photo or video"
                      >
                        <ImageIcon size={19} />
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaSelect} />

                      <div className="ml-auto flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
                          <circle cx="9" cy="9" r="7" fill="none" stroke="var(--border)" strokeWidth="2" />
                          <circle
                            cx="9"
                            cy="9"
                            r="7"
                            fill="none"
                            stroke={composerPct > 90 ? "#f43f5e" : "var(--primary)"}
                            strokeWidth="2"
                            strokeDasharray={`${(composerPct / 100) * 44} 44`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="text-[11px] text-muted-foreground">
                          {composerChars}/{composerLimit}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Comments drawer ═══════════════════════════════════════════════ */}
      {commentsOpen && (
        <MomentComments
          momentId={commentsOpen}
          open={true}
          onClose={() => setCommentsOpen(null)}
          userId={userId || ""}
          onCommentAdded={() => bumpCommentCount(commentsOpen)}
        />
      )}
    </div>
  );
}
