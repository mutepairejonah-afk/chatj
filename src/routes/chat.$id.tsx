import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Phone, Video, Send, Image, Smile, Mic, X, Loader2, Play, Pause, UserPlus, UserMinus, Settings, LogOut, Pencil, Check, Trash2, Reply, Search, Forward, CornerUpLeft, Paperclip, FileText, MapPin, User as UserIcon, BarChart3, Pin, Star, ShieldOff, ShieldAlert, Plus, Download, Globe, Brain, Palette, Sparkles, Copy, BadgeCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useMessages } from "@/hooks/useMessages";
import { getMessages, sendMessage as sendMessageFn, addReaction as addReactionFn, markConversationRead, uploadChatMedia, getConversationDetails, addGroupMember, removeGroupMember, getAllProfiles, markMessagesRead, getReadReceipts, leaveGroup, editMessage as editMessageFn, deleteMessageForEveryone as deleteMessageFn, getConversations, togglePinMessage, getPinnedMessages, toggleStarMessage, blockUser, reportTarget, uploadDocumentMessage, sendLocationMessage, sendContactMessage, createPoll, getPoll, votePoll, aiChatAssist, translateMessage, getConversationWallpaper, setConversationWallpaper, exportChatHistory } from "@/lib/api-client";
import { usePremium } from "@/hooks/usePremium";
import { messageTime, type Message } from "@/lib/mock-data";
import { getSocket } from "@/lib/socket";
import { CallModal, type CallSession } from "@/components/CallModal";
import { ProfilePreview } from "@/components/ProfilePreview";

export const Route = createFileRoute("/chat/$id")({
  component: ChatDetailPage,
  head: () => ({
    meta: [{ title: "Chat — ChatApp" }],
  }),
  validateSearch: (search: Record<string, unknown>): { call?: "audio" | "video" } => {
    const raw = search.call;
    if (raw === "audio" || raw === "video") return { call: raw };
    return {};
  },
});

const emojiOptions = ["❤️", "😂", "😮", "😢", "😡", "👍"];

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AudioPlayer({ src, isMine }: { src: string; isMine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={toggle} className={`shrink-0 ${isMine ? "text-bubble-sent-foreground" : "text-primary"}`}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="h-1 rounded-full bg-muted-foreground/20 overflow-hidden">
          <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className={`text-[10px] ${isMine ? "text-bubble-sent-foreground/60" : "text-muted-foreground"}`}>
          {playing || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}

const FULL_EMOJI_SET = [
  "❤️","😂","😮","😢","😡","👍","👎","🙏",
  "🔥","😍","🤔","😅","😭","🥰","😎","🤣",
  "🎉","💯","👏","😊","💪","✨","🥳","😬",
];

const WALLPAPER_PRESETS = [
  { name: "Forest",   url: "https://picsum.photos/seed/chatforest/600/900",  preview: "https://picsum.photos/seed/chatforest/120/180" },
  { name: "Mountain", url: "https://picsum.photos/seed/chatmtn/600/900",     preview: "https://picsum.photos/seed/chatmtn/120/180" },
  { name: "Ocean",    url: "https://picsum.photos/seed/chatocean/600/900",   preview: "https://picsum.photos/seed/chatocean/120/180" },
  { name: "City",     url: "https://picsum.photos/seed/chatcity/600/900",    preview: "https://picsum.photos/seed/chatcity/120/180" },
  { name: "Sky",      url: "https://picsum.photos/seed/chatsky/600/900",     preview: "https://picsum.photos/seed/chatsky/120/180" },
  { name: "Abstract", url: "https://picsum.photos/seed/chatabstr/600/900",   preview: "https://picsum.photos/seed/chatabstr/120/180" },
  { name: "Nature",   url: "https://picsum.photos/seed/chatnature/600/900",  preview: "https://picsum.photos/seed/chatnature/120/180" },
  { name: "Minimal",  url: "https://picsum.photos/seed/chatminimal/600/900", preview: "https://picsum.photos/seed/chatminimal/120/180" },
];

function ChatDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { isPremium, isPro } = usePremium();

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string; type: "image" | "video" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [convDetails, setConvDetails] = useState<any>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [contextMenu, setContextMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef<number>(0);

  // Reply, forward, search, @mentions
  const [replyTo, setReplyTo] = useState<{
    id: string; senderName: string;
    text: string | null; image: string | null; video: string | null; audio: string | null;
  } | null>(null);
  const [forwardMsg, setForwardMsg] = useState<{
    text: string | null; image: string | null; video: string | null; audio: string | null;
  } | null>(null);
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [forwardConvs, setForwardConvs] = useState<any[]>([]);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Pinned messages bar
  const [pinned, setPinned] = useState<any[]>([]);
  const [pinnedIdx, setPinnedIdx] = useState(0);
  // Attach menu + new message types
  const [showAttach, setShowAttach] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  // Poll modal
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQ, setPollQ] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMulti, setPollMulti] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);
  // Cached poll data per pollId
  const [pollData, setPollData] = useState<Record<string, any>>({});
  // Contact picker
  const [showContactPicker, setShowContactPicker] = useState(false);
  // Profile preview (1:1 → other user, group → group card)
  const [showHeaderPreview, setShowHeaderPreview] = useState(false);

  // Outgoing-call state. Incoming calls are handled globally in MobileLayout.
  const [callSession, setCallSession] = useState<CallSession | null>(null);

  // Live peer online presence (1:1 chats)
  const [peerOnline, setPeerOnline] = useState<boolean | null>(null);

  // Premium features state
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, { lang: string; text: string }>>({});
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [aiThinkingId, setAiThinkingId] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState(false);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Dexie message persistence (write-side only) ───────────────────────────
  // The API fetch below drives the displayed `messages` state; Dexie is used
  // purely for write-side persistence so messages are available for offline
  // reading in future sessions. It does NOT replace the API as the display
  // source in this component.
  //   • addOptimistic    — write a pending entry to Dexie on send (shown inline)
  //   • confirmOptimistic— overwrite with server-confirmed record on success
  //   • removePending    — remove a failed entry so it never stays stuck
  //   • upsertIncoming   — persist socket-pushed messages for offline reading
  const {
    addOptimistic,
    confirmOptimistic,
    removePending,
    upsertIncoming,
  } = useMessages(id, userId);

  // Kept in sync with convDetails so socket handlers set up in effects that
  // only run once (deps: [id, userId]) always see the latest value instead
  // of a stale closure from the first render (when convDetails is still null).
  const convDetailsRef = useRef<any>(null);
  useEffect(() => {
    convDetailsRef.current = convDetails;
  }, [convDetails]);

  // Load messages and conversation details
  useEffect(() => {
    if (!userId) return;
    async function loadMessages() {
      try {
        const [dbMessages, details] = await Promise.all([
          getMessages({ data: { conversationId: id, clerkUserId: userId! } }),
          getConversationDetails({ data: { conversationId: id, clerkUserId: userId! } }),
        ]);
        setConvDetails(details);
        setMessages(
          dbMessages.map((m: any) => ({
            id: m.id,
            senderId: m.sender_clerk_id,
            text: m.text,
            image: m.image_url,
            video: m.video_url,
            audio: m.audio_url,
            fileUrl: m.file_url,
            fileName: m.file_name,
            fileSize: m.file_size,
            mimeType: m.mime_type,
            latitude: m.latitude,
            longitude: m.longitude,
            locationLabel: m.location_label,
            contact: m.contact_payload,
            pollId: m.poll_id,
            pinned: m.pinned,
            starredByMe: m.starred_by_me || false,
            timestamp: new Date(m.created_at),
            reactions: m.reactions?.map((r: any) => r.emoji) || [],
            read: m.is_read,
            isEdited: m.is_edited || false,
            editedAt: m.edited_at ? new Date(m.edited_at) : null,
            isDeleted: m.is_deleted || false,
            replyToId: m.reply_to_message_id || null,
          }))
        );
        // Pinned messages bar
        try {
          const pins = await getPinnedMessages({ data: { conversationId: id } });
          setPinned(pins);
        } catch (err) {
          console.error("Failed to load pinned messages:", err);
        }
        // Pre-fetch polls
        const pollIds = dbMessages.filter((m: any) => m.poll_id).map((m: any) => m.poll_id);
        if (pollIds.length) {
          const results = await Promise.all(pollIds.map((pid: string) => getPoll({ data: { pollId: pid } }).catch(() => null)));
          const map: Record<string, any> = {};
          results.forEach((p: any) => { if (p) map[p.id] = p; });
          setPollData(map);
        }
        // Fetch read receipts
        const msgIds = dbMessages.map((m: any) => m.id).filter(Boolean);
        if (msgIds.length) {
          const receipts = await getReadReceipts({ data: { messageIds: msgIds } });
          const receiptMap: Record<string, string[]> = {};
          for (const r of receipts) {
            if (!receiptMap[r.message_id]) receiptMap[r.message_id] = [];
            receiptMap[r.message_id].push(r.clerk_user_id);
          }
          setReadReceipts(receiptMap);
          // Mark all messages from others as read by me
          const otherMsgIds = dbMessages.filter((m: any) => m.sender_clerk_id !== userId).map((m: any) => m.id);
          if (otherMsgIds.length) {
            markMessagesRead({ data: { clerkUserId: userId!, messageIds: otherMsgIds } }).catch(() => {});
          }
        }
        await markConversationRead({
          data: { conversationId: id, clerkUserId: userId! },
        });
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setLoading(false);
      }
    }
    loadMessages();
  }, [id, userId]);

  // Socket.io subscription — joins the per-conversation room and listens
  // for new messages, read receipts, and typing notifications.
  useEffect(() => {
    if (!userId) return;
    const socket = getSocket(userId);
    if (!socket) return;

    socket.emit("conv:join", id);

    const onNew = (payload: { conversationId: string; message: any }) => {
      if (payload.conversationId !== id) return;
      const m = payload.message;
      if (!m || m.sender_clerk_id === userId) return;
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === m.id)) return prev;
        return [...prev, {
          id: m.id,
          senderId: m.sender_clerk_id,
          text: m.text,
          image: m.image_url,
          video: m.video_url,
          audio: m.audio_url,
          fileUrl: m.file_url,
          fileName: m.file_name,
          fileSize: m.file_size,
          mimeType: m.mime_type,
          latitude: m.latitude,
          longitude: m.longitude,
          locationLabel: m.location_label,
          contact: m.contact_payload,
          pollId: m.poll_id,
          pinned: m.pinned,
          starredByMe: false,
          timestamp: new Date(m.created_at),
          reactions: [],
          read: m.is_read,
          replyToId: m.reply_to_message_id || null,
        }];
      });
      // Persist incoming socket message to Dexie cache
      upsertIncoming(m).catch(() => {});
      // Pre-fetch poll data if poll
      if (m.poll_id) {
        getPoll({ data: { pollId: m.poll_id } }).then((p: any) => {
          if (p) setPollData((prev) => ({ ...prev, [p.id]: p }));
        }).catch(() => {});
      }
      // Clear typing for the sender now that they sent a message
      setTypingUsers((prev) => prev.filter((u) => u !== m.sender_clerk_id));
      // Mark as read locally + tell peers
      markMessagesRead({ data: { clerkUserId: userId, messageIds: [m.id] } }).catch(() => {});
      markConversationRead({ data: { conversationId: id, clerkUserId: userId } }).catch(() => {});
      socket.emit("read:receipt", {
        conversationId: id,
        messageId: m.id,
        clerkUserId: userId,
      });
    };

    const onReceipt = (payload: {
      conversationId: string;
      messageId: string;
      clerkUserId: string;
    }) => {
      if (payload.conversationId !== id || payload.clerkUserId === userId) return;
      setReadReceipts((prev) => {
        const existing = prev[payload.messageId] || [];
        if (existing.includes(payload.clerkUserId)) return prev;
        return { ...prev, [payload.messageId]: [...existing, payload.clerkUserId] };
      });
    };

    const onTyping = (payload: {
      conversationId: string;
      clerkUserId: string;
      displayName: string;
    }) => {
      if (payload.conversationId !== id || payload.clerkUserId === userId) return;
      const name = payload.displayName || "Someone";
      setTypingUsers((prev) => (prev.includes(name) ? prev : [...prev, name]));
      window.setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== name));
      }, 3500);
    };

    const onTypingStop = (payload: { conversationId: string; clerkUserId: string }) => {
      if (payload.conversationId !== id || payload.clerkUserId === userId) return;
      // We don't track by clerkUserId in typingUsers (we use displayName), so just clear all
      // to avoid ghost indicators. The chat will re-add on next keystroke.
      setTypingUsers([]);
    };

    const onEdited = (payload: { conversationId: string; messageId: string; newText: string; editedAt: string }) => {
      if (payload.conversationId !== id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, text: payload.newText, isEdited: true, editedAt: new Date(payload.editedAt) }
            : m
        )
      );
    };

    const onDeleted = (payload: { conversationId: string; messageId: string }) => {
      if (payload.conversationId !== id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, isDeleted: true, text: null, image: null, video: null, audio: null, reactions: [] }
            : m
        )
      );
    };

    const onPollVoted = (payload: { conversationId: string; pollId: string }) => {
      if (payload.conversationId !== id) return;
      // Re-fetch tallies for that poll
      getPoll({ data: { pollId: payload.pollId } })
        .then((p: any) => {
          if (p) setPollData((prev) => ({ ...prev, [p.id]: p }));
        })
        .catch(() => {});
    };

    // Track live presence for the peer (1:1 chats only).
    // Uses convDetailsRef (not convDetails) so this always sees the latest
    // conversation details even though this effect only re-runs on [id, userId].
    const onPresence = (data: { clerkUserId: string; online: boolean }) => {
      const peer = convDetailsRef.current?.members?.find((m: any) => m.clerk_user_id !== userId);
      if (peer && data.clerkUserId === peer.clerk_user_id) {
        setPeerOnline(data.online);
      }
    };

    socket.on("message:new", onNew);
    socket.on("read:receipt", onReceipt);
    socket.on("typing", onTyping);
    socket.on("typing:stop", onTypingStop);
    socket.on("message:edited", onEdited);
    socket.on("message:deleted", onDeleted);
    socket.on("poll:voted", onPollVoted);
    socket.on("presence:update", onPresence);

    return () => {
      socket.off("message:new", onNew);
      socket.off("read:receipt", onReceipt);
      socket.off("typing", onTyping);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:edited", onEdited);
      socket.off("message:deleted", onDeleted);
      socket.off("poll:voted", onPollVoted);
      socket.off("presence:update", onPresence);
      socket.emit("conv:leave", id);
    };
  }, [id, userId]);

  // Throttled "typing" event + debounced "typing:stop" over the socket
  const broadcastTyping = useCallback(() => {
    if (!userId) return;
    const socket = getSocket(userId);
    if (!socket) return;
    const myName = convDetails?.members?.find((m: any) => m.clerk_user_id === userId)?.display_name || "Someone";

    // Throttle the typing:start event (max once per 2s)
    const now = Date.now();
    if (now - lastTypingRef.current >= 2000) {
      lastTypingRef.current = now;
      socket.emit("typing", { conversationId: id, clerkUserId: userId, displayName: myName });
    }

    // Debounced stop — clear any existing timer and restart
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing:stop", { conversationId: id, clerkUserId: userId });
    }, 2500);
  }, [userId, id, convDetails]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  // Load per-conversation wallpaper for premium users
  useEffect(() => {
    if (!userId || !isPremium) return;
    getConversationWallpaper({ data: { clerkUserId: userId, conversationId: id } })
      .then(({ wallpaperUrl }) => { if (wallpaperUrl) setWallpaper(wallpaperUrl); })
      .catch(() => {});
  }, [id, userId, isPremium]);

  // Outgoing call: send the invite to the peer, then mount the modal which
  // grabs media + creates the SDP offer.
  const startCall = useCallback(
    (kind: "audio" | "video") => {
      if (!userId || !convDetails) return;
      const peer = convDetails.members?.find((m: any) => m.clerk_user_id !== userId);
      if (!peer) return;

      const me = convDetails.members?.find((m: any) => m.clerk_user_id === userId);
      const myName = me?.display_name || "Someone";

      getSocket(userId)?.emit("call:invite", {
        toClerkId: peer.clerk_user_id,
        fromClerkId: userId,
        fromName: myName,
        fromAvatar: me?.avatar_url || null,
        conversationId: id,
        kind,
      });

      setCallSession({
        role: "caller",
        kind,
        peerClerkId: peer.clerk_user_id,
        peerName: peer.display_name || "User",
        peerAvatar: peer.avatar_url || null,
        conversationId: id,
      });
    },
    [userId, convDetails, id]
  );

  // Auto-start call when route opened with ?call=audio|video (from /calls page)
  const search = Route.useSearch();
  const autoCallTriggered = useRef(false);
  useEffect(() => {
    if (autoCallTriggered.current) return;
    if (!search.call) return;
    if (!convDetails || convDetails.type === "group") return;
    autoCallTriggered.current = true;
    startCall(search.call);
    // Strip the search param so a refresh doesn't re-dial
    navigate({ to: "/chat/$id", params: { id }, search: {}, replace: true });
  }, [search.call, convDetails, startCall, navigate, id]);

  // Group member management
  const openGroupSettings = useCallback(async () => {
    if (!userId || convDetails?.type !== "group") return;
    setShowGroupSettings(true);
    setLoadingProfiles(true);
    try {
      const profiles = await getAllProfiles({ data: { clerkUserId: userId } });
      setAllProfiles(profiles);
    } catch (err) {
      console.error("Failed to load profiles:", err);
    } finally {
      setLoadingProfiles(false);
    }
  }, [userId, convDetails]);

  const handleAddMember = useCallback(async (memberClerkId: string) => {
    if (!userId) return;
    try {
      await addGroupMember({ data: { clerkUserId: userId, conversationId: id, memberClerkId } });
      const details = await getConversationDetails({ data: { conversationId: id, clerkUserId: userId } });
      setConvDetails(details);
    } catch (err: any) {
      alert(err.message || "Failed to add member");
    }
  }, [userId, id]);

  const handleRemoveMember = useCallback(async (memberClerkId: string) => {
    if (!userId) return;
    try {
      await removeGroupMember({ data: { clerkUserId: userId, conversationId: id, memberClerkId } });
      const details = await getConversationDetails({ data: { conversationId: id, clerkUserId: userId } });
      setConvDetails(details);
    } catch (err: any) {
      alert(err.message || "Failed to remove member");
    }
  }, [userId, id]);

  const handleLeaveGroup = useCallback(async () => {
    if (!userId || convDetails?.type !== "group") return;
    if (!confirm("Are you sure you want to leave this group?")) return;
    try {
      await leaveGroup({ data: { clerkUserId: userId, conversationId: id } });
      navigate({ to: "/" });
    } catch (err: any) {
      alert(err.message || "Failed to leave group");
    }
  }, [userId, id, convDetails, navigate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) return;
    if (file.size > 20 * 1024 * 1024) { alert("File size must be under 20MB"); return; }
    const url = URL.createObjectURL(file);
    setMediaPreview({ file, url, type: isImage ? "image" : "video" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearMediaPreview = () => {
    if (mediaPreview) { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }
  };

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    return new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      mediaRecorder.stop();
      setRecording(false);
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    }
    setRecording(false);
    setRecordingDuration(0);
    chunksRef.current = [];
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  }, []);

  const sendVoiceMessage = useCallback(async () => {
    if (!userId) return;
    const blob = await stopRecording();
    if (!blob || blob.size === 0) return;

    setUploading(true);
    const optimisticId = `msg-${Date.now()}`;
    const localUrl = URL.createObjectURL(blob);
    setMessages((prev) => [...prev, {
      id: optimisticId, senderId: userId, audio: localUrl,
      timestamp: new Date(), reactions: [], read: false,
    }]);

    try {
      const base64 = await blobToBase64(blob);
      const saved = await uploadChatMedia({
        data: {
          clerkUserId: userId,
          conversationId: id,
          fileName: `voice-${Date.now()}.webm`,
          fileBase64: base64,
          contentType: "audio/webm",
        },
      });
      if (saved) {
        setMessages((prev) => prev.map((m) =>
          m.id === optimisticId
            ? { ...m, id: saved.id, audio: (saved as any).audio_url, timestamp: new Date(saved.created_at) }
            : m
        ));
        const participantIds = convDetails?.members?.map((m: any) => m.clerk_user_id) ?? [];
        getSocket(userId)?.emit("message:sent", {
          conversationId: id,
          message: saved,
          participantIds,
        });
      }
    } catch (err) {
      console.error("Failed to send voice message:", err);
    } finally {
      setUploading(false);
    }
  }, [userId, id, stopRecording, convDetails]);

  const handleSendMessage = async () => {
    if (!userId) return;

    if (mediaPreview) {
      setUploading(true);
      const optimisticId = `msg-${Date.now()}`;
      const optimisticMsg: any = {
        id: optimisticId, senderId: userId, text: input.trim() || null,
        image: mediaPreview.type === "image" ? mediaPreview.url : undefined,
        video: mediaPreview.type === "video" ? mediaPreview.url : undefined,
        timestamp: new Date(), reactions: [], read: false,
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      const captionText = input.trim();
      setInput("");
      clearMediaPreview();

      try {
        const base64 = await fileToBase64(mediaPreview.file);
        const saved = await uploadChatMedia({
          data: {
            clerkUserId: userId, conversationId: id,
            fileName: mediaPreview.file.name, fileBase64: base64, contentType: mediaPreview.file.type,
          },
        });
        if (saved) {
          setMessages((prev) => prev.map((m) =>
            m.id === optimisticId
              ? { ...m, id: saved.id, image: (saved as any).image_url, video: (saved as any).video_url, timestamp: new Date(saved.created_at) }
              : m
          ));
          const participantIds = convDetailsRef.current?.members?.map((m: any) => m.clerk_user_id) ?? [];
          getSocket(userId)?.emit("message:sent", {
            conversationId: id,
            message: saved,
            participantIds,
          });
        }
        if (captionText) {
          const captionSaved = await sendMessageFn({ data: { conversationId: id, text: captionText, clerkUserId: userId } });
          if (captionSaved) {
            const participantIds = convDetailsRef.current?.members?.map((m: any) => m.clerk_user_id) ?? [];
            getSocket(userId)?.emit("message:sent", {
              conversationId: id,
              message: captionSaved,
              participantIds,
            });
          }
        }
      } catch (err) {
        console.error("Failed to upload media:", err);
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!input.trim()) return;
    const replyingTo = replyTo;
    const newMsg: Message = {
      id: `msg-${Date.now()}`, senderId: userId, text: input.trim(),
      timestamp: new Date(), reactions: [], read: false,
    };
    setMessages((prev) => [...prev, { ...newMsg, replyToId: replyingTo?.id ?? null }]);
    const text = input.trim();
    setInput("");
    setReplyTo(null);

    // Write optimistic message to Dexie so it survives a page refresh
    addOptimistic({
      id: newMsg.id,
      conversation_id: id,
      sender_clerk_id: userId,
      text,
      image_url: null, video_url: null, audio_url: null,
      file_url: null, file_name: null,
      created_at: newMsg.timestamp.toISOString(),
      is_deleted: false, is_edited: false, starred_by_me: false,
      isPending: true, reactions: [],
    }).catch(() => {});

    try {
      const saved = await sendMessageFn({
        data: {
          conversationId: id, text, clerkUserId: userId,
          replyToMessageId: replyingTo?.id,
        },
      });
      if (saved) {
        setMessages((prev) => prev.map((m) =>
          m.id === newMsg.id ? { ...m, id: saved.id, timestamp: new Date(saved.created_at), replyToId: saved.reply_to_message_id ?? null } : m
        ));
        // Replace pending Dexie entry with the confirmed server record
        confirmOptimistic(newMsg.id, saved).catch(() => {});
        // Push to peers via Socket.io — DB has the message persisted, this only fans out live.
        const participantIds = convDetailsRef.current?.members?.map((m: any) => m.clerk_user_id) ?? [];
        getSocket(userId)?.emit("message:sent", {
          conversationId: id,
          message: saved,
          participantIds,
        });
      }
      // AI command — available to all users; model quality depends on tier
      const aiQuestion = aiMode ? text.trim() : (text.toLowerCase().startsWith("@ai ") ? text.slice(4).trim() : null);
      if (aiQuestion) {
        const aiId = `ai-${Date.now()}`;
        setAiThinkingId(aiId);
        setMessages((prev) => [...prev, {
          id: aiId, senderId: "ai-assistant",
          text: "✨ Thinking…",
          timestamp: new Date(), reactions: [], read: false,
          isAiMessage: true,
        }]);
        aiChatAssist({
          data: {
            clerkUserId: userId,
            question: aiQuestion,
            recentMessages: messages.slice(-8)
              .filter((m: any) => m.text && m.senderId !== "ai-assistant")
              .map((m: any) => ({
                sender: m.senderId === userId
                  ? "You"
                  : (convDetails?.members?.find((p: any) => p.clerk_user_id === m.senderId)?.display_name || "User"),
                text: m.text!,
              })),
          },
        }).then(({ reply }) => {
          setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, text: reply } : m));
          setAiThinkingId(null);
        }).catch(() => {
          setMessages((prev) => prev.filter((m) => m.id !== aiId));
          setAiThinkingId(null);
        });
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      // Remove the stuck pending entry from Dexie so it doesn't persist forever
      removePending(newMsg.id).catch(() => {});
    }
  };

  // Forward message to another conversation
  const openForwardPicker = useCallback(async (msg: any) => {
    setContextMenu(null);
    setForwardMsg({
      text: msg.text ?? null,
      image: msg.image ?? null,
      video: msg.video ?? null,
      audio: msg.audio ?? null,
    });
    setShowForwardPicker(true);
    if (!forwardConvs.length && userId) {
      const convs = await getConversations({ data: { clerkUserId: userId } });
      setForwardConvs(convs.filter((c: any) => c.id !== id));
    }
  }, [userId, id, forwardConvs]);

  const handleForward = useCallback(async (targetConvId: string) => {
    if (!forwardMsg || !userId) return;
    setShowForwardPicker(false);
    try {
      if (forwardMsg.video || forwardMsg.audio) {
        // Backend's sendMessage only accepts text + imageUrl today, so video/audio
        // can't be forwarded yet — tell the user instead of silently dropping it.
        alert("Forwarding video and voice messages isn't supported yet.");
      } else if (forwardMsg.image || forwardMsg.text) {
        const saved = await sendMessageFn({
          data: {
            conversationId: targetConvId,
            text: forwardMsg.text || undefined,
            imageUrl: forwardMsg.image || undefined,
            clerkUserId: userId,
          },
        });
        if (saved) {
          const participantIds: string[] = [];
          getSocket(userId)?.emit("message:sent", { conversationId: targetConvId, message: saved, participantIds });
        }
      }
    } catch (err) {
      console.error("Forward failed:", err);
      alert("Failed to forward message");
    }
    setForwardMsg(null);
  }, [forwardMsg, userId]);

  const startEditing = useCallback((msgId: string, currentText: string) => {
    setContextMenu(null);
    setShowReactions(null);
    setEditingMessageId(msgId);
    setEditingText(currentText);
    setInput(currentText);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingMessageId(null);
    setEditingText("");
    setInput("");
  }, []);

  const handleEditMessage = useCallback(async () => {
    if (!userId || !editingMessageId || !input.trim()) return;
    const newText = input.trim();
    const now = new Date().toISOString();

    setMessages((prev) =>
      prev.map((m) =>
        m.id === editingMessageId
          ? { ...m, text: newText, isEdited: true, editedAt: new Date(now) }
          : m
      )
    );
    setInput("");
    setEditingMessageId(null);
    setEditingText("");

    try {
      const updated = await editMessageFn({ data: { clerkUserId: userId, messageId: editingMessageId, newText } });
      if (updated) {
        getSocket(userId)?.emit("message:edit", {
          conversationId: id,
          messageId: editingMessageId,
          newText: updated.text!,
          editedAt: updated.edited_at!,
        });
      }
    } catch (err) {
      console.error("Failed to edit message:", err);
    }
  }, [userId, editingMessageId, input, id]);

  const handleDeleteForMe = useCallback((msgId: string) => {
    setContextMenu(null);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  }, []);

  const handleDeleteForEveryone = useCallback(async (msgId: string) => {
    setContextMenu(null);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, isDeleted: true, text: null, image: null, video: null, audio: null, reactions: [] }
          : m
      )
    );
    try {
      await deleteMessageFn({ data: { clerkUserId: userId!, messageId: msgId } });
      getSocket(userId!)?.emit("message:delete", { conversationId: id, messageId: msgId });
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  }, [userId, id]);

  const handleAddReaction = async (msgId: string, emoji: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId
        ? { ...m, reactions: m.reactions.includes(emoji) ? m.reactions.filter((r: string) => r !== emoji) : [...m.reactions, emoji] }
        : m
    ));
    setShowReactions(null);
    try {
      await addReactionFn({ data: { messageId: msgId, emoji, clerkUserId: userId! } });
    } catch (err) {
      console.error("Failed to add reaction:", err);
    }
  };

  // ════════ Pin / Star / Block / Report ════════
  const handleTogglePin = useCallback(async (msgId: string) => {
    if (!userId) return;
    setContextMenu(null);
    try {
      const r = await togglePinMessage({ data: { clerkUserId: userId, messageId: msgId } });
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, pinned: r.pinned } : m));
      const pins = await getPinnedMessages({ data: { conversationId: id } });
      setPinned(pins);
    } catch (err: any) {
      alert(err.message || "Pin failed");
    }
  }, [userId, id]);

  const handleToggleStar = useCallback(async (msgId: string) => {
    if (!userId) return;
    setContextMenu(null);
    try {
      const r = await toggleStarMessage({ data: { clerkUserId: userId, messageId: msgId } });
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, starredByMe: r.starred } : m));
    } catch (err: any) {
      alert(err.message || "Star failed");
    }
  }, [userId]);

  const handleBlockSender = useCallback(async (senderId: string) => {
    if (!userId || senderId === userId) return;
    setContextMenu(null);
    if (!confirm("Block this user? You won't see their messages anymore.")) return;
    try {
      await blockUser({ data: { clerkUserId: userId, targetClerkId: senderId } });
      alert("User blocked.");
    } catch (err: any) {
      alert(err.message || "Block failed");
    }
  }, [userId]);

  const handleTranslate = useCallback(async (msgId: string, text: string) => {
    if (!userId || !isPro) return;
    setContextMenu(null);
    const lang = (prompt("Translate to which language? (e.g. Spanish, French, Japanese)") || "").trim();
    if (!lang) return;
    setTranslatingMsgId(msgId);
    try {
      const { translated } = await translateMessage({ data: { clerkUserId: userId, text, targetLanguage: lang } });
      setTranslations((prev) => ({ ...prev, [msgId]: { lang, text: translated } }));
    } catch (err: any) {
      console.error("Translation failed:", err);
      alert(err?.message || "Translation failed");
    } finally {
      setTranslatingMsgId(null);
    }
  }, [userId, isPro]);

  const handleSetWallpaper = useCallback(async (url: string) => {
    if (!userId || !isPremium) return;
    setWallpaper(url || null);
    setShowWallpaperPicker(false);
    try {
      if (url) {
        await setConversationWallpaper({ data: { clerkUserId: userId, conversationId: id, wallpaperUrl: url } });
      }
    } catch (err) {
      console.error("Failed to save wallpaper:", err);
    }
  }, [userId, id, isPremium]);

  const handleExportChat = useCallback(async () => {
    if (!userId || !isPro) return;
    setContextMenu(null);
    try {
      const { html } = await exportChatHistory({ data: { clerkUserId: userId, conversationId: id } });
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `chat-export-${id.slice(0, 8)}.html`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { alert(err?.message || "Export failed"); }
  }, [userId, id, isPro]);

  const handleReportMessage = useCallback(async (msgId: string) => {
    if (!userId) return;
    setContextMenu(null);
    const reason = prompt("Why are you reporting this message?");
    if (!reason || !reason.trim()) return;
    try {
      await reportTarget({ data: { clerkUserId: userId, targetType: "message", targetId: msgId, reason: reason.trim() } });
      alert("Report submitted. Thanks for letting us know.");
    } catch (err: any) {
      alert(err.message || "Report failed");
    }
  }, [userId]);

  // ════════ Attach: document, location, contact, poll ════════
  const handleDocPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    const maxDocSize = isPremium ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxDocSize) { alert(`File must be under ${isPremium ? "500MB" : "50MB"}`); if (e.target) e.target.value = ""; return; }
    setUploadingDoc(true);
    setShowAttach(false);
    try {
      const reader = new FileReader();
      const b64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const saved = await uploadDocumentMessage({
        data: {
          clerkUserId: userId,
          conversationId: id,
          fileName: file.name,
          fileBase64: b64,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
        },
      });
      if (saved) {
        setMessages((prev) => [...prev, {
          id: saved.id, senderId: userId,
          fileUrl: (saved as any).file_url, fileName: (saved as any).file_name,
          fileSize: (saved as any).file_size, mimeType: (saved as any).mime_type,
          timestamp: new Date(saved.created_at), reactions: [], read: false,
        }]);
        const participantIds = convDetails?.members?.map((m: any) => m.clerk_user_id) ?? [];
        getSocket(userId)?.emit("message:sent", { conversationId: id, message: saved, participantIds });
      }
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setUploadingDoc(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleShareLocation = async () => {
    if (!userId) return;
    setShowAttach(false);
    if (!navigator.geolocation) { alert("Geolocation is not supported"); return; }
    setUploadingDoc(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const saved = await sendLocationMessage({
        data: {
          clerkUserId: userId,
          conversationId: id,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          label: "My location",
        },
      });
      if (saved) {
        setMessages((prev) => [...prev, {
          id: saved.id, senderId: userId,
          latitude: (saved as any).latitude, longitude: (saved as any).longitude,
          locationLabel: (saved as any).location_label,
          timestamp: new Date(saved.created_at), reactions: [], read: false,
        }]);
        const participantIds = convDetails?.members?.map((m: any) => m.clerk_user_id) ?? [];
        getSocket(userId)?.emit("message:sent", { conversationId: id, message: saved, participantIds });
      }
    } catch (err: any) {
      alert(err.message || "Could not get location");
    } finally { setUploadingDoc(false); }
  };

  const openContactPicker = async () => {
    if (!userId) return;
    setShowAttach(false);
    if (!allProfiles.length) {
      try {
        const profs = await getAllProfiles({ data: { clerkUserId: userId } });
        setAllProfiles(profs);
      } catch (err) {
        console.error("Failed to load profiles for contact picker:", err);
      }
    }
    setShowContactPicker(true);
  };

  const handleSendContact = async (contactClerkId: string) => {
    if (!userId) return;
    setShowContactPicker(false);
    try {
      const saved = await sendContactMessage({
        data: { clerkUserId: userId, conversationId: id, contactClerkId },
      });
      if (saved) {
        setMessages((prev) => [...prev, {
          id: saved.id, senderId: userId,
          contact: (saved as any).contact_payload,
          timestamp: new Date(saved.created_at), reactions: [], read: false,
        }]);
        const participantIds = convDetails?.members?.map((m: any) => m.clerk_user_id) ?? [];
        getSocket(userId)?.emit("message:sent", { conversationId: id, message: saved, participantIds });
      }
    } catch (err: any) {
      alert(err.message || "Failed to share contact");
    }
  };

  const handleCreatePoll = async () => {
    if (!userId) return;
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQ.trim() || opts.length < 2) { alert("Need a question and at least 2 options"); return; }
    setCreatingPoll(true);
    try {
      const r = await createPoll({
        data: {
          clerkUserId: userId,
          conversationId: id,
          question: pollQ.trim(),
          options: opts,
          allowMultiple: pollMulti,
        },
      });
      if (r?.message) {
        setMessages((prev) => [...prev, {
          id: r.message.id, senderId: userId,
          text: r.message.text, pollId: r.poll.id,
          timestamp: new Date(r.message.created_at), reactions: [], read: false,
        }]);
        // load poll data
        const pd = await getPoll({ data: { pollId: r.poll.id } });
        if (pd) setPollData((p) => ({ ...p, [pd.id]: pd }));
        const participantIds = convDetails?.members?.map((m: any) => m.clerk_user_id) ?? [];
        getSocket(userId)?.emit("message:sent", { conversationId: id, message: r.message, participantIds });
      }
      setShowPollModal(false);
      setPollQ(""); setPollOptions(["", ""]); setPollMulti(false);
    } catch (err: any) {
      alert(err.message || "Failed to create poll");
    } finally { setCreatingPoll(false); }
  };

  const handleVotePoll = async (pollId: string, optionId: string) => {
    if (!userId) return;
    try {
      await votePoll({ data: { clerkUserId: userId, pollId, optionId } });
      const pd = await getPoll({ data: { pollId } });
      if (pd) setPollData((p) => ({ ...p, [pd.id]: pd }));
      // Tell others in the room to re-fetch their tallies
      getSocket(userId)?.emit("poll:vote", { conversationId: id, pollId });
    } catch (err: any) {
      alert(err.message || "Vote failed");
    }
  };

  const formatBytes = (n: number | null | undefined) => {
    if (!n || n < 1024) return `${n || 0} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 pb-2 pt-[max(env(safe-area-inset-top),8px)]">
        {searchMode ? (
          <>
            <button onClick={() => { setSearchMode(false); setSearchQuery(""); }} className="p-1 text-primary">
              <X size={22} />
            </button>
            <input
              autoFocus
              type="text"
              placeholder="Search messages…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
            />
            {searchQuery && (
              <span className="text-xs text-muted-foreground">
                {messages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase())).length} found
              </span>
            )}
          </>
        ) : (
          <>
            <button onClick={() => navigate({ to: "/" })} className="p-1 text-primary">
              <ArrowLeft size={22} />
            </button>
            <button
              className="flex-1 flex items-center gap-2 min-w-0 text-left"
              onClick={() => setShowHeaderPreview(true)}
            >
              {(() => {
                const otherMember = convDetails?.members?.find((m: any) => m.clerk_user_id !== userId);
                const avatarUrl = convDetails?.type === "group" ? convDetails?.avatar_url : otherMember?.avatar_url;
                const initial =
                  (convDetails?.type === "group" ? convDetails?.name : otherMember?.display_name)?.[0]?.toUpperCase() || "U";
                return (
                  <div className="size-9 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">{initial}</span>
                    )}
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <h2 className="text-[15px] font-semibold text-foreground truncate">
                    {convDetails?.type === "group"
                      ? (convDetails.name || "Group Chat")
                      : convDetails?.members?.find((m: any) => m.clerk_user_id !== userId)?.display_name || "Chat"}
                  </h2>
                  {(() => {
                    const peer = convDetails?.members?.find((m: any) => m.clerk_user_id !== userId);
                    if (!peer || convDetails?.type === "group") return null;
                    if (peer.is_admin) return <BadgeCheck size={14} className="text-red-500 shrink-0" />;
                    if (peer.verified || peer.subscription_tier === "pro") return <BadgeCheck size={14} className="text-primary shrink-0" />;
                    return null;
                  })()}
                </div>
                {convDetails?.type === "group" ? (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {typingUsers.length > 0
                      ? <span className="text-primary">{typingUsers.join(", ")} typing…</span>
                      : convDetails.members?.map((m: any) => m.display_name || "User").join(", ")}
                  </p>
                ) : (
                  <p className="text-[11px] truncate">
                    {typingUsers.length > 0 ? (
                      <span className="text-primary">typing…</span>
                    ) : peerOnline === true ? (
                      <span className="text-online font-medium">Online</span>
                    ) : peerOnline === false ? (
                      <span className="text-muted-foreground">Offline</span>
                    ) : null}
                  </p>
                )}
              </div>
            </button>
            <div className="flex gap-1">
              {isPremium && (
                <button className="p-2 text-muted-foreground hover:text-amber-500" onClick={() => setShowWallpaperPicker(true)} title="Chat wallpaper">
                  <Palette size={18} />
                </button>
              )}
              {isPro && (
                <button className="p-2 text-muted-foreground hover:text-violet-500" onClick={handleExportChat} title="Export chat">
                  <Download size={18} />
                </button>
              )}
              <button className="p-2 text-muted-foreground" onClick={() => setSearchMode(true)} title="Search">
                <Search size={18} />
              </button>
              {convDetails?.type !== "group" && (
                <>
                  <button className="p-2 text-muted-foreground hover:text-foreground" onClick={() => startCall("audio")} title="Voice call">
                    <Phone size={18} />
                  </button>
                  <button className="p-2 text-muted-foreground hover:text-foreground" onClick={() => startCall("video")} title="Video call">
                    <Video size={18} />
                  </button>
                </>
              )}
              {convDetails?.type === "group" && (
                <button className="p-2 text-muted-foreground" onClick={() => navigate({ to: "/group/$id", params: { id } })} title="Group info"><Settings size={18} /></button>
              )}
            </div>
          </>
        )}
      </header>

      {/* Pinned messages bar */}
      {pinned.length > 0 && (
        <button
          onClick={() => setPinnedIdx((i) => (i + 1) % pinned.length)}
          className="flex items-center gap-2 w-full px-3 py-2 bg-primary/8 border-b border-primary/20 text-left"
        >
          <Pin size={14} className="text-primary shrink-0 rotate-45" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-primary font-semibold">
              Pinned message{pinned.length > 1 ? `s · ${pinnedIdx + 1}/${pinned.length}` : ""}
            </p>
            <p className="text-xs text-foreground truncate">
              {(() => {
                const p = pinned[pinnedIdx];
                if (!p) return "";
                if (p.image_url) return "📷 Photo";
                if (p.video_url) return "🎥 Video";
                if (p.audio_url) return "🎤 Voice message";
                if (p.file_url) return `📎 ${p.file_name || "File"}`;
                if (p.latitude && p.longitude) return "📍 Location";
                if (p.contact_payload) return `👤 ${p.contact_payload?.name || "Contact"}`;
                if (p.poll_id) return `📊 ${p.text || "Poll"}`;
                return p.text || "Message";
              })()}
            </p>
          </div>
        </button>
      )}
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4 space-y-1"
        style={wallpaper ? { backgroundImage: `url(${wallpaper})`, backgroundSize: "cover", backgroundAttachment: "local", backgroundPosition: "center" } : {}}
        onClick={() => { setContextMenu(null); if (showReactions) setShowReactions(null); }}
      >
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">No messages yet. Say hello! 👋</p>
          </div>
        )}
        {messages
          .filter((msg) =>
            !searchMode || !searchQuery ||
            (msg.text && msg.text.toLowerCase().includes(searchQuery.toLowerCase()))
          )
          .map((msg) => {
          const isMine = msg.senderId === userId;
          const isAiMessage = msg.senderId === "ai-assistant";
          const isSearchMatch = searchMode && searchQuery && msg.text?.toLowerCase().includes(searchQuery.toLowerCase());
          const isGroup = convDetails?.type === "group";
          const senderProfile = isGroup && !isMine && !isAiMessage
            ? convDetails?.members?.find((m: any) => m.clerk_user_id === msg.senderId)
            : null;
          const isContextOpen = contextMenu?.msgId === msg.id;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div className="relative max-w-[80%]">
                <div
                  className={`rounded-2xl px-3.5 py-2 ${
                    isAiMessage
                      ? "bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 border border-violet-500/25 text-foreground rounded-bl-md"
                      : isMine
                      ? "bg-bubble-sent text-bubble-sent-foreground rounded-br-md"
                      : "bg-bubble-received text-bubble-received-foreground rounded-bl-md"
                  } ${editingMessageId === msg.id ? "ring-2 ring-primary" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!msg.isDeleted) {
                      setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY });
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (contextMenu) { setContextMenu(null); return; }
                    if (showReactions && showReactions !== msg.id) setShowReactions(null);
                  }}
                >
                  {isAiMessage && (
                    <p className="text-[11px] font-semibold text-violet-400 mb-0.5 flex items-center gap-1">
                      <Brain size={10} className="shrink-0" /> AI Assistant
                    </p>
                  )}
                  {senderProfile && !isAiMessage && (
                    <p className="text-[11px] font-semibold text-primary mb-0.5">{senderProfile.display_name || "User"}</p>
                  )}

                  {/* Reply preview */}
                  {msg.replyToId && (() => {
                    const parent = messages.find((m: any) => m.id === msg.replyToId);
                    if (!parent) return null;
                    const parentSender = convDetails?.members?.find((m: any) => m.clerk_user_id === parent.senderId);
                    const parentName = parent.senderId === userId ? "You" : (parentSender?.display_name || "User");
                    return (
                      <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[12px] ${isMine ? "border-bubble-sent-foreground/40 bg-black/10" : "border-primary/60 bg-primary/10"}`}>
                        <p className={`font-semibold ${isMine ? "text-bubble-sent-foreground/80" : "text-primary"} truncate`}>{parentName}</p>
                        <p className={`truncate ${isMine ? "text-bubble-sent-foreground/70" : "text-muted-foreground"}`}>
                          {parent.isDeleted ? "Deleted message" : parent.audio ? "🎤 Voice message" : parent.image ? "📷 Photo" : parent.video ? "🎥 Video" : (parent.text || "")}
                        </p>
                      </div>
                    );
                  })()}

                  {msg.isDeleted ? (
                    <p className={`text-[14px] italic opacity-60 flex items-center gap-1.5`}>
                      <Trash2 size={13} className="shrink-0" />
                      {isMine ? "You deleted this message" : "This message was deleted"}
                    </p>
                  ) : (
                    <>
                      {msg.image && <img src={msg.image} alt="" className="rounded-xl mb-1.5 max-w-full max-h-60 object-cover" />}
                      {msg.video && <video src={msg.video} controls playsInline preload="metadata" className="rounded-xl mb-1.5 max-w-full max-h-60" />}
                      {msg.audio && <AudioPlayer src={msg.audio} isMine={isMine} />}

                      {/* Document */}
                      {msg.fileUrl && !msg.image && !msg.video && !msg.audio && (
                        <a
                          href={msg.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={msg.fileName}
                          className={`flex items-center gap-2.5 mb-1 rounded-xl p-2 ${isMine ? "bg-black/15" : "bg-secondary"}`}
                        >
                          <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${isMine ? "bg-black/20" : "bg-primary/15"}`}>
                            <FileText size={18} className={isMine ? "text-bubble-sent-foreground" : "text-primary"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium truncate ${isMine ? "text-bubble-sent-foreground" : "text-foreground"}`}>
                              {msg.fileName || "File"}
                            </p>
                            <p className={`text-[10px] ${isMine ? "text-bubble-sent-foreground/60" : "text-muted-foreground"}`}>
                              {formatBytes(msg.fileSize)}
                            </p>
                          </div>
                          <Download size={14} className={isMine ? "text-bubble-sent-foreground/70" : "text-muted-foreground"} />
                        </a>
                      )}

                      {/* Location */}
                      {msg.latitude != null && msg.longitude != null && (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${msg.latitude}&mlon=${msg.longitude}#map=16/${msg.latitude}/${msg.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mb-1 rounded-xl overflow-hidden border border-border bg-secondary"
                          style={{ width: 220 }}
                        >
                          <img
                            alt="map"
                            className="block w-full h-28 object-cover"
                            src={`https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=440&height=224&center=lonlat:${msg.longitude},${msg.latitude}&zoom=14&marker=lonlat:${msg.longitude},${msg.latitude};color:%23ff0000&apiKey=`}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${isMine ? "text-bubble-sent-foreground" : "text-foreground"}`}>
                            <MapPin size={14} className="text-primary" />
                            <span className="text-xs">{msg.locationLabel || "Shared location"}</span>
                          </div>
                        </a>
                      )}

                      {/* Contact */}
                      {msg.contact && (
                        <div className={`flex items-center gap-2.5 mb-1 rounded-xl p-2 ${isMine ? "bg-black/15" : "bg-secondary"}`}>
                          <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center overflow-hidden shrink-0">
                            {msg.contact.avatar_url ? (
                              <img src={msg.contact.avatar_url} className="h-full w-full object-cover" />
                            ) : (
                              <UserIcon size={16} className="text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium truncate ${isMine ? "text-bubble-sent-foreground" : "text-foreground"}`}>
                              {msg.contact.name || "Contact"}
                            </p>
                            {msg.contact.username && (
                              <p className={`text-[10px] truncate ${isMine ? "text-bubble-sent-foreground/60" : "text-muted-foreground"}`}>
                                @{msg.contact.username}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Poll */}
                      {msg.pollId && (() => {
                        const poll = pollData[msg.pollId];
                        if (!poll) return <p className="text-xs italic opacity-60">Loading poll…</p>;
                        const totalVotes = (poll.options || []).reduce((sum: number, o: any) => sum + (o.votes?.length || 0), 0);
                        return (
                          <div className="mb-1 min-w-[220px]">
                            <p className={`text-[14px] font-medium mb-2 ${isMine ? "text-bubble-sent-foreground" : "text-foreground"}`}>
                              {poll.question}
                            </p>
                            <div className="space-y-1.5">
                              {(poll.options || []).map((opt: any) => {
                                const myVote = (opt.votes || []).includes(userId!);
                                const pct = totalVotes ? Math.round(((opt.votes?.length || 0) / totalVotes) * 100) : 0;
                                return (
                                  <button
                                    key={opt.id}
                                    onClick={(e) => { e.stopPropagation(); handleVotePoll(poll.id, opt.id); }}
                                    className={`relative w-full text-left rounded-lg px-2.5 py-1.5 text-[13px] overflow-hidden ${
                                      isMine ? "bg-black/15" : "bg-secondary"
                                    } ${myVote ? "ring-2 ring-primary" : ""}`}
                                  >
                                    <div
                                      className={`absolute inset-y-0 left-0 ${isMine ? "bg-black/15" : "bg-primary/12"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                    <div className="relative flex items-center justify-between gap-2">
                                      <span className={`${isMine ? "text-bubble-sent-foreground" : "text-foreground"}`}>
                                        {myVote && "✓ "}{opt.text}
                                      </span>
                                      <span className={`text-[11px] tabular-nums ${isMine ? "text-bubble-sent-foreground/70" : "text-muted-foreground"}`}>
                                        {opt.votes?.length || 0}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <p className={`text-[10px] mt-1.5 ${isMine ? "text-bubble-sent-foreground/60" : "text-muted-foreground"}`}>
                              {totalVotes} vote{totalVotes !== 1 ? "s" : ""}{poll.allow_multiple ? " · Multiple choice" : ""}
                            </p>
                          </div>
                        );
                      })()}

                      {/* Pin/Star indicators */}
                      {(msg.pinned || msg.starredByMe) && (
                        <div className="flex items-center gap-1 mb-0.5">
                          {msg.pinned && <Pin size={10} className={`rotate-45 ${isMine ? "text-bubble-sent-foreground/70" : "text-primary"}`} />}
                          {msg.starredByMe && <Star size={10} className="text-amber-400 fill-amber-400" />}
                        </div>
                      )}

                      {msg.text && !msg.pollId && translations[msg.id] && (
                        <div className={`mb-1 rounded-lg px-2 py-1 text-[12px] italic border ${isMine ? "border-bubble-sent-foreground/20 bg-black/10 text-bubble-sent-foreground/80" : "border-border bg-secondary/60 text-muted-foreground"}`}>
                          <span className="text-[10px] font-medium not-italic opacity-70">🌐 {translations[msg.id].lang} · </span>
                          {translations[msg.id].text}
                        </div>
                      )}
                      {msg.text && !msg.pollId && (
                        <p className="text-[15px] leading-snug">
                          {isSearchMatch ? (() => {
                            const lower = msg.text!.toLowerCase();
                            const q = searchQuery.toLowerCase();
                            const parts: ReactNode[] = [];
                            let last = 0;
                            let idx = lower.indexOf(q);
                            while (idx !== -1) {
                              if (idx > last) parts.push(<span key={last}>{msg.text!.slice(last, idx)}</span>);
                              parts.push(<mark key={`m${idx}`} className="bg-yellow-300 text-black rounded px-0.5">{msg.text!.slice(idx, idx + q.length)}</mark>);
                              last = idx + q.length;
                              idx = lower.indexOf(q, last);
                            }
                            if (last < msg.text!.length) parts.push(<span key={`e${last}`}>{msg.text!.slice(last)}</span>);
                            return parts;
                          })() : msg.text!.split(/(@\w+)/g).map((part: string, i: number) =>
                            part.startsWith("@")
                              ? <span key={i} className={`font-semibold ${isMine ? "text-bubble-sent-foreground" : "text-primary"} opacity-90`}>{part}</span>
                              : part
                          )}
                        </p>
                      )}
                    </>
                  )}

                  {!msg.isDeleted && (
                    <p className={`text-[10px] mt-0.5 ${isMine ? "text-bubble-sent-foreground/60" : "text-muted-foreground"} text-right flex items-center justify-end gap-1`}>
                      {msg.isEdited && <span className="italic opacity-70">edited</span>}
                      {messageTime(new Date(msg.timestamp))}
                      {isMine && (() => {
                        const readers = (readReceipts[msg.id] || []).filter((uid: string) => uid !== userId);
                        const isGroup = convDetails?.type === "group";
                        const totalOthers = (convDetails?.members?.length || 1) - 1;
                        if (isGroup && readers.length > 0) {
                          const readerNames = readers.map((uid: string) => {
                            const p = convDetails?.members?.find((m: any) => m.clerk_user_id === uid);
                            return p?.display_name || "User";
                          });
                          return <span className="ml-1 text-primary" title={`Read by ${readerNames.join(", ")}`}>{readers.length >= totalOthers ? "✓✓" : `✓✓${readers.length}`}</span>;
                        }
                        return <span className="ml-1">{readers.length > 0 ? "✓✓" : "✓"}</span>;
                      })()}
                    </p>
                  )}
                </div>

                {!msg.isDeleted && msg.reactions.length > 0 && (
                  <div className={`flex gap-0.5 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
                    {msg.reactions.map((r: string, i: number) => (
                      <span key={i} className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-xs">{r}</span>
                    ))}
                  </div>
                )}

                <AnimatePresence>
                  {!msg.isDeleted && showReactions === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className={`absolute ${isMine ? "right-0" : "left-0"} bottom-full mb-1.5 z-10 ${isPremium ? "grid grid-cols-8 gap-0.5" : "flex gap-1"} rounded-2xl bg-surface-elevated px-2 py-1.5 shadow-lg border border-border`}
                    >
                      {(isPremium ? FULL_EMOJI_SET : emojiOptions).map((emoji) => (
                        <button key={emoji} onClick={() => handleAddReaction(msg.id, emoji)} className="text-lg hover:scale-125 transition-transform px-0.5">{emoji}</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Context menu */}
                <AnimatePresence>
                  {isContextOpen && !msg.isDeleted && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`absolute ${isMine ? "right-0" : "left-0"} bottom-full mb-1.5 z-20 bg-surface-elevated border border-border rounded-2xl shadow-xl overflow-hidden min-w-[180px]`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Reply */}
                      {!msg.isDeleted && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary"
                          onClick={() => {
                            setContextMenu(null);
                            const senderProfile = convDetails?.members?.find((m: any) => m.clerk_user_id === msg.senderId);
                            setReplyTo({
                              id: msg.id,
                              senderName: msg.senderId === userId ? "You" : (senderProfile?.display_name || "User"),
                              text: msg.text ?? null,
                              image: msg.image ?? null,
                              video: msg.video ?? null,
                              audio: msg.audio ?? null,
                            });
                          }}
                        >
                          <Reply size={15} className="text-muted-foreground shrink-0" />
                          Reply
                        </button>
                      )}
                      {/* React — available to everyone on non-deleted messages */}
                      {!msg.isDeleted && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                          onClick={() => { setContextMenu(null); setShowReactions(msg.id); }}
                        >
                          <Smile size={15} className="text-muted-foreground shrink-0" />
                          React
                        </button>
                      )}
                      {/* Forward */}
                      {!msg.isDeleted && (msg.text || msg.image) && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                          onClick={() => openForwardPicker(msg)}
                        >
                          <Forward size={15} className="text-muted-foreground shrink-0" />
                          Forward
                        </button>
                      )}
                      {/* Translate — Pro feature */}
                      {!msg.isDeleted && msg.text && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                          onClick={() => isPro ? handleTranslate(msg.id, msg.text) : navigate({ to: "/premium" })}
                        >
                          <Globe size={15} className={`shrink-0 ${isPro ? "text-muted-foreground" : "text-amber-500"}`} />
                          {translatingMsgId === msg.id ? "Translating…" : isPro ? "Translate" : "Translate ✦ Pro"}
                        </button>
                      )}
                      {/* Pin / Unpin — only group chats */}
                      {!msg.isDeleted && convDetails?.type === "group" && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                          onClick={() => handleTogglePin(msg.id)}
                        >
                          <Pin size={15} className="text-muted-foreground shrink-0 rotate-45" />
                          {msg.pinned ? "Unpin" : "Pin"}
                        </button>
                      )}
                      {/* Star / Unstar */}
                      {!msg.isDeleted && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                          onClick={() => handleToggleStar(msg.id)}
                        >
                          <Star size={15} className={`shrink-0 ${msg.starredByMe ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                          {msg.starredByMe ? "Unstar" : "Star"}
                        </button>
                      )}
                      {/* Block sender — only others */}
                      {!isMine && !msg.isDeleted && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                          onClick={() => handleBlockSender(msg.senderId)}
                        >
                          <ShieldOff size={15} className="text-muted-foreground shrink-0" />
                          Block sender
                        </button>
                      )}
                      {/* Report — only others */}
                      {!isMine && !msg.isDeleted && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 border-t border-border"
                          onClick={() => handleReportMessage(msg.id)}
                        >
                          <ShieldAlert size={15} className="shrink-0" />
                          Report
                        </button>
                      )}
                      {/* Edit — only own text messages */}
                      {isMine && msg.text && !msg.isDeleted && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                          onClick={() => startEditing(msg.id, msg.text)}
                        >
                          <Pencil size={15} className="text-muted-foreground shrink-0" />
                          Edit
                        </button>
                      )}
                      {/* Delete for me — always available */}
                      <button
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary border-t border-border"
                        onClick={() => handleDeleteForMe(msg.id)}
                      >
                        <Trash2 size={15} className="text-muted-foreground shrink-0" />
                        Delete for me
                      </button>
                      {/* Delete for everyone — only own messages */}
                      {isMine && (
                        <button
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 border-t border-border"
                          onClick={() => handleDeleteForEveryone(msg.id)}
                        >
                          <Trash2 size={15} className="shrink-0" />
                          Delete for everyone
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Media preview */}
      <AnimatePresence>
        {mediaPreview && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="border-t border-border bg-surface px-3 py-2">
            <div className="relative inline-block">
              {mediaPreview.type === "image" ? (
                <img src={mediaPreview.url} alt="Preview" className="h-24 w-24 rounded-xl object-cover" />
              ) : (
                <video src={mediaPreview.url} className="h-24 w-24 rounded-xl object-cover" />
              )}
              <button onClick={clearMediaPreview} className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow-md">
                <X size={14} />
              </button>
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                  <Loader2 size={20} className="animate-spin text-primary" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Typing indicator */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-1 bg-surface border-t border-border"
          >
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0 }} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forward picker modal */}
      <AnimatePresence>
        {showForwardPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => setShowForwardPicker(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-surface w-full max-w-lg rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)] max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-[15px] font-semibold text-foreground">Forward to…</h3>
                <button onClick={() => setShowForwardPicker(false)} className="p-1 text-muted-foreground"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto">
                {forwardConvs.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-6">No other conversations</p>
                )}
                {forwardConvs.map((conv: any) => {
                  const other = conv.members?.find((m: any) => m.clerk_user_id !== userId);
                  const name = conv.type === "group" ? (conv.name || "Group") : (other?.display_name || "User");
                  return (
                    <button key={conv.id} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary text-left" onClick={() => handleForward(conv.id)}>
                      <div className="size-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {name[0]?.toUpperCase()}
                      </div>
                      <p className="text-[14px] text-foreground font-medium">{name}</p>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="border-t border-border bg-surface safe-bottom">
        {/* Reply banner */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/10 border-b border-primary/20">
                <CornerUpLeft size={13} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-primary">{replyTo.senderName}</p>
                  <p className="text-[12px] text-muted-foreground truncate">
                    {replyTo.audio ? "🎤 Voice message" : replyTo.image ? "📷 Photo" : replyTo.video ? "🎥 Video" : (replyTo.text || "")}
                  </p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* @mention autocomplete */}
        <AnimatePresence>
          {mentionQuery !== null && convDetails?.members && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mx-3 mb-1 bg-surface-elevated border border-border rounded-xl shadow-lg overflow-hidden max-h-44 overflow-y-auto"
            >
              {convDetails.members
                .filter((m: any) => m.clerk_user_id !== userId && (m.display_name || "").toLowerCase().includes(mentionQuery.toLowerCase()))
                .map((m: any) => (
                  <button
                    key={m.clerk_user_id}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-secondary text-left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const name = m.display_name || "User";
                      const atIdx = input.lastIndexOf("@");
                      setInput(input.slice(0, atIdx) + "@" + name + " ");
                      setMentionQuery(null);
                    }}
                  >
                    <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                      {(m.display_name || "U")[0].toUpperCase()}
                    </div>
                    <span className="text-[14px] text-foreground">{m.display_name || "User"}</span>
                  </button>
                ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Mode banner */}
        <AnimatePresence>
          {aiMode && !editingMessageId && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-b border-violet-500/20"
            >
              <Sparkles size={12} className="text-violet-500 shrink-0" />
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400 flex-1">AI Mode · AI will respond to every message</span>
              <button onClick={() => setAiMode(false)} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit mode banner */}
        <AnimatePresence>
          {editingMessageId && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-2 px-4 py-1.5 bg-primary/10 border-b border-primary/20"
            >
              <Pencil size={13} className="text-primary shrink-0" />
              <span className="text-xs text-primary flex-1 truncate">Editing message</span>
              <button onClick={cancelEditing} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-3 py-2">
          {recording ? (
            <div className="flex items-center gap-3">
              <button onClick={cancelRecording} className="p-2 text-destructive">
                <X size={22} />
              </button>
              <div className="flex-1 flex items-center gap-2">
                <motion.div className="h-2.5 w-2.5 rounded-full bg-destructive" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} />
                <span className="text-sm text-foreground font-medium">{formatDuration(recordingDuration)}</span>
                <span className="text-xs text-muted-foreground">Recording...</span>
              </div>
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={sendVoiceMessage}
                className="rounded-full bg-primary p-2.5 text-primary-foreground"
              >
                <Send size={18} />
              </motion.button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              {!editingMessageId && (
                <button
                  onClick={() => setAiMode((v) => !v)}
                  title={aiMode ? "Exit AI mode" : "Ask AI"}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                    aiMode
                      ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30"
                      : "text-muted-foreground hover:text-violet-500"
                  }`}
                >
                  <Sparkles size={20} />
                </button>
              )}
              <div className={`flex-1 rounded-2xl px-4 py-2.5 transition-all duration-200 ${
                aiMode
                  ? "bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 ring-1 ring-violet-500/30"
                  : "bg-secondary"
              }`}>
                <input
                  type="text"
                  placeholder={
                    editingMessageId ? "Edit message…" :
                    aiMode ? "Ask AI anything…" :
                    "Message… or @AI to ask"
                  }
                  value={input}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInput(val);
                    if (!editingMessageId) broadcastTyping();
                    // @mention detection
                    if (!editingMessageId) {
                      const atIdx = val.lastIndexOf("@");
                      if (atIdx !== -1 && (atIdx === 0 || val[atIdx - 1] === " ") && !val.slice(atIdx + 1).includes(" ")) {
                        setMentionQuery(val.slice(atIdx + 1));
                      } else {
                        setMentionQuery(null);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !uploading) {
                      if (editingMessageId) handleEditMessage(); else handleSendMessage();
                    }
                    if (e.key === "Escape" && editingMessageId) cancelEditing();
                  }}
                  className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
                  autoFocus={!!editingMessageId}
                />
              </div>
              {editingMessageId ? (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  onClick={handleEditMessage}
                  disabled={!input.trim()}
                  className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-50"
                >
                  <Check size={18} />
                </motion.button>
              ) : (input.trim() || mediaPreview) ? (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  onClick={handleSendMessage}
                  disabled={uploading}
                  className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </motion.button>
              ) : (
                <div className="flex gap-1">
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
                  <input ref={docInputRef} type="file" onChange={handleDocPick} className="hidden" />
                  <button className="p-2 text-muted-foreground" onClick={() => setShowAttach((s) => !s)} title="Attach">
                    {uploadingDoc ? <Loader2 size={22} className="animate-spin" /> : <Paperclip size={22} />}
                  </button>
                  <button className="p-2 text-muted-foreground" onClick={() => fileInputRef.current?.click()} title="Photo / video">
                    <Image size={22} />
                  </button>
                  <button className="p-2 text-muted-foreground" onClick={startRecording} title="Voice">
                    <Mic size={22} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Attach menu */}
      <AnimatePresence>
        {showAttach && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setShowAttach(false)}
          >
            <motion.div
              initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30 mb-3" />
              <div className="grid grid-cols-4 gap-3">
                <button onClick={() => docInputRef.current?.click()} className="flex flex-col items-center gap-1.5 py-2">
                  <div className="size-12 rounded-full bg-blue-500/15 flex items-center justify-center">
                    <FileText size={22} className="text-blue-500" />
                  </div>
                  <span className="text-[11px] text-foreground">Document</span>
                </button>
                <button onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }} className="flex flex-col items-center gap-1.5 py-2">
                  <div className="size-12 rounded-full bg-purple-500/15 flex items-center justify-center">
                    <Image size={22} className="text-purple-500" />
                  </div>
                  <span className="text-[11px] text-foreground">Photo/Video</span>
                </button>
                <button onClick={handleShareLocation} className="flex flex-col items-center gap-1.5 py-2">
                  <div className="size-12 rounded-full bg-green-500/15 flex items-center justify-center">
                    <MapPin size={22} className="text-green-500" />
                  </div>
                  <span className="text-[11px] text-foreground">Location</span>
                </button>
                <button onClick={openContactPicker} className="flex flex-col items-center gap-1.5 py-2">
                  <div className="size-12 rounded-full bg-orange-500/15 flex items-center justify-center">
                    <UserIcon size={22} className="text-orange-500" />
                  </div>
                  <span className="text-[11px] text-foreground">Contact</span>
                </button>
                <button onClick={() => { setShowAttach(false); setShowPollModal(true); }} className="flex flex-col items-center gap-1.5 py-2">
                  <div className="size-12 rounded-full bg-pink-500/15 flex items-center justify-center">
                    <BarChart3 size={22} className="text-pink-500" />
                  </div>
                  <span className="text-[11px] text-foreground">Poll</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact picker */}
      <AnimatePresence>
        {showContactPicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-end"
            onClick={() => setShowContactPicker(false)}
          >
            <motion.div
              initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="bg-surface w-full rounded-t-2xl max-h-[70dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-[15px] font-semibold text-foreground">Share contact</h3>
                <button onClick={() => setShowContactPicker(false)} className="p-1 text-muted-foreground"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {allProfiles.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No contacts available</div>
                ) : (
                  allProfiles.map((p: any) => (
                    <button
                      key={p.clerk_user_id}
                      onClick={() => handleSendContact(p.clerk_user_id)}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary text-left border-b border-border"
                    >
                      <div className="size-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-muted-foreground">{(p.display_name || "U")[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.display_name || "User"}</p>
                        {p.username && <p className="text-xs text-muted-foreground truncate">@{p.username}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poll create modal */}
      <AnimatePresence>
        {showPollModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-end"
            onClick={() => !creatingPoll && setShowPollModal(false)}
          >
            <motion.div
              initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="bg-surface w-full rounded-t-2xl flex flex-col max-h-[85dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-[15px] font-semibold text-foreground">Create poll</h3>
                <button onClick={() => !creatingPoll && setShowPollModal(false)} className="p-1 text-muted-foreground"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <label className="text-[11px] text-muted-foreground">Question</label>
                  <input
                    value={pollQ}
                    onChange={(e) => setPollQ(e.target.value)}
                    placeholder="Ask a question…"
                    className="mt-1 w-full rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    maxLength={140}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Options</label>
                  <div className="mt-1 space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[idx] = e.target.value;
                            setPollOptions(next);
                          }}
                          placeholder={`Option ${idx + 1}`}
                          className="flex-1 rounded-xl bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                          maxLength={80}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            onClick={() => setPollOptions((arr) => arr.filter((_, i) => i !== idx))}
                            className="p-1 text-muted-foreground"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 12 && (
                      <button
                        onClick={() => setPollOptions((arr) => [...arr, ""])}
                        className="flex items-center gap-1 text-xs text-primary"
                      >
                        <Plus size={14} /> Add option
                      </button>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={pollMulti}
                    onChange={(e) => setPollMulti(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Allow multiple answers
                </label>
              </div>
              <div className="border-t border-border p-3">
                <button
                  onClick={handleCreatePoll}
                  disabled={creatingPoll || !pollQ.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creatingPoll ? <Loader2 size={16} className="inline animate-spin" /> : "Create poll"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {callSession && userId && getSocket(userId) && (
          <CallModal
            myClerkId={userId}
            session={callSession}
            socket={getSocket(userId)!}
            onClose={() => setCallSession(null)}
          />
        )}
      </AnimatePresence>

      {/* Wallpaper Picker Sheet — Premium */}
      <AnimatePresence>
        {showWallpaperPicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black"
              onClick={() => setShowWallpaperPicker(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-background p-5 pb-10 max-w-lg mx-auto"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
              <h3 className="mb-1 font-semibold text-foreground text-center">Chat Wallpaper</h3>
              <p className="text-xs text-muted-foreground text-center mb-4">Choose a background for this conversation</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleSetWallpaper("")}
                  className={`aspect-[2/3] rounded-2xl border-2 flex flex-col items-center justify-center gap-1 bg-secondary transition-all ${!wallpaper ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
                >
                  <X size={18} className="text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">None</span>
                </button>
                {WALLPAPER_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handleSetWallpaper(preset.url)}
                    className={`aspect-[2/3] rounded-2xl border-2 overflow-hidden transition-all ${wallpaper === preset.url ? "border-primary ring-2 ring-primary/20" : "border-transparent"}`}
                  >
                    <img src={preset.preview} alt={preset.name} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {convDetails && (() => {
        const isGroup = convDetails.type === "group";
        const other = !isGroup
          ? convDetails.members?.find((m: any) => m.clerk_user_id !== userId)
          : null;
        return (
          <ProfilePreview
            open={showHeaderPreview}
            onClose={() => setShowHeaderPreview(false)}
            clerkUserId={!isGroup ? other?.clerk_user_id : null}
            initialName={!isGroup ? other?.display_name : null}
            initialAvatarUrl={!isGroup ? other?.avatar_url : null}
            initialUsername={!isGroup ? other?.username : null}
            conversationIdForMessage={id}
            onMessage={() => setShowHeaderPreview(false)}
            onCall={!isGroup ? (kind) => startCall(kind) : undefined}
            group={
              isGroup
                ? {
                    id,
                    name: convDetails.name,
                    avatarUrl: convDetails.avatar_url,
                    description: convDetails.description,
                    memberCount: convDetails.members?.length,
                  }
                : null
            }
          />
        );
      })()}
    </div>
  );
}
