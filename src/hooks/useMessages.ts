/**
 * useMessages — offline-first message list for a single conversation.
 *
 * Pattern:
 *  1. useLiveQuery reads from IndexedDB — instant render of cached messages
 *  2. On mount (and when conversationId changes) fetch from API → upsert DB
 *  3. Optimistic messages (isPending=true) written to DB immediately on send,
 *     then replaced when the server confirms
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  db,
  upsertMessages,
  type LocalMessage,
} from "@/lib/db";
import {
  getMessages,
  markConversationRead,
  markMessagesRead,
} from "@/lib/api-client";

export function useMessages(
  conversationId: string | null | undefined,
  userId: string | null | undefined
) {
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  // ── Reactive DB query ─────────────────────────────────────────────────────
  const localMessages = useLiveQuery<LocalMessage[]>(
    () =>
      conversationId
        ? db.messages
            .where("conversation_id")
            .equals(conversationId)
            .sortBy("created_at")
        : Promise.resolve([]),
    [conversationId]
  );

  const hasCache = (localMessages?.length ?? 0) > 0;
  const isLoading = localMessages === undefined;

  // ── Sync from server ──────────────────────────────────────────────────────
  const sync = useCallback(async () => {
    if (!conversationId || !userId || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const fresh = await getMessages({
        data: { conversationId, clerkUserId: userId },
      });
      if (Array.isArray(fresh) && fresh.length) {
        await upsertMessages(fresh);
        // Mark messages from others as read
        const otherIds = fresh
          .filter((m: any) => m.sender_clerk_id !== userId && !m.is_deleted)
          .map((m: any) => m.id)
          .filter(Boolean);
        if (otherIds.length) {
          markMessagesRead({
            data: { clerkUserId: userId, messageIds: otherIds },
          }).catch(() => {});
          markConversationRead({
            data: { conversationId, clerkUserId: userId },
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("[useMessages] sync failed:", (err as Error).message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [conversationId, userId]);

  useEffect(() => {
    if (navigator.onLine) sync();
  }, [conversationId, userId, sync]);

  // ── Optimistic write helpers ───────────────────────────────────────────────

  /** Write an optimistic (pending) message to the DB immediately */
  const addOptimistic = useCallback(
    async (partial: Omit<LocalMessage, "syncedAt">) => {
      await db.messages.put({ ...partial, syncedAt: 0 });
    },
    []
  );

  /** Replace a pending message with the server-confirmed version */
  const confirmOptimistic = useCallback(
    async (pendingId: string, confirmed: any) => {
      await db.messages.delete(pendingId);
      await upsertMessages([confirmed]);
    },
    []
  );

  /** Delete a pending message (e.g. on send failure) */
  const removePending = useCallback(async (pendingId: string) => {
    await db.messages.delete(pendingId);
  }, []);

  /** Mark a live socket message as read in the local DB */
  const upsertIncoming = useCallback(async (raw: any) => {
    if (!raw?.id) return;
    await upsertMessages([raw]);
  }, []);

  return {
    messages: localMessages ?? [],
    isLoading,
    hasCache,
    syncing,
    refresh: sync,
    addOptimistic,
    confirmOptimistic,
    removePending,
    upsertIncoming,
  };
}
