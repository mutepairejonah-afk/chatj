/**
 * Dexie (IndexedDB) offline-first database for ChatApp.
 *
 * Mirrors the most frequently accessed Supabase tables locally so the app
 * renders instantly from cache and syncs with the backend in the background.
 *
 * Usage pattern (WhatsApp style):
 *   1. On app open → read from local DB → render immediately
 *   2. Background fetch from REST API → update local DB → re-render with fresh data
 *   3. Outgoing mutations → write to local DB optimistically → queue for server sync
 */

import Dexie, { type Table } from "dexie";

// ── Schema types ──────────────────────────────────────────────────────────────

export interface LocalConversation {
  id: string;
  /** Owner — the signed-in Clerk user this row belongs to. Used to scope all queries. */
  clerkUserId: string;
  type: "direct" | "group";
  name: string | null;
  avatar_url: string | null;
  updated_at: string;
  // Denormalized for fast list rendering
  lastMessageText: string | null;
  lastMessageAt: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  /** Profiles of other members (for DM avatar / group avatars) */
  memberProfiles: any[];
  syncedAt: number; // epoch ms
}

export interface LocalMessage {
  id: string;
  conversation_id: string;
  sender_clerk_id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  audio_url: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  is_deleted: boolean;
  is_edited: boolean;
  /** Whether the current user has starred this message */
  starred_by_me: boolean;
  /** Optimistic — message was created locally and not yet confirmed by server */
  isPending?: boolean;
  /** Optimistic failure reason, if the server rejected it */
  pendingError?: string;
  reactions: any[];
  syncedAt: number;
}

export interface LocalContact {
  id: string;
  user_clerk_id: string;
  contact_clerk_id: string;
  status: "accepted" | "pending_incoming" | "pending_outgoing";
  nickname: string | null;
  /** Joined profile data */
  profile: any | null;
  syncedAt: number;
}

export interface LocalProfile {
  clerk_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  status_message: string | null;
  is_online: boolean;
  subscription_tier: string;
  syncedAt: number;
}

export interface OutboxItem {
  id?: number; // auto-increment
  type:
    | "send_message"
    | "edit_message"
    | "delete_message"
    | "mark_read"
    | "react"
    | "log_call";
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

// ── Dexie database ─────────────────────────────────────────────────────────────

class ChatAppDB extends Dexie {
  conversations!: Table<LocalConversation, string>;
  messages!: Table<LocalMessage, string>;
  contacts!: Table<LocalContact, string>;
  profiles!: Table<LocalProfile, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super("ChatAppDB");
    // v1 — initial schema (no clerkUserId index on conversations)
    this.version(1).stores({
      conversations: "id, type, updated_at, isPinned, syncedAt",
      messages: "id, conversation_id, sender_clerk_id, created_at, syncedAt",
      contacts: "id, user_clerk_id, contact_clerk_id, status, syncedAt",
      profiles: "clerk_user_id, username, syncedAt",
      outbox: "++id, type, createdAt, attempts",
    });
    // v2 — add clerkUserId index so conversations are scoped per signed-in user
    this.version(2).stores({
      conversations: "id, clerkUserId, type, updated_at, isPinned, syncedAt",
    });
  }
}

export const db = new ChatAppDB();

// ── Helper utilities ──────────────────────────────────────────────────────────

/** Upsert a batch of conversations from the server response */
export async function upsertConversations(
  convs: any[],
  myClerkUserId: string
): Promise<void> {
  const now = Date.now();
  const rows: LocalConversation[] = convs.map((c: any) => ({
    id: c.id,
    clerkUserId: myClerkUserId,
    type: c.type,
    name: c.name ?? null,
    avatar_url: c.avatar_url ?? null,
    updated_at: c.updated_at,
    lastMessageText: c.lastMessage?.text ?? null,
    lastMessageAt: c.lastMessage?.created_at ?? null,
    lastMessageSenderId: c.lastMessage?.sender_clerk_id ?? null,
    unreadCount: c.unreadCount ?? 0,
    isPinned: c.isPinned ?? false,
    isMuted: c.isMuted ?? false,
    memberProfiles: c.memberProfiles ?? [],
    syncedAt: now,
  }));
  await db.conversations.bulkPut(rows);
}

/** Upsert a batch of messages from the server response */
export async function upsertMessages(messages: any[]): Promise<void> {
  const now = Date.now();
  const rows: LocalMessage[] = messages.map((m: any) => ({
    id: m.id,
    conversation_id: m.conversation_id,
    sender_clerk_id: m.sender_clerk_id,
    text: m.text ?? null,
    image_url: m.image_url ?? null,
    video_url: m.video_url ?? null,
    audio_url: m.audio_url ?? null,
    file_url: m.file_url ?? null,
    file_name: m.file_name ?? null,
    created_at: m.created_at,
    is_deleted: m.is_deleted ?? false,
    is_edited: m.is_edited ?? false,
    starred_by_me: m.starred_by_me ?? false,
    reactions: m.reactions ?? [],
    syncedAt: now,
  }));
  await db.messages.bulkPut(rows);
}

/** Upsert contacts from the server response */
export async function upsertContacts(contacts: any[], myClerkUserId: string): Promise<void> {
  const now = Date.now();
  const rows: LocalContact[] = contacts.map((c: any) => ({
    id: c.id,
    user_clerk_id: myClerkUserId,
    contact_clerk_id: c.contact_clerk_id,
    status: c.status,
    nickname: c.nickname ?? null,
    profile: c.profile ?? null,
    syncedAt: now,
  }));
  await db.contacts.bulkPut(rows);
}

/** Add an optimistic (pending) message — shown immediately while awaiting server confirm */
export async function addPendingMessage(
  conversationId: string,
  senderClerkId: string,
  text: string | null,
  imageUrl?: string
): Promise<LocalMessage> {
  const msg: LocalMessage = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    conversation_id: conversationId,
    sender_clerk_id: senderClerkId,
    text,
    image_url: imageUrl ?? null,
    video_url: null,
    audio_url: null,
    file_url: null,
    file_name: null,
    created_at: new Date().toISOString(),
    is_deleted: false,
    is_edited: false,
    starred_by_me: false,
    isPending: true,
    reactions: [],
    syncedAt: 0,
  };
  await db.messages.put(msg);
  return msg;
}

/** Queue a mutation for when the device goes back online */
export async function enqueueOutbox(
  type: OutboxItem["type"],
  payload: unknown
): Promise<void> {
  await db.outbox.add({ type, payload, createdAt: Date.now(), attempts: 0 });
}

/** Flush the outbox — call after regaining network, passing the API caller */
export async function flushOutbox(
  apiFn: (type: string, payload: unknown) => Promise<void>
): Promise<void> {
  const items = await db.outbox.orderBy("createdAt").toArray();
  for (const item of items) {
    try {
      await apiFn(item.type, item.payload);
      await db.outbox.delete(item.id!);
    } catch (err: any) {
      await db.outbox.update(item.id!, {
        attempts: item.attempts + 1,
        lastError: err?.message || "Unknown error",
      });
    }
  }
}
