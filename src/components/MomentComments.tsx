import { useState, useEffect } from "react";
import { X, Send, Loader2, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getMomentComments, addMomentComment, deleteMomentComment } from "@/lib/api.functions";
import { relativeTime } from "@/lib/mock-data";

interface MomentCommentsProps {
  momentId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  onCommentAdded: () => void;
}

export function MomentComments({ momentId, userId, open, onClose, onCommentAdded }: MomentCommentsProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open || !momentId) return;
    setLoading(true);
    getMomentComments({ data: { momentId } })
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, momentId]);

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      const saved = await addMomentComment({ data: { clerkUserId: userId, momentId, text: text.trim() } });
      setComments((prev) => [...prev, { ...saved, profile: { display_name: "You", avatar_url: null } }]);
      setText("");
      onCommentAdded();
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setPosting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-lg rounded-t-2xl bg-surface border-t border-border flex flex-col"
            style={{ maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Comments</h3>
              <button onClick={onClose} className="p-1 text-muted-foreground"><X size={20} /></button>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && (
                <div className="flex justify-center py-4">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && comments.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">No comments yet</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <img
                    src={c.profile?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${c.clerk_user_id}`}
                    alt=""
                    className="h-8 w-8 rounded-full bg-muted flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground">{c.profile?.display_name || "User"}</span>
                      <span className="text-xs text-muted-foreground">{relativeTime(new Date(c.created_at))}</span>
                      {c.clerk_user_id === userId && (
                        <button
                          onClick={async () => {
                            try {
                              await deleteMomentComment({ data: { clerkUserId: userId, commentId: c.id } });
                              setComments((prev) => prev.filter((x) => x.id !== c.id));
                              onCommentAdded(); // triggers recount
                            } catch (err) { console.error(err); }
                          }}
                          className="ml-auto text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-foreground mt-0.5">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),12px)]">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePost()}
                placeholder="Add a comment..."
                maxLength={2000}
                className="flex-1 rounded-full bg-secondary px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                onClick={handlePost}
                disabled={!text.trim() || posting}
                className="rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-50"
              >
                {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
