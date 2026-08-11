import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { X, MessageCircle, Phone, Video, UserCircle, Info, Users, BadgeCheck } from "lucide-react";
import { getProfileByClerkId } from "@/lib/api-client";

export interface ProfilePreviewProps {
  open: boolean;
  onClose: () => void;
  // Person mode: provide either prefilled data OR a clerkUserId to fetch
  clerkUserId?: string | null;
  initialName?: string | null;
  initialAvatarUrl?: string | null;
  initialUsername?: string | null;
  initialStatus?: string | null;
  // Hide action buttons (e.g. when previewing your own profile)
  isSelf?: boolean;
  // Group mode — alternative shape, renders a group card
  group?: {
    id: string;
    name?: string | null;
    avatarUrl?: string | null;
    description?: string | null;
    memberCount?: number;
  } | null;
  // Optional: when present and 1:1, the message button opens this conversation
  conversationIdForMessage?: string | null;
  // Callback when "Message" is tapped (overrides default routing)
  onMessage?: () => void;
  onCall?: (kind: "audio" | "video") => void;
}

/**
 * WhatsApp-style profile preview sheet.
 * - Tap-to-zoom large avatar at the top
 * - Name + @handle + status
 * - Action row: Message / Voice / Video (or Group Info / Members for groups)
 * - Tap outside or × to close
 */
export function ProfilePreview({
  open,
  onClose,
  clerkUserId,
  initialName,
  initialAvatarUrl,
  initialUsername,
  initialStatus,
  isSelf,
  group,
  conversationIdForMessage,
  onMessage,
  onCall,
}: ProfilePreviewProps) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [zoomed, setZoomed] = useState(false);

  // Fetch full profile when previewing a person and we only have an ID
  useEffect(() => {
    if (!open || group) return;
    if (!clerkUserId) return;
    let cancelled = false;
    getProfileByClerkId({ data: { clerkUserId } })
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, clerkUserId, group]);

  if (!open) return null;

  const name = group ? group.name || "Group" : profile?.display_name || initialName || "User";
  const username = group ? null : profile?.username || initialUsername || null;
  const avatar = group ? group.avatarUrl : profile?.avatar_url || initialAvatarUrl;
  const status = group ? group.description : profile?.status_message || initialStatus;

  const handleMessage = () => {
    onClose();
    if (onMessage) {
      onMessage();
      return;
    }
    if (group) {
      navigate({ to: "/chat/$id", params: { id: group.id } });
    } else if (conversationIdForMessage) {
      navigate({ to: "/chat/$id", params: { id: conversationIdForMessage } });
    } else if (username) {
      navigate({ to: "/u/$handle", params: { handle: username } });
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="preview-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          key="preview-sheet"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-card pb-[max(env(safe-area-inset-bottom),20px)] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Banner with large round avatar */}
          <div className="relative bg-gradient-to-b from-primary/15 to-transparent px-6 pt-6 pb-4">
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full bg-secondary/80 p-1.5 text-muted-foreground"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <div className="flex flex-col items-center text-center">
              <button
                onClick={() => avatar && setZoomed(true)}
                className={`size-32 rounded-full bg-secondary overflow-hidden ring-4 shadow-lg ${
                  profile?.is_admin ? "ring-red-500/60" :
                  profile?.subscription_tier === "pro" ? "ring-violet-500/60" :
                  "ring-background"
                }`}
              >
                {avatar ? (
                  <img src={avatar} alt={name} className="h-full w-full object-cover" />
                ) : group ? (
                  <div className="flex h-full w-full items-center justify-center bg-primary/15">
                    <Users size={42} className="text-primary" />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <UserCircle size={64} className="text-muted-foreground" />
                  </div>
                )}
              </button>
              <div className="mt-3 flex items-center gap-1.5 justify-center px-4">
                <h2 className="text-xl font-bold text-foreground truncate max-w-full">{name}</h2>
                {profile?.is_admin && (
                  <span title="Admin — verified account" className="shrink-0">
                    <BadgeCheck size={20} className="text-red-500" />
                  </span>
                )}
                {!profile?.is_admin && (profile?.verified || profile?.subscription_tier === "pro") && (
                  <span title="Verified" className="shrink-0">
                    <BadgeCheck size={20} className="text-primary" />
                  </span>
                )}
              </div>
              {profile?.is_admin && (
                <span className="mt-0.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-500">ADMIN</span>
              )}
              {username && <p className="mt-0.5 text-sm font-medium text-primary">@{username}</p>}
              {group && typeof group.memberCount === "number" && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>

          {/* Status / about */}
          {status && (
            <div className="mx-4 mb-3 rounded-2xl bg-secondary/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {group ? "Description" : "About"}
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{status}</p>
            </div>
          )}

          {/* Actions */}
          {!isSelf && (
            <div className="px-4 pb-2">
              {group ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleMessage}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-primary/10 py-3 text-primary"
                  >
                    <MessageCircle size={20} />
                    <span className="text-xs font-medium">Open chat</span>
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      if (group) navigate({ to: "/group/$id", params: { id: group.id } });
                    }}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-secondary py-3 text-foreground"
                  >
                    <Info size={20} />
                    <span className="text-xs font-medium">Group info</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleMessage}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-primary/10 py-3 text-primary"
                  >
                    <MessageCircle size={20} />
                    <span className="text-xs font-medium">Message</span>
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onCall?.("audio");
                    }}
                    disabled={!onCall}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-secondary py-3 text-foreground disabled:opacity-40"
                  >
                    <Phone size={20} />
                    <span className="text-xs font-medium">Voice</span>
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onCall?.("video");
                    }}
                    disabled={!onCall}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-secondary py-3 text-foreground disabled:opacity-40"
                  >
                    <Video size={20} />
                    <span className="text-xs font-medium">Video</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {isSelf && (
            <div className="px-4 pb-2">
              <button
                onClick={() => {
                  onClose();
                  navigate({ to: "/edit-profile" });
                }}
                className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                Edit profile
              </button>
            </div>
          )}
        </motion.div>

        {/* Full-screen avatar zoom */}
        <AnimatePresence>
          {zoomed && avatar && (
            <motion.div
              key="zoom"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black"
              onClick={() => setZoomed(false)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomed(false);
                }}
                className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white"
                aria-label="Close"
              >
                <X size={22} />
              </button>
              <motion.img
                initial={{ scale: 0.85 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.85 }}
                src={avatar}
                alt={name}
                className="max-h-[90vh] max-w-[95vw] object-contain"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
