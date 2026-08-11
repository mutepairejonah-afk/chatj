import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Search, Plus, Pin, Camera, Users, Sparkles, BadgeCheck, X, MessageSquare, Phone, Video, Archive, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/tanstack-start";
import { getConversations, getOrCreateProfile } from "@/lib/api.functions";
import { relativeTime } from "@/lib/mock-data";
import { getSocket } from "@/lib/socket";
import { ProfilePreview } from "@/components/ProfilePreview";

/** Returns true only if the user is genuinely online */
function isActuallyOnline(contact: any): boolean {
  if (!contact?.is_online) return false;
  const lastSeen = contact.last_seen;
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

/** Request + fire a browser push notification */
function fireBrowserNotification(title: string, body: string, icon?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (document.visibilityState === "visible") return; // only when in background
  const send = () => {
    try {
      new Notification(title, {
        body,
        icon: icon || "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        silent: false,
      });
    } catch { /* safari strict mode */ }
  };
  if (Notification.permission === "granted") {
    send();
  } else if (Notification.permission === "default") {
    Notification.requestPermission().then((p) => { if (p === "granted") send(); });
  }
}

export function ChatListPanel({
  compactActive = false,
  showHeaderActions = true,
}: {
  compactActive?: boolean;
  showHeaderActions?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewTarget, setPreviewTarget] = useState<any>(null);
  const location = useLocation();

  // Live typing indicators: convId → { name, timer }
  const [typingMap, setTypingMap] = useState<Record<string, string>>({});
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Live online presence: clerkUserId → boolean
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});

  // In-app toast for incoming messages
  const [toast, setToast] = useState<{ id: string; name: string; text: string; avatar: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    try {
      await getOrCreateProfile({ data: { clerkUserId: userId } });
      const convs = await getConversations({ data: { clerkUserId: userId } });
      setConversations(convs);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadConversations();
  }, [userId, loadConversations]);

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      // Don't auto-request — wait for first message
    }
  }, []);

  // Socket subscriptions
  useEffect(() => {
    if (!userId) return;
    const socket = getSocket(userId);
    if (!socket) return;

    const onNewMessage = (data: any) => {
      // Update chat list
      loadConversations();

      // Show in-app toast if message is from someone else
      const msg = data.message;
      if (msg && msg.sender_clerk_id && msg.sender_clerk_id !== userId) {
        const convId = data.conversationId;
        // Find the conversation to get the name
        setConversations((prev) => {
          const conv = prev.find((c) => c.id === convId);
          if (conv) {
            const name = conv.type === "group"
              ? (conv.name || "Group")
              : (conv.contact?.display_name || "Someone");
            const avatar = conv.type === "group"
              ? (conv.avatar_url || "")
              : (conv.contact?.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${msg.sender_clerk_id}`);
            const text = msg.text || (msg.image_url ? "📷 Photo" : msg.audio_url ? "🎤 Voice" : "New message");

            setToast({ id: convId, name, text, avatar });
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 4500);

            // Also fire browser notification
            fireBrowserNotification(name, text, avatar || undefined);
          }
          return prev;
        });
      }
    };

    const onTyping = (data: any) => {
      const { conversationId, displayName } = data;
      if (!conversationId) return;
      setTypingMap((prev) => ({ ...prev, [conversationId]: displayName }));
      if (typingTimers.current[conversationId]) clearTimeout(typingTimers.current[conversationId]);
      typingTimers.current[conversationId] = setTimeout(() => {
        setTypingMap((prev) => { const n = { ...prev }; delete n[conversationId]; return n; });
      }, 3000);
    };

    const onTypingStop = (data: any) => {
      const { conversationId } = data;
      if (!conversationId) return;
      if (typingTimers.current[conversationId]) clearTimeout(typingTimers.current[conversationId]);
      setTypingMap((prev) => { const n = { ...prev }; delete n[conversationId]; return n; });
    };

    const onPresence = (data: any) => {
      const { clerkUserId, online } = data;
      if (clerkUserId) setOnlineMap((prev) => ({ ...prev, [clerkUserId]: online }));
    };

    socket.on("message:new", onNewMessage);
    socket.on("typing", onTyping);
    socket.on("typing:stop", onTypingStop);
    socket.on("presence:update", onPresence);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("typing", onTyping);
      socket.off("typing:stop", onTypingStop);
      socket.off("presence:update", onPresence);
    };
  }, [userId, loadConversations]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(typingTimers.current).forEach(clearTimeout);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const displayChats = conversations.map((c: any) => {
    const isGroup = c.type === "group";
    const contact = c.contact || {};
    const contactClerkId = contact.clerk_user_id || null;
    // Merge DB online status with live socket presence
    const liveOnline = contactClerkId ? onlineMap[contactClerkId] : undefined;
    const isOnline = !isGroup && (liveOnline !== undefined ? liveOnline : isActuallyOnline(contact));
    return {
      id: c.id,
      isGroup,
      groupAvatarUrl: c.avatar_url || null,
      groupDescription: c.description || null,
      contact: {
        clerkUserId: contactClerkId,
        username: contact.username || null,
        name: isGroup ? (c.name || "Group Chat") : (contact.display_name || "Unknown"),
        avatar: isGroup
          ? null
          : (contact.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${c.id}`),
        isOnline,
        isAdmin: contact.is_admin || false,
        isVerified: contact.is_admin || contact.verified || contact.subscription_tier === "pro",
        isPro: contact.is_admin || contact.subscription_tier === "pro",
        isPremium: ["premium", "pro"].includes(contact.subscription_tier || "") || contact.is_admin,
      },
      memberProfiles: c.memberProfiles || [],
      memberCount: c.memberCount || 0,
      lastMessage: c.lastMessage
        ? {
            text: c.lastMessage.text || (
              c.lastMessage.image_url ? "📷 Photo" :
              c.lastMessage.video_url ? "🎥 Video" :
              c.lastMessage.audio_url ? "🎤 Voice message" :
              c.lastMessage.file_name ? `📎 ${c.lastMessage.file_name}` :
              c.lastMessage.poll_id ? "📊 Poll" : ""
            ),
            timestamp: new Date(c.lastMessage.created_at),
            senderId: c.lastMessage.sender_clerk_id,
          }
        : undefined,
      unreadCount: c.unreadCount || 0,
      isPinned: c.isPinned || false,
      isMuted: c.mute_until && new Date(c.mute_until) > new Date(),
    };
  });

  const filtered = displayChats.filter((c: any) =>
    c.contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinned = filtered.filter((c: any) => c.isPinned);
  const unpinned = filtered.filter((c: any) => !c.isPinned);

  const activeChatId = compactActive
    ? location.pathname.match(/^\/chat\/([^/]+)/)?.[1] || null
    : null;

  return (
    <div className="flex h-full flex-col relative">
      {/* In-app new message toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -80, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -80, scale: 0.95 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="absolute top-2 left-3 right-3 z-50 flex items-center gap-3 rounded-2xl bg-card/95 backdrop-blur-lg border border-border shadow-2xl p-3 cursor-pointer"
            onClick={() => {
              setToast(null);
              navigate({ to: "/chat/$id", params: { id: toast.id } });
            }}
          >
            <div className="relative shrink-0">
              <img
                src={toast.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${toast.id}`}
                alt=""
                className="h-10 w-10 rounded-full bg-muted object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{toast.name}</p>
              <p className="text-xs text-muted-foreground truncate">{toast.text}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setToast(null); }}
              className="shrink-0 text-muted-foreground"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <h1 className="text-2xl font-bold text-foreground">Chats</h1>
        {showHeaderActions && (
          <div className="flex gap-2">
            <button
              onClick={() => Notification.requestPermission?.()}
              className="rounded-full bg-secondary p-2 text-muted-foreground"
              title="Enable notifications"
            >
              <Camera size={18} />
            </button>
            <button className="rounded-full bg-secondary p-2 text-muted-foreground">
              <Plus size={18} />
            </button>
          </div>
        )}
      </header>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
          <Search size={16} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && displayChats.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center px-8 gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <MessageSquare size={24} className="text-muted-foreground" />
          </div>
          <p className="text-foreground font-semibold">No conversations yet</p>
          <p className="text-muted-foreground text-sm">Go to Contacts to start a chat</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-20">
        {/* Pinned section */}
        {pinned.length > 0 && !searchQuery && (
          <div className="px-4 py-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pinned</span>
          </div>
        )}
        {[...pinned, ...unpinned].map((chat: any, i: number) => {
          const isActive = activeChatId === chat.id;
          const isTyping = !!typingMap[chat.id];
          const typingName = typingMap[chat.id];
          const showDivider = !searchQuery && pinned.length > 0 && i === pinned.length;

          return (
            <div key={chat.id}>
              {showDivider && (
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent</span>
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.25) }}
              >
                <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isActive ? "bg-secondary" : "active:bg-secondary/50 hover:bg-secondary/30"}`}>
                  {/* Avatar */}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewTarget(chat); }}
                    className="relative shrink-0 rounded-full focus:outline-none"
                  >
                    {chat.isGroup ? (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 overflow-hidden">
                        {chat.groupAvatarUrl
                          ? <img src={chat.groupAvatarUrl} alt="" className="h-full w-full object-cover" />
                          : <Users size={22} className="text-primary" />}
                      </div>
                    ) : (
                      <>
                        <img
                          src={chat.contact.avatar}
                          alt={chat.contact.name}
                          className={`h-12 w-12 rounded-full bg-muted object-cover ring-2 ${
                            chat.contact.isAdmin ? "ring-red-500/60" :
                            chat.contact.isVerified ? "ring-primary/60" : "ring-transparent"
                          }`}
                        />
                        {chat.contact.isOnline && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-online" />
                        )}
                      </>
                    )}
                  </button>

                  {/* Content row */}
                  <Link to="/chat/$id" params={{ id: chat.id }} className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {chat.isPinned && <Pin size={11} className="text-muted-foreground shrink-0" />}
                        {chat.isMuted && <span className="text-muted-foreground shrink-0 text-[11px]">🔕</span>}
                        <span className="font-semibold text-foreground text-[15px] truncate leading-tight">{chat.contact.name}</span>
                        {chat.contact.isAdmin && <BadgeCheck size={13} className="text-red-500 shrink-0" />}
                        {!chat.contact.isAdmin && chat.contact.isVerified && <BadgeCheck size={13} className="text-primary shrink-0" />}
                      </div>
                      <span className={`text-[11px] shrink-0 ${chat.unreadCount > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {chat.lastMessage ? relativeTime(new Date(chat.lastMessage.timestamp)) : ""}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="flex-1 min-w-0">
                        {isTyping ? (
                          <span className="flex items-center gap-1 text-sm text-primary">
                            <span className="inline-flex gap-0.5 items-end">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                            </span>
                            <span className="truncate text-xs">
                              {chat.isGroup ? `${typingName} typing…` : "typing…"}
                            </span>
                          </span>
                        ) : (
                          <p className="truncate text-sm text-muted-foreground">
                            {chat.lastMessage?.senderId === userId && (
                              <span className="text-muted-foreground/60">You: </span>
                            )}
                            {chat.lastMessage?.text || ""}
                          </p>
                        )}
                      </div>
                      {chat.unreadCount > 0 && !chat.isMuted && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shrink-0">
                          {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                        </span>
                      )}
                      {chat.unreadCount > 0 && chat.isMuted && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-bold text-muted-foreground shrink-0">
                          {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </Link>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* Floating AI button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate({ to: "/ai-chat" })}
        className="absolute bottom-4 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-xl shadow-violet-500/30"
        aria-label="Open AI Assistant"
        title="AI Assistant"
      >
        <Sparkles size={22} className="text-white" />
      </motion.button>

      <ProfilePreview
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
        clerkUserId={previewTarget?.isGroup ? null : previewTarget?.contact?.clerkUserId}
        initialName={previewTarget?.contact?.name}
        initialAvatarUrl={previewTarget?.isGroup ? previewTarget?.groupAvatarUrl : previewTarget?.contact?.avatar}
        initialUsername={previewTarget?.isGroup ? null : previewTarget?.contact?.username}
        conversationIdForMessage={previewTarget?.id}
        group={
          previewTarget?.isGroup
            ? {
                id: previewTarget.id,
                name: previewTarget.contact?.name,
                avatarUrl: previewTarget.groupAvatarUrl,
                description: previewTarget.groupDescription,
                memberCount: previewTarget.memberCount,
              }
            : null
        }
      />
    </div>
  );
}
