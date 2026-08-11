/**
 * useConversations — offline-first conversation list.
 *
 * Pattern (WhatsApp / Telegram):
 *  1. Read from IndexedDB via Dexie useLiveQuery → instant render from cache
 *  2. Fetch from API in the background → upsert into DB → component auto-updates
 *  3. Window online/offline events control sync and surface an isOffline flag
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, useCallback, useRef } from "react";
import { db, upsertConversations, type LocalConversation } from "@/lib/db";
import { getConversations, getOrCreateProfile } from "@/lib/api-client";

export function useConversations(
  userId: string | null | undefined,
  userFullName?: string | null,
  userAvatarUrl?: string | null
) {
  const [syncing, setSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const syncingRef = useRef(false); // avoid double-syncs with stale closure

  // ── Reactive DB query — scoped to the signed-in user ─────────────────────
  // Explicit generic avoids the `never[]` inference that occurs when the two
  // branches return different Dexie promise types.
  const localConvs = useLiveQuery<LocalConversation[]>(
    () =>
      userId
        ? db.conversations
            .where("clerkUserId")
            .equals(userId)
            .sortBy("updated_at")
            .then((rows) => rows.reverse())
        : Promise.resolve([] as LocalConversation[]),
    [userId]
  );

  const hasCache = (localConvs?.length ?? 0) > 0;
  // Show loading only on first mount with no cached data
  const isLoading = localConvs === undefined;

  // ── Background sync from server ───────────────────────────────────────────
  const sync = useCallback(async () => {
    if (!userId || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      // Ensure the profile exists (idempotent)
      await getOrCreateProfile({
        data: {
          clerkUserId: userId,
          displayName: userFullName ?? undefined,
          avatarUrl: userAvatarUrl ?? undefined,
        },
      });
      const fresh = await getConversations({ data: { clerkUserId: userId } });
      if (Array.isArray(fresh)) {
        await upsertConversations(fresh, userId);
      }
    } catch (err) {
      // Silently fail — cached data is still shown
      console.warn("[useConversations] sync failed:", (err as Error).message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [userId, userFullName, userAvatarUrl]);

  // ── Initial sync + online/offline tracking ────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const handleOnline = () => {
      setIsOffline(false);
      sync();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Sync immediately if online
    if (navigator.onLine) sync();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [userId, sync]);

  // ── Periodic background refresh every 30 s ────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      if (navigator.onLine) sync();
    }, 30_000);
    return () => clearInterval(interval);
  }, [userId, sync]);

  return {
    conversations: localConvs ?? [],
    isLoading,
    hasCache,
    syncing,
    isOffline,
    refresh: sync,
  };
}
