import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Search, Users, X, ArrowLeft, Check, QrCode, Camera, AtSign, UserPlus, Trash2, MessageCircle, Bell, Clock, BadgeCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/tanstack-start";
import {
  getContacts,
  addContact,
  removeContact,
  isContact,
  getAllProfiles,
  getProfileByClerkId,
  searchProfilesByUsername,
  getOrCreateDirectConversation,
  createGroupConversation,
  createGroup,
  getNotificationCount,
  getFriendSuggestions,
} from "@/lib/api.functions";

export const Route = createFileRoute("/contacts")({
  component: ContactsPage,
  head: () => ({
    meta: [
      { title: "Contacts — ChatApp" },
      { name: "description", content: "Your contacts" },
    ],
  }),
});

// ─── Types ───────────────────────────────────────────────────────────────────

type Profile = {
  clerk_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  status_message: string | null;
  is_online: boolean | null;
  username: string | null;
  is_admin?: boolean | null;
  subscription_tier?: string | null;
  verified?: boolean | null;
};

type ContactRow = {
  id: string;
  contact_clerk_id: string;
  nickname: string | null;
  profile: Profile | null;
};

const avatarFor = (p: Pick<Profile, "avatar_url" | "clerk_user_id">) =>
  p.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${p.clerk_user_id}`;

// ─── QR Scanner ──────────────────────────────────────────────────────────────

function QRScanner({ onResult, onClose }: { onResult: (clerkId: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [detected, setDetected] = useState(false);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const jsQR = (await import("jsqr")).default;
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      // Accept either the chatapp:// scheme or any /u/<handle> URL
      const schemeMatch = code.data.match(/chatapp:\/\/user\/(.+)/);
      const urlMatch = code.data.match(/\/u\/([a-zA-Z0-9_]+)/);
      const ident = schemeMatch?.[1] || urlMatch?.[1];
      if (ident) {
        setDetected(true);
        stopStream();
        onResult(ident);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [onResult, stopStream]);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (e: any) {
        setError(e?.message || "Camera access denied");
        setScanning(false);
      }
    }
    startCamera();
    return () => stopStream();
  }, [scanFrame, stopStream]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3">
        <button onClick={onClose} className="rounded-full bg-white/20 p-2 text-white">
          <X size={20} />
        </button>
        <h2 className="font-semibold text-white">Scan QR Code</h2>
        <div className="w-10" />
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Camera size={48} className="text-white/40" />
          <p className="text-white/70 text-sm">{error}</p>
          <p className="text-white/50 text-xs">Allow camera access and try again</p>
          <button
            onClick={onClose}
            className="mt-2 rounded-2xl bg-white/20 px-6 py-3 text-sm font-medium text-white"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="relative h-60 w-60">
              <div className="absolute inset-0 rounded-2xl border-2 border-white/40" />
              {[["top-0 left-0", "rounded-tl-lg"], ["top-0 right-0", "rounded-tr-lg"], ["bottom-0 left-0", "rounded-bl-lg"], ["bottom-0 right-0", "rounded-br-lg"]].map(([pos, rnd], i) => (
                <div key={i} className={`absolute h-8 w-8 border-4 border-white ${pos} ${rnd}`} />
              ))}
              {detected && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-online/30">
                  <Check size={48} className="text-online" />
                </div>
              )}
              {scanning && !detected && (
                <motion.div
                  animate={{ y: [0, 200, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-2 right-2 top-2 h-0.5 rounded-full bg-primary/80"
                />
              )}
            </div>
            <p className="text-sm text-white/70">Point at someone's QR code</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Add Contact Sheet ───────────────────────────────────────────────────────

function AddContactSheet({
  userId,
  existingContactIds,
  onClose,
  onAdded,
  onOpenScanner,
}: {
  userId: string;
  existingContactIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
  onOpenScanner: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Profile[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  // Track per-profile result so the row can show "Added" or "Pending"
  const [resultStatus, setResultStatus] = useState<Record<string, "accepted" | "pending_outgoing">>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search by name or @handle (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        if (q.startsWith("@")) {
          const r = await searchProfilesByUsername({ data: { query: q, clerkUserId: userId } });
          setResults(r as Profile[]);
        } else {
          const all = await getAllProfiles({ data: { clerkUserId: userId } });
          const lower = q.toLowerCase();
          setResults(
            (all as Profile[])
              .filter((p) =>
                (p.display_name || "").toLowerCase().includes(lower) ||
                (p.username || "").toLowerCase().includes(lower)
              )
              .slice(0, 30)
          );
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, userId]);

  const handleAdd = async (profile: Profile) => {
    if (adding) return;
    setAdding(profile.clerk_user_id);
    try {
      const res = await addContact({
        data: { clerkUserId: userId, contactClerkId: profile.clerk_user_id },
      });
      const next = res.status === "accepted" ? "accepted" : "pending_outgoing";
      setResultStatus((prev) => ({ ...prev, [profile.clerk_user_id]: next }));
      onAdded();
    } catch (err) {
      console.error("Failed to add contact:", err);
    } finally {
      setAdding(null);
    }
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-40 flex flex-col bg-background"
    >
      <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <button onClick={onClose} className="p-1 text-primary">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Add Contact</h1>
        <button
          onClick={onOpenScanner}
          className="rounded-full bg-secondary p-2 text-muted-foreground"
          title="Scan QR Code"
        >
          <QrCode size={18} />
        </button>
      </header>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
          {query.startsWith("@") ? (
            <AtSign size={16} className="text-primary shrink-0" />
          ) : (
            <Search size={16} className="text-muted-foreground shrink-0" />
          )}
          <input
            type="text"
            placeholder="Search by name or @handle"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground px-1">
          Tip: prefix with @ to search by handle
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 space-y-2">
        {searching && (
          <div className="flex justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {!searching && query.trim() && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search size={40} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No users found for "{query}"</p>
          </div>
        )}

        {!searching && !query.trim() && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-8">
            <UserPlus size={40} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">
              Search for someone by name or @handle, or scan their QR code to add them as a contact.
            </p>
          </div>
        )}

        {!searching && results.map((p) => {
          const localStatus = resultStatus[p.clerk_user_id];
          const already = existingContactIds.has(p.clerk_user_id) || localStatus === "accepted";
          const pending = localStatus === "pending_outgoing";
          const isAddingThis = adding === p.clerk_user_id;
          return (
            <motion.div key={p.clerk_user_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3">
                <img src={avatarFor(p)} alt="" className="h-12 w-12 rounded-full bg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{p.display_name || "User"}</p>
                  {p.username ? (
                    <p className="text-sm text-primary truncate">@{p.username}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground truncate">{p.status_message || "Hey there!"}</p>
                  )}
                </div>
                {already ? (
                  <span className="flex items-center gap-1 rounded-full bg-online/15 px-3 py-1.5 text-xs font-medium text-online">
                    <Check size={14} /> Added
                  </span>
                ) : pending ? (
                  <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    <Clock size={14} /> Pending
                  </span>
                ) : (
                  <button
                    onClick={() => handleAdd(p)}
                    disabled={isAddingThis}
                    className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {isAddingThis ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    ) : (
                      <UserPlus size={14} />
                    )}
                    Add
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Contact Detail Sheet (preview from QR scan) ─────────────────────────────

type ScannedStatus = "none" | "accepted" | "pending_outgoing" | "pending_incoming";

function ScannedProfileSheet({
  profile,
  status,
  onClose,
  onAdd,
  onMessage,
  adding,
}: {
  profile: Profile;
  status: ScannedStatus;
  onClose: () => void;
  onAdd: () => void;
  onMessage: () => void;
  adding: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="w-full max-w-md rounded-t-3xl bg-background p-6 pb-[max(env(safe-area-inset-bottom),24px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3">
          <img src={avatarFor(profile)} alt="" className="h-20 w-20 rounded-full bg-muted" />
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">{profile.display_name || "User"}</p>
            {profile.username && <p className="text-sm text-primary">@{profile.username}</p>}
            <p className="mt-1 text-sm text-muted-foreground">{profile.status_message || "Hey there!"}</p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {status === "accepted" && (
            <button
              onClick={onMessage}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground"
            >
              <MessageCircle size={16} /> Send Message
            </button>
          )}
          {status === "pending_outgoing" && (
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-medium text-muted-foreground"
            >
              <Clock size={16} /> Request Sent
            </button>
          )}
          {status === "pending_incoming" && (
            <button
              onClick={onAdd}
              disabled={adding}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-online py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {adding ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Check size={16} />
              )}
              Accept Request
            </button>
          )}
          {status === "none" && (
            <button
              onClick={onAdd}
              disabled={adding}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {adding ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <UserPlus size={16} />
              )}
              Add to Contacts
            </button>
          )}
          {status !== "accepted" && (
            <p className="px-2 pt-1 text-center text-xs text-muted-foreground">
              {status === "pending_outgoing"
                ? "You can chat once they accept your request."
                : status === "pending_incoming"
                  ? "Accept their request to start chatting."
                  : "Add as contact to start chatting."}
            </p>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-xl py-3 text-sm font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ContactsPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [navigating, setNavigating] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<string | null>(null);

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedProfile, setScannedProfile] = useState<Profile | null>(null);
  const [scannedStatus, setScannedStatus] = useState<ScannedStatus>("none");
  const [addingScanned, setAddingScanned] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [suggestions, setSuggestions] = useState<(Profile & { mutualCount: number })[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const loadContacts = useCallback(async () => {
    if (!userId) return;
    try {
      const [rows, counts] = await Promise.all([
        getContacts({ data: { clerkUserId: userId } }),
        getNotificationCount({ data: { clerkUserId: userId } }).catch(() => ({
          pendingRequests: 0,
          unreadMessages: 0,
          total: 0,
        })),
      ]);
      setContacts(rows as ContactRow[]);
      setPendingRequestCount(counts.pendingRequests || 0);
    } catch (err) {
      console.error("Failed to load contacts:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Load friend suggestions
  useEffect(() => {
    if (!userId) return;
    getFriendSuggestions({ data: { clerkUserId: userId } })
      .then((rows) => setSuggestions(rows as (Profile & { mutualCount: number })[]))
      .catch(console.error);
  }, [userId]);

  const existingContactIds = new Set(contacts.map((c) => c.contact_clerk_id));

  // Filter + group by first letter (only contacts with a profile)
  const visibleContacts = contacts
    .filter((c) => c.profile)
    .map((c) => ({
      id: c.contact_clerk_id,
      contactRowId: c.id,
      name: c.nickname || c.profile!.display_name || "User",
      avatar: avatarFor(c.profile!),
      statusMsg: c.profile!.status_message || "Hey there!",
      isOnline: c.profile!.is_online || false,
      username: c.profile!.username,
      isAdmin: c.profile!.is_admin || false,
      isVerified: c.profile!.is_admin || (c.profile as any).verified || c.profile!.subscription_tier === "pro",
      isPro: c.profile!.is_admin || c.profile!.subscription_tier === "pro",
    }))
    .filter((u) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q);
    });

  const grouped = visibleContacts.reduce<Record<string, typeof visibleContacts>>((acc, user) => {
    const letter = (user.name?.[0] || "?").toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(user);
    return acc;
  }, {});
  const sortedLetters = Object.keys(grouped).sort();

  const handleContactTap = async (contactClerkId: string) => {
    if (!userId || navigating) return;
    if (showGroupCreate) { toggleMember(contactClerkId); return; }
    setNavigating(contactClerkId);
    try {
      const conv = await getOrCreateDirectConversation({ data: { clerkUserId: userId, otherClerkId: contactClerkId } });
      navigate({ to: "/chat/$id", params: { id: conv.id } });
    } catch (err) {
      console.error("Failed to start conversation:", err);
      const msg = err instanceof Error ? err.message : "Could not open chat";
      alert(msg);
      setNavigating(null);
    }
  };

  const handleRemoveContact = async (contactClerkId: string) => {
    if (!userId || removingId) return;
    setRemovingId(contactClerkId);
    try {
      await removeContact({ data: { clerkUserId: userId, contactClerkId } });
      setContacts((prev) => prev.filter((c) => c.contact_clerk_id !== contactClerkId));
      setActionFor(null);
    } catch (err) {
      console.error("Failed to remove contact:", err);
    } finally {
      setRemovingId(null);
    }
  };

  const handleQRResult = async (identifier: string) => {
    setShowScanner(false);
    if (!userId) return;
    try {
      let profile: Profile | null = null;
      if (identifier.startsWith("user_")) {
        profile = (await getProfileByClerkId({ data: { clerkUserId: identifier } })) as Profile | null;
      } else {
        const arr = await searchProfilesByUsername({ data: { query: identifier, clerkUserId: userId } });
        profile = (arr as Profile[])[0] || null;
      }
      if (!profile) return;
      // Look up the live relationship status (covers pending in either direction)
      const rel = await isContact({
        data: { clerkUserId: userId, contactClerkId: profile.clerk_user_id },
      });
      setScannedProfile(profile);
      setScannedStatus(rel.status as ScannedStatus);
    } catch (err) {
      console.error("Failed to load scanned profile:", err);
    }
  };

  const handleAddScanned = async () => {
    if (!userId || !scannedProfile) return;
    setAddingScanned(true);
    try {
      const res = await addContact({
        data: { clerkUserId: userId, contactClerkId: scannedProfile.clerk_user_id },
      });
      await loadContacts();
      setScannedStatus(
        res.status === "accepted" ? "accepted" : "pending_outgoing"
      );
    } catch (err) {
      console.error("Failed to add contact:", err);
    } finally {
      setAddingScanned(false);
    }
  };

  const handleMessageScanned = async () => {
    if (!userId || !scannedProfile) return;
    try {
      const conv = await getOrCreateDirectConversation({
        data: { clerkUserId: userId, otherClerkId: scannedProfile.clerk_user_id },
      });
      setScannedProfile(null);
      navigate({ to: "/chat/$id", params: { id: conv.id } });
    } catch (err) {
      console.error("Failed to open chat:", err);
    }
  };

  const toggleMember = (clerkId: string) => {
    setSelectedMembers((prev) => prev.includes(clerkId) ? prev.filter((id) => id !== clerkId) : [...prev, clerkId]);
  };

  const handleCreateGroup = async () => {
    if (!userId || !groupName.trim() || selectedMembers.length < 1 || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const conv = await createGroup({
        data: {
          clerkUserId: userId,
          name: groupName.trim(),
          description: groupDescription.trim() || undefined,
          memberClerkIds: selectedMembers,
        },
      });
      // Upload group avatar if provided
      if (groupAvatarFile && conv?.id) {
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const r = reader.result as string;
              resolve(r.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(groupAvatarFile);
          });
          const { uploadGroupAvatar } = await import("@/lib/api.functions");
          await uploadGroupAvatar({
            data: {
              clerkUserId: userId,
              conversationId: conv.id,
              fileBase64: base64,
              contentType: groupAvatarFile.type || "image/jpeg",
            },
          });
        } catch (e) {
          console.warn("Group avatar upload failed (continuing):", e);
        }
      }
      navigate({ to: "/chat/$id", params: { id: conv.id } });
    } catch (err) {
      console.error("Failed to create group:", err);
      setCreatingGroup(false);
    }
  };

  const cancelGroupCreate = () => {
    setShowGroupCreate(false);
    setSelectedMembers([]);
    setGroupName("");
    setGroupDescription("");
    setGroupAvatarFile(null);
    if (groupAvatarPreview) URL.revokeObjectURL(groupAvatarPreview);
    setGroupAvatarPreview(null);
  };

  const handleGroupAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please pick an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; }
    if (groupAvatarPreview) URL.revokeObjectURL(groupAvatarPreview);
    setGroupAvatarFile(file);
    setGroupAvatarPreview(URL.createObjectURL(file));
    if (e.target) e.target.value = "";
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        {showGroupCreate ? (
          <>
            <button onClick={cancelGroupCreate} className="p-1 text-primary"><ArrowLeft size={22} /></button>
            <h1 className="text-lg font-bold text-foreground">New Group</h1>
            <div className="w-8" />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
            <div className="flex items-center gap-2">
              <Link
                to="/notifications"
                className="relative rounded-full bg-secondary p-2 text-muted-foreground"
                title="Notifications"
              >
                <Bell size={18} />
                {pendingRequestCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
                  </span>
                )}
              </Link>
              <button
                onClick={() => setShowScanner(true)}
                className="rounded-full bg-secondary p-2 text-muted-foreground"
                title="Scan QR Code"
              >
                <QrCode size={18} />
              </button>
              <button
                onClick={() => setShowAddSheet(true)}
                className="rounded-full bg-primary p-2 text-primary-foreground"
                title="Add Contact"
              >
                <UserPlus size={18} />
              </button>
            </div>
          </>
        )}
      </header>

      <AnimatePresence>
        {showGroupCreate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-4 pb-2"
          >
            <div className="flex items-start gap-3 mb-2">
              <label className="relative shrink-0 cursor-pointer">
                <input type="file" accept="image/*" onChange={handleGroupAvatarSelect} className="hidden" />
                <div className="size-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden border border-border">
                  {groupAvatarPreview ? (
                    <img src={groupAvatarPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Camera size={20} className="text-muted-foreground" />
                  )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-primary p-1 text-primary-foreground border-2 border-surface">
                  <Camera size={10} />
                </span>
              </label>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  placeholder="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-xl bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedMembers.map((id) => {
                  const p = visibleContacts.find((u) => u.id === id);
                  return (
                    <span key={id} className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                      {p?.name || "User"}
                      <button onClick={() => toggleMember(id)} className="text-primary/60 hover:text-primary"><X size={12} /></button>
                    </span>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">
              {selectedMembers.length} member{selectedMembers.length !== 1 ? "s" : ""} selected
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!showGroupCreate && (
        <div className="px-4 pb-3 space-y-2">
          <button
            onClick={() => setShowGroupCreate(true)}
            disabled={contacts.length === 0}
            className="flex w-full items-center gap-3 rounded-xl bg-secondary/50 px-3 py-3 disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
              <Users size={18} className="text-primary-foreground" />
            </div>
            <span className="font-medium text-foreground">New Group Chat</span>
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && contacts.length === 0 && suggestions.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary mb-4">
            <UserPlus size={28} className="text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">No contacts yet</p>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            Add people by searching their name or @handle, or scan their QR code.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddSheet(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              <UserPlus size={16} /> Add Contact
            </button>
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-foreground"
            >
              <QrCode size={16} /> Scan QR
            </button>
          </div>
        </div>
      )}

      {/* Friend Suggestions — "People You May Know" */}
      {!loading && !showGroupCreate && suggestions.filter((s) => !existingContactIds.has(s.clerk_user_id) && !addedIds.has(s.clerk_user_id)).length > 0 && (
        <div className="px-4 pb-2 pt-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">People you may know</p>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {suggestions
              .filter((s) => !existingContactIds.has(s.clerk_user_id) && !addedIds.has(s.clerk_user_id))
              .map((s) => (
                <motion.div
                  key={s.clerk_user_id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-card border border-border p-3 shrink-0 w-[110px]"
                >
                  <div className="relative">
                    <img
                      src={s.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${s.clerk_user_id}`}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover bg-muted"
                    />
                    {s.is_online && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-online border-2 border-card" />
                    )}
                  </div>
                  <div className="text-center min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate w-full">
                      {s.display_name || "User"}
                    </p>
                    {s.username && (
                      <p className="text-[10px] text-primary truncate">@{s.username}</p>
                    )}
                    {s.mutualCount > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {s.mutualCount} mutual
                      </p>
                    )}
                  </div>
                  <button
                    disabled={addingId === s.clerk_user_id}
                    onClick={async () => {
                      if (!userId || addingId) return;
                      setAddingId(s.clerk_user_id);
                      try {
                        await addContact({ data: { clerkUserId: userId, contactClerkId: s.clerk_user_id } });
                        setAddedIds((prev) => new Set([...prev, s.clerk_user_id]));
                        await loadContacts();
                      } catch (err) {
                        console.error("Failed to add:", err);
                      } finally {
                        setAddingId(null);
                      }
                    }}
                    className="flex items-center justify-center gap-1 w-full rounded-full bg-primary/10 py-1 text-[11px] font-semibold text-primary disabled:opacity-60 active:bg-primary/20"
                  >
                    {addingId === s.clerk_user_id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                    ) : (
                      <><UserPlus size={11} /> Add</>
                    )}
                  </button>
                </motion.div>
              ))}
          </div>
        </div>
      )}

      {!loading && contacts.length > 0 && visibleContacts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center px-8">
          <p className="text-muted-foreground text-sm">No contacts match "{search}"</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {sortedLetters.map((letter) => (
          <div key={letter}>
            <div className="sticky top-0 bg-background/80 backdrop-blur-sm px-4 py-1">
              <span className="text-xs font-semibold text-muted-foreground">{letter}</span>
            </div>
            {grouped[letter].map((user, i) => {
              const isSelected = selectedMembers.includes(user.id);
              const showActions = actionFor === user.id;
              return (
                <motion.div key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                  <div className="flex w-full items-stretch">
                    <button
                      onClick={() => handleContactTap(user.id)}
                      onContextMenu={(e) => {
                        if (showGroupCreate) return;
                        e.preventDefault();
                        setActionFor(showActions ? null : user.id);
                      }}
                      disabled={!showGroupCreate && navigating === user.id}
                      className="flex flex-1 items-center gap-3 px-4 py-2.5 active:bg-secondary/50 transition-colors text-left"
                    >
                      {showGroupCreate && (
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                          {isSelected && <Check size={12} className="text-primary-foreground" />}
                        </div>
                      )}
                      <div className="relative">
                        <img src={user.avatar} alt="" className="h-11 w-11 rounded-full bg-muted" />
                        {user.isOnline && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-online" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <p className="font-medium text-foreground text-[15px] truncate">{user.name}</p>
                          {user.isAdmin && (
                            <span title="Admin" className="shrink-0">
                              <BadgeCheck size={14} className="text-red-500" />
                            </span>
                          )}
                          {!user.isAdmin && user.isVerified && (
                            <span title="Verified" className="shrink-0">
                              <BadgeCheck size={14} className="text-primary" />
                            </span>
                          )}
                        </div>
                        {user.username ? (
                          <p className="text-xs text-primary truncate">@{user.username}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground truncate">{user.statusMsg}</p>
                        )}
                      </div>
                      {!showGroupCreate && navigating === user.id && (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      )}
                    </button>
                    {!showGroupCreate && (
                      <button
                        onClick={() => setActionFor(showActions ? null : user.id)}
                        className="px-3 text-muted-foreground/60 active:text-foreground"
                        title="More"
                      >
                        ⋯
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {showActions && !showGroupCreate && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-secondary/30 px-4 py-2 flex justify-end"
                      >
                        <button
                          onClick={() => handleRemoveContact(user.id)}
                          disabled={removingId === user.id}
                          className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive disabled:opacity-60"
                        >
                          {removingId === user.id ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Remove Contact
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showGroupCreate && selectedMembers.length >= 1 && groupName.trim() && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute bottom-6 right-4"
          >
            <button
              onClick={handleCreateGroup}
              disabled={creatingGroup}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg text-primary-foreground disabled:opacity-50"
            >
              {creatingGroup ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Check size={24} />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddSheet && userId && (
          <AddContactSheet
            userId={userId}
            existingContactIds={existingContactIds}
            onClose={() => setShowAddSheet(false)}
            onAdded={loadContacts}
            onOpenScanner={() => {
              setShowAddSheet(false);
              setShowScanner(true);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScanner && (
          <QRScanner
            onResult={handleQRResult}
            onClose={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scannedProfile && (
          <ScannedProfileSheet
            profile={scannedProfile}
            status={scannedStatus}
            onClose={() => setScannedProfile(null)}
            onAdd={handleAddScanned}
            onMessage={handleMessageScanned}
            adding={addingScanned}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
