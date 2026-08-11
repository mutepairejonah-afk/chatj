/**
 * API Client — replaces all TanStack Start server function imports.
 *
 * Every exported function matches the CALLING CONVENTION of the original
 * createServerFn functions:  fn({ data: { ...args } })
 * This means existing call-sites need only the import path changed
 * (from "@/lib/api.functions" → from "@/lib/api-client") and nothing else.
 *
 * The backend URL is read from VITE_API_URL env var; defaults to same origin
 * so local dev without a separate backend still works.
 */

const API_BASE = (import.meta.env?.VITE_API_URL as string | undefined ?? "").replace(/\/$/, "");

/** Gets the Clerk session JWT. */
async function getToken(): Promise<string> {
  if (typeof window === "undefined") throw new Error("API client: SSR not supported");
  const clerk = (window as any).Clerk;
  if (clerk?.session) {
    const token = await clerk.session.getToken();
    if (token) return token;
  }
  throw new Error("Not authenticated — no active Clerk session");
}

/** Core POST helper */
async function post<T = any>(path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {
      // Keep the HTTP status as the fallback error message.
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/** Unwrap TanStack Start's { data: T } wrapper */
type W<T> = { data: T };

// ══════════════════════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════════════════════

export const getOrCreateProfile = ({ data }: W<{ clerkUserId: string; displayName?: string; avatarUrl?: string }>) =>
  post("/get-or-create-profile", data);

export const updateProfile = ({ data }: W<{ clerkUserId: string; displayName?: string; avatarUrl?: string; statusMessage?: string; isOnline?: boolean }>) =>
  post("/update-profile", data);

export const getAllProfiles = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-all-profiles", data);

export const checkUsernameAvailability = ({ data }: W<{ username: string; clerkUserId: string }>) =>
  post<{ available: boolean }>("/check-username-availability", data);

export const claimUsername = ({ data }: W<{ clerkUserId: string; username: string }>) =>
  post("/claim-username", data);

export const getProfileByUsername = ({ data }: W<{ username: string }>) =>
  post("/get-profile-by-username", data);

export const getProfileByClerkId = ({ data }: W<{ clerkUserId: string }>) =>
  post("/get-profile-by-clerk-id", data);

export const searchProfilesByUsername = ({ data }: W<{ query: string; clerkUserId: string }>) =>
  post<any[]>("/search-profiles-by-username", data);

// ══════════════════════════════════════════════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════════════════════════════════════════════

export const getContacts = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-contacts", data);

export const addContact = ({ data }: W<{ clerkUserId: string; contactClerkId: string; nickname?: string }>) =>
  post<{ status: "accepted" | "pending_outgoing" }>("/add-contact", data);

export const removeContact = ({ data }: W<{ clerkUserId: string; contactClerkId: string }>) =>
  post<{ success: boolean }>("/remove-contact", data);

export const isContact = ({ data }: W<{ clerkUserId: string; contactClerkId: string }>) =>
  post<{ isContact: boolean; status: string }>("/is-contact", data);

export const getPendingRequests = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-pending-requests", data);

export const getOutgoingRequests = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-outgoing-requests", data);

export const acceptContactRequest = ({ data }: W<{ clerkUserId: string; requesterClerkId: string }>) =>
  post<{ success: boolean }>("/accept-contact-request", data);

export const rejectContactRequest = ({ data }: W<{ clerkUserId: string; requesterClerkId: string }>) =>
  post<{ success: boolean }>("/reject-contact-request", data);

export const getNotificationCount = ({ data }: W<{ clerkUserId: string }>) =>
  post<{ pendingRequests: number; unreadMessages: number; total: number }>("/get-notification-count", data);

export const getFriendSuggestions = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-friend-suggestions", data);

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const getConversations = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-conversations", data);

export const getOrCreateDirectConversation = ({ data }: W<{ clerkUserId: string; otherClerkId: string }>) =>
  post<any>("/get-or-create-direct-conversation", data);

export const markConversationRead = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<{ success: boolean }>("/mark-conversation-read", data);

export const createGroupConversation = ({ data }: W<{ clerkUserId: string; name: string; memberClerkIds: string[] }>) =>
  post("/create-group-conversation", data);

export const getConversationDetails = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<any>("/get-conversation-details", data);

export const getConversationMedia = ({ data }: W<{ conversationId: string }>) =>
  post<any[]>("/get-conversation-media", data);

export const sweepExpiredMessages = ({ data }: W<{ conversationId: string }>) =>
  post<{ success: boolean }>("/sweep-expired-messages", data);

export const getConversationWallpaper = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<{ wallpaperUrl: string | null }>("/get-conversation-wallpaper", data);

export const setConversationWallpaper = ({ data }: W<{ clerkUserId: string; conversationId: string; wallpaperUrl: string }>) =>
  post<{ success: boolean }>("/set-conversation-wallpaper", data);

export const exportChatHistory = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<{ html: string }>("/export-chat-history", data);

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════════════════════════

export const getMessages = ({ data }: W<{ clerkUserId: string; conversationId: string; limit?: number }>) =>
  post<any[]>("/get-messages", data);

export const sendMessage = ({ data }: W<{ clerkUserId: string; conversationId: string; text?: string; imageUrl?: string; replyToMessageId?: string }>) =>
  post<any>("/send-message", data);

export const editMessage = ({ data }: W<{ clerkUserId: string; messageId: string; newText: string }>) =>
  post<any>("/edit-message", data);

export const deleteMessageForEveryone = ({ data }: W<{ clerkUserId: string; messageId: string }>) =>
  post<{ success: boolean }>("/delete-message-for-everyone", data);

export const addReaction = ({ data }: W<{ clerkUserId: string; messageId: string; emoji: string }>) =>
  post<{ action: "added" | "removed" }>("/add-reaction", data);

export const markMessagesRead = ({ data }: W<{ clerkUserId: string; messageIds: string[] }>) =>
  post<{ success: boolean }>("/mark-messages-read", data);

export const getReadReceipts = ({ data }: W<{ messageIds: string[] }>) =>
  post<any[]>("/get-read-receipts", data);

export const togglePinMessage = ({ data }: W<{ clerkUserId: string; messageId: string }>) =>
  post<{ pinned: boolean }>("/toggle-pin-message", data);

export const getPinnedMessages = ({ data }: W<{ conversationId: string }>) =>
  post<any[]>("/get-pinned-messages", data);

export const toggleStarMessage = ({ data }: W<{ clerkUserId: string; messageId: string }>) =>
  post<{ starred: boolean }>("/toggle-star-message", data);

export const getStarredMessages = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-starred-messages", data);

export const createPoll = ({ data }: W<{ clerkUserId: string; conversationId: string; question: string; options: string[]; allowMultiple?: boolean }>) =>
  post<any>("/create-poll", data);

export const getPoll = ({ data }: W<{ pollId: string }>) =>
  post<any>("/get-poll", data);

export const votePoll = ({ data }: W<{ clerkUserId: string; pollId: string; optionId: string }>) =>
  post<{ action: "added" | "removed" }>("/vote-poll", data);

export const scheduleMessage = ({ data }: W<{ clerkUserId: string; conversationId: string; text: string; scheduledFor: string }>) =>
  post<any>("/schedule-message", data);

export const getScheduledMessages = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<any[]>("/get-scheduled-messages", data);

export const cancelScheduledMessage = ({ data }: W<{ clerkUserId: string; messageId: string }>) =>
  post<{ success: boolean }>("/cancel-scheduled-message", data);

export const sendLocationMessage = ({ data }: W<{ clerkUserId: string; conversationId: string; latitude: number; longitude: number; label?: string }>) =>
  post<any>("/send-location-message", data);

export const sendContactMessage = ({ data }: W<{ clerkUserId: string; conversationId: string; contactClerkId: string }>) =>
  post<any>("/send-contact-message", data);

// ══════════════════════════════════════════════════════════════════════════════
// MEDIA UPLOADS
// ══════════════════════════════════════════════════════════════════════════════

export const uploadChatMedia = ({ data }: W<{ clerkUserId: string; conversationId: string; fileName: string; fileBase64: string; contentType: string }>) =>
  post<any>("/upload-chat-media", data);

export const uploadDocumentMessage = ({ data }: W<{ clerkUserId: string; conversationId: string; fileName: string; fileBase64: string; contentType: string; fileSize: number }>) =>
  post<any>("/upload-document-message", data);

export const uploadAvatar = ({ data }: W<{ clerkUserId: string; fileBase64: string; contentType: string }>) =>
  post<{ publicUrl: string }>("/upload-avatar", data);

export const uploadMomentImage = ({ data }: W<{ clerkUserId: string; fileName: string; fileBase64: string; contentType: string }>) =>
  post<{ publicUrl: string }>("/upload-moment-image", data);

export const uploadStoryMedia = ({ data }: W<{ clerkUserId: string; fileName: string; fileBase64: string; contentType: string }>) =>
  post<{ publicUrl: string }>("/upload-story-media", data);

export const uploadPaymentScreenshot = ({ data }: W<{ clerkUserId: string; fileBase64: string; mimeType: "image/jpeg" | "image/png"; fileName: string }>) =>
  post<{ url: string }>("/upload-payment-screenshot", data);

// ══════════════════════════════════════════════════════════════════════════════
// GROUPS
// ══════════════════════════════════════════════════════════════════════════════

export const createGroup = ({ data }: W<{ clerkUserId: string; name: string; description?: string; avatarUrl?: string; memberClerkIds: string[] }>) =>
  post<any>("/create-group", data);

export const getGroupInfo = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<any>("/get-group-info", data);

export const updateGroupInfo = ({ data }: W<{ clerkUserId: string; conversationId: string; name?: string; description?: string | null; avatarUrl?: string | null }>) =>
  post<any>("/update-group-info", data);

export const updateGroupPermissions = ({ data }: W<{ clerkUserId: string; conversationId: string; onlyAdminsSend?: boolean; onlyAdminsEdit?: boolean; disappearingSeconds?: number | null }>) =>
  post<{ success: boolean }>("/update-group-permissions", data);

export const setGroupMemberRole = ({ data }: W<{ clerkUserId: string; conversationId: string; memberClerkId: string; role: "admin" | "member" }>) =>
  post<{ success: boolean }>("/set-group-member-role", data);

export const addGroupMember = ({ data }: W<{ clerkUserId: string; conversationId: string; memberClerkId: string }>) =>
  post<{ success: boolean }>("/add-group-member", data);

export const removeGroupMember = ({ data }: W<{ clerkUserId: string; conversationId: string; memberClerkId: string }>) =>
  post<{ success: boolean }>("/remove-group-member", data);

export const leaveGroup = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<{ success: boolean }>("/leave-group", data);

export const generateInviteCode = ({ data }: W<{ clerkUserId: string; conversationId: string }>) =>
  post<{ code: string }>("/generate-invite-code", data);

export const resetInviteCode = generateInviteCode;

export const lookupInvite = ({ data }: W<{ code: string }>) =>
  post<any>("/lookup-invite", data);

export const joinGroupByInvite = ({ data }: W<{ clerkUserId: string; code: string }>) =>
  post<{ conversationId: string; alreadyMember: boolean }>("/join-group-by-invite", data);

export const uploadGroupAvatar = ({ data }: W<{ clerkUserId: string; conversationId: string; fileBase64: string; contentType: string }>) =>
  post<{ publicUrl: string }>("/upload-group-avatar", data);

export const setConversationMute = ({ data }: W<{ clerkUserId: string; conversationId: string; muteSeconds: number | null }>) =>
  post<{ muteUntil: string | null }>("/set-conversation-mute", data);

// ══════════════════════════════════════════════════════════════════════════════
// MOMENTS
// ══════════════════════════════════════════════════════════════════════════════

export const getMoments = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-moments", data);

export const createMoment = ({ data }: W<{ clerkUserId: string; text?: string; imageUrl?: string }>) =>
  post<any>("/create-moment", data);

export const toggleMomentLike = ({ data }: W<{ clerkUserId: string; momentId: string }>) =>
  post<{ liked: boolean }>("/toggle-moment-like", data);

export const getMomentComments = ({ data }: W<{ momentId: string }>) =>
  post<any[]>("/get-moment-comments", data);

export const addMomentComment = ({ data }: W<{ clerkUserId: string; momentId: string; text: string }>) =>
  post<any>("/add-moment-comment", data);

export const deleteMoment = ({ data }: W<{ clerkUserId: string; momentId: string }>) =>
  post<{ success: boolean }>("/delete-moment", data);

export const deleteMomentComment = ({ data }: W<{ clerkUserId: string; commentId: string }>) =>
  post<{ success: boolean }>("/delete-moment-comment", data);

// ══════════════════════════════════════════════════════════════════════════════
// STORIES
// ══════════════════════════════════════════════════════════════════════════════

export const createStory = ({ data }: W<{ clerkUserId: string; text?: string; imageUrl?: string; backgroundColor?: string }>) =>
  post<any>("/create-story", data);

export const getStories = ({ data }: W<{ clerkUserId: string }>) =>
  post<{ groups: any[]; myCount: number }>("/get-stories", data);

export const markStoryViewed = ({ data }: W<{ storyId: string; clerkUserId: string }>) =>
  post<{ success: boolean }>("/mark-story-viewed", data);

export const deleteStory = ({ data }: W<{ storyId: string; clerkUserId: string }>) =>
  post<{ success: boolean }>("/delete-story", data);

export const getStoryViewers = ({ data }: W<{ storyId: string; clerkUserId: string }>) =>
  post<{ viewers: any[]; count: number }>("/get-story-viewers", data);

export const getStoryViewCounts = ({ data }: W<{ storyIds: string[]; clerkUserId: string }>) =>
  post<Record<string, number>>("/get-story-view-counts", data);

export const createStoryHighlight = ({ data }: W<{ clerkUserId: string; title: string; storyIds: string[]; coverUrl?: string }>) =>
  post<any>("/create-story-highlight", data);

export const getStoryHighlights = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-story-highlights", data);

export const deleteStoryHighlight = ({ data }: W<{ clerkUserId: string; highlightId: string }>) =>
  post<{ success: boolean }>("/delete-story-highlight", data);

// ══════════════════════════════════════════════════════════════════════════════
// CALLS
// ══════════════════════════════════════════════════════════════════════════════

export const logCall = ({ data }: W<{ conversationId: string; callerClerkId: string; calleeClerkId: string; kind: "audio" | "video"; status: "answered" | "missed" | "rejected" | "cancelled"; durationSeconds?: number; startedAt?: string }>) =>
  post<any>("/log-call", data);

export const getCallHistory = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-call-history", data);

export const deleteCallLog = ({ data }: W<{ callLogId: string; clerkUserId: string }>) =>
  post<{ success: boolean }>("/delete-call-log", data);

export const clearCallHistory = ({ data }: W<{ clerkUserId: string }>) =>
  post<{ success: boolean }>("/clear-call-history", data);

export const getIceServers = ({ data }: W<Record<string, never>>) =>
  post<{ iceServers: any[] }>("/get-ice-servers", data);

// ══════════════════════════════════════════════════════════════════════════════
// PREMIUM & PAYMENTS
// ══════════════════════════════════════════════════════════════════════════════

export const getPremiumStatus = ({ data }: W<{ clerkUserId: string }>) =>
  post<{ tier: string; isAdmin: boolean; hideReadReceipts: boolean; verified: boolean; bioLinks: any[] }>("/get-premium-status", data);

export const upgradePlan = ({ data }: W<{ clerkUserId: string; tier: "free" | "premium" | "pro" }>) =>
  post<{ success: boolean; tier: string }>("/upgrade-plan", data);

export const updatePrivacySettings = ({ data }: W<{ clerkUserId: string; hideReadReceipts?: boolean }>) =>
  post<any>("/update-privacy-settings", data);

export const updateBioLinks = ({ data }: W<{ clerkUserId: string; bioLinks: { label: string; url: string }[] }>) =>
  post<{ success: boolean }>("/update-bio-links", data);

export const getEcoCashSettings = ({ data }: W<Record<string, never>>) =>
  post<any>("/get-ecocash-settings", data);

export const updateEcoCashSettings = ({ data }: W<{ clerkUserId: string; usdToZigRate: number; ecocashNumber: string }>) =>
  post<{ success: boolean }>("/update-ecocash-settings", data);

export const getIsAdmin = ({ data }: W<{ clerkUserId: string }>) =>
  post<{ isAdmin: boolean }>("/get-is-admin", data);

export const submitPayment = ({ data }: W<{ clerkUserId: string; displayName?: string; amount: number; currency: "USD" | "ZiG"; transactionId: string; screenshotUrl?: string; disputeNote?: string }>) =>
  post<any>("/submit-payment", data);

export const getUserPayments = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-user-payments", data);

export const getAdminPayments = ({ data }: W<{ clerkUserId: string; status?: "pending" | "approved" | "rejected" }>) =>
  post<any[]>("/get-admin-payments", data);

export const verifyOrder = ({ data }: W<{ clerkUserId: string; paymentId: string; action: "approved" | "rejected"; rejectionReason?: string }>) =>
  post<{ success: boolean }>("/verify-order", data);

// ══════════════════════════════════════════════════════════════════════════════
// MISC
// ══════════════════════════════════════════════════════════════════════════════

export const blockUser = ({ data }: W<{ clerkUserId: string; targetClerkId: string }>) =>
  post<{ success: boolean }>("/block-user", data);

export const unblockUser = ({ data }: W<{ clerkUserId: string; targetClerkId: string }>) =>
  post<{ success: boolean }>("/unblock-user", data);

export const getBlockedUsers = ({ data }: W<{ clerkUserId: string }>) =>
  post<any[]>("/get-blocked-users", data);

export const isBlocked = ({ data }: W<{ clerkUserId: string; targetClerkId: string }>) =>
  post<{ blocked: boolean }>("/is-blocked", data);

export const reportTarget = ({ data }: W<{ clerkUserId: string; targetType: "user" | "group" | "message"; targetId: string; reason: string }>) =>
  post<{ success: boolean }>("/report-target", data);

export const aiChatAssist = ({ data }: W<{ clerkUserId: string; question: string; recentMessages?: { sender: string; text: string }[] }>) =>
  post<{ reply: string }>("/ai-chat-assist", data);

export const translateMessage = ({ data }: W<{ clerkUserId: string; text: string; targetLanguage: string }>) =>
  post<{ translated: string }>("/translate-message", data);
