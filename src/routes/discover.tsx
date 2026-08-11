import { createFileRoute } from "@tanstack/react-router";
import {
  Heart,
  MessageCircle,
  Search,
  Plus,
  X,
  Image as ImageIcon,
  Video,
  Loader2,
  Trash2,
  ImageOff,
  Send,
  MoreHorizontal,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@clerk/tanstack-start";
import { getMoments, toggleMomentLike, createMoment, uploadMomentImage, deleteMoment } from "@/lib/api.functions";
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
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
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
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      try {
        const dbMoments = await getMoments({ data: { clerkUserId: userId! } });
        setMoments(dbMoments.map((m: any) => ({
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
        })));
      } catch (err) {
        console.error("Failed to load moments:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [userId]);

  useEffect(() => {
    setLikedPosts(new Set(moments.filter((moment) => moment.liked).map((moment) => moment.id)));
  }, [moments]);

  const filtered = useMemo(() => {
    let list = moments;

    if (tab === "mine") {
      list = list.filter((moment) => moment.clerkUserId === userId);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((moment) =>
        (moment.text || "").toLowerCase().includes(q) ||
        moment.user.name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [moments, tab, query, userId]);

  const handleToggleLike = useCallback(async (momentId: string) => {
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
  }, [userId]);

  const handleDelete = useCallback(async (momentId: string) => {
    if (!userId) return;
    try {
      await deleteMoment({ data: { clerkUserId: userId, momentId } });
      setMoments((prev) => prev.filter((moment) => moment.id !== momentId));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }, [userId]);

  const bumpCommentCount = useCallback((momentId: string) => {
    setMoments((prev) =>
      prev.map((moment) =>
        moment.id === momentId ? { ...moment, comments: moment.comments + 1 } : moment
      )
    );
  }, []);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isImage && !isVideo) return;

    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(isVideo ? "Video must be under 100MB" : "Image must be under 10MB");
      return;
    }

    if (composeMedia) URL.revokeObjectURL(composeMedia.url);
    setComposeMedia({ file, url: URL.createObjectURL(file), type: isVideo ? "video" : "image" });
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
          data: {
            clerkUserId: userId,
            fileName: composeMedia.file.name,
            fileBase64: base64,
            contentType: composeMedia.file.type,
          },
        });
        imageUrl = result.publicUrl;
      }

      const saved = await createMoment({
        data: {
          clerkUserId: userId,
          text: composeText.trim() || undefined,
          imageUrl,
        },
      });

      setMoments((prev) => [{
        id: saved.id,
        user: {
          name: "You",
          avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${userId}`,
        },
        text: saved.text,
        image: saved.image_url,
        isVideo: saved.image_url ? isVideoUrl(saved.image_url) : false,
        timestamp: new Date(saved.created_at),
        likes: 0,
        comments: 0,
        liked: false,
        clerkUserId: userId,
      }, ...prev]);

      resetComposer();
      setShowCompose(false);
    } catch (err: any) {
      alert(err?.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const hasComposerContent = composeText.trim().length > 0 || !!composeMedia;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur">
        <div className="flex h-12 items-center justify-between">
          <button
            onClick={() => setSearchOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
            aria-label="Search posts"
          >
            <Search size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-primary" />
            <h1 className="text-lg font-bold tracking-tight">Discover</h1>
          </div>
          <button
            onClick={() => setShowCompose(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white"
            aria-label="New post"
          >
            <Plus size={19} />
          </button>
        </div>

        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
                <Search size={16} className="shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-muted-foreground" aria-label="Clear search">
                    <X size={15} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 text-sm font-semibold">
          <button
            onClick={() => setTab("all")}
            className={`relative py-3 ${tab === "all" ? "text-foreground" : "text-muted-foreground"}`}
          >
            For you
            {tab === "all" && <span className="absolute bottom-0 left-1/2 h-0.5 w-14 -translate-x-1/2 rounded-full bg-primary" />}
          </button>
          <button
            onClick={() => setTab("mine")}
            className={`relative py-3 ${tab === "mine" ? "text-foreground" : "text-muted-foreground"}`}
          >
            My posts
            {tab === "mine" && <span className="absolute bottom-0 left-1/2 h-0.5 w-14 -translate-x-1/2 rounded-full bg-primary" />}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {/* ── Stories Reel ── */}
        {userId && (
          <div className="border-b border-border">
            <StoriesReel clerkUserId={userId} />
          </div>
        )}

        {/* ── Quick compose bar ── */}
        <section className="border-b border-border px-4 py-4">
          <button
            onClick={() => setShowCompose(true)}
            className="flex w-full items-start gap-3 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-bold text-muted-foreground">
              {userId ? "Y" : "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">What's on your mind?</p>
              <div className="mt-2 flex items-center gap-3 text-muted-foreground">
                <ImageIcon size={18} />
                <Video size={18} />
                <span className="ml-auto rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white">
                  Post
                </span>
              </div>
            </div>
          </button>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <ImageOff size={25} className="text-muted-foreground" />
            </div>
            <p className="font-semibold">{tab === "mine" ? "No posts yet" : "Nothing here yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "mine" ? "Your first thread will show up here." : "Start the conversation with a new post."}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-border">
            {filtered.map((moment) => {
              const liked = likedPosts.has(moment.id);
              const likeDelta = liked && !moment.liked ? 1 : !liked && moment.liked ? -1 : 0;
              const likeCount = Math.max(0, moment.likes + likeDelta);
              const canDelete = moment.clerkUserId === userId;

              return (
                <article key={moment.id} className="px-4 py-4">
                  <div className="flex gap-3">
                    <div className="flex shrink-0 flex-col items-center">
                      <img
                        src={moment.user.avatar}
                        alt=""
                        className="h-10 w-10 rounded-full bg-secondary object-cover"
                      />
                      <div className="mt-3 w-px flex-1 bg-border" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="truncate text-sm font-bold">{moment.user.name}</p>
                            <span className="text-xs text-muted-foreground">·</span>
                            <p className="shrink-0 text-xs text-muted-foreground">{relativeTime(new Date(moment.timestamp))}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">@{initials(moment.user.name).toLowerCase()}_{moment.clerkUserId.slice(0, 5)}</p>
                        </div>

                        {canDelete ? (
                          <button
                            onClick={() => handleDelete(moment.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
                            aria-label="Delete post"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <button
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                            aria-label="More options"
                          >
                            <MoreHorizontal size={17} />
                          </button>
                        )}
                      </div>

                      {moment.text && (
                        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                          {moment.text}
                        </p>
                      )}

                      {moment.image && (
                        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-secondary">
                          {moment.isVideo ? (
                            <video
                              src={moment.image}
                              controls
                              playsInline
                              preload="metadata"
                              className="max-h-[520px] w-full bg-black object-contain"
                            />
                          ) : (
                            <img
                              src={moment.image}
                              alt=""
                              loading="lazy"
                              className="max-h-[520px] w-full object-cover"
                            />
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-5 text-muted-foreground">
                        <button
                          onClick={() => setCommentsOpen(moment.id)}
                          className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground"
                        >
                          <MessageCircle size={18} />
                          <span>{moment.comments}</span>
                        </button>
                        <button className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground">
                          <Repeat2 size={18} />
                          <span>0</span>
                        </button>
                        <button
                          onClick={() => handleToggleLike(moment.id)}
                          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${liked ? "text-rose-500" : "hover:text-foreground"}`}
                        >
                          <Heart size={18} className={liked ? "fill-rose-500" : ""} />
                          <span>{likeCount}</span>
                        </button>
                        <button className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground">
                          <Send size={17} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => !posting && setShowCompose(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="max-h-[92dvh] w-full max-w-md overflow-hidden rounded-t-3xl bg-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
                <button
                  onClick={() => !posting && setShowCompose(false)}
                  className="text-sm font-semibold text-muted-foreground"
                >
                  Cancel
                </button>
                <span className="text-base font-bold">New post</span>
                <button
                  onClick={handlePost}
                  disabled={posting || !hasComposerContent}
                  className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  {posting ? <Loader2 size={14} className="animate-spin" /> : "Post"}
                </button>
              </div>

              <div className="overflow-y-auto px-4 py-4">
                <div className="flex gap-3">
                  <div className="flex shrink-0 flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-bold text-muted-foreground">
                      Y
                    </div>
                    <div className="mt-3 w-px flex-1 bg-border" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">You</p>
                    <textarea
                      value={composeText}
                      onChange={(event) => setComposeText(event.target.value)}
                      placeholder="What's on your mind?"
                      maxLength={2000}
                      rows={5}
                      autoFocus
                      className="mt-1 w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                    />

                    {composeMedia && (
                      <div className="relative mt-3 overflow-hidden rounded-2xl border border-border bg-secondary">
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
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                          aria-label="Remove media"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-3 text-muted-foreground">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary hover:text-foreground"
                        aria-label="Attach photo or video"
                      >
                        <ImageIcon size={20} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleMediaSelect}
                      />
                      <span className="text-xs">{composeText.length}/2000</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
