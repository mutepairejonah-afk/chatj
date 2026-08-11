import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { MessageCircle, Users, Compass, User, Phone } from "lucide-react";
import { ChatListPanel } from "./ChatListPanel";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { getOrCreateProfile, getNotificationCount, getOrCreateDirectConversation } from "@/lib/api-client";
import { HandleClaimModal } from "./HandleClaimModal";
import { getSocket } from "@/lib/socket";
import { registerCallStarter, unregisterCallStarter } from "@/lib/callTrigger";
import { CallModal, IncomingCallSheet } from "./CallModal";
import {
  useIncomingCall,
  useStartCall,
  type CallSession,
} from "@/callAPI/callAPI";
import { AppLockScreen } from "./AppLock";
import { isAppLockEnabled, hasPinSet, startLockTimer } from "@/lib/appLock";

const tabs = [
  { to: "/", icon: MessageCircle, label: "Chats" },
  { to: "/calls", icon: Phone, label: "Calls" },
  { to: "/contacts", icon: Users, label: "Contacts" },
  { to: "/discover", icon: Compass, label: "Discover" },
  { to: "/me", icon: User, label: "Me" },
] as const;

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { user } = useUser();

  const [needsHandle, setNeedsHandle] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  // Live unread message count for the Chats tab badge
  const [unreadTotal, setUnreadTotal] = useState(0);
  const unreadFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── App lock ───────────────────────────────────────────────────────
  const [appLocked, setAppLocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return isAppLockEnabled() && hasPinSet();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    return startLockTimer(() => setAppLocked(true));
  }, []);

  const isChat = location.pathname.startsWith("/chat/") || location.pathname === "/ai-chat";
  const isAuthPage = location.pathname === "/login";
  const isPublicProfile = location.pathname.startsWith("/u/");
  // Full-screen content pages: not a "pick something from this list" flow,
  // so they shouldn't be squeezed into the narrow list column next to an
  // empty chat placeholder on desktop.
  const isFullWidthPage = location.pathname === "/discover";

  // Redirect to login if not signed in (public profile pages stay accessible)
  useEffect(() => {
    if (isLoaded && !isSignedIn && !isAuthPage && !isPublicProfile) {
      navigate({ to: "/login" });
    }
  }, [isLoaded, isSignedIn, isAuthPage, isPublicProfile, navigate]);

  // First-time sign-in: ensure profile exists, prompt for @handle if missing
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId || profileChecked) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await getOrCreateProfile({
          data: {
            clerkUserId: userId,
            displayName: user?.fullName || undefined,
            avatarUrl: user?.imageUrl || undefined,
          },
        });
        if (cancelled) return;
        if (!profile?.username) setNeedsHandle(true);
      } catch (err) {
        console.error("Profile bootstrap failed:", err);
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, user, profileChecked]);

  // ─── Unread count + live socket badge ─────────────────────────────
  useEffect(() => {
    if (!isSignedIn || !userId) return;

    const fetchUnread = async () => {
      try {
        const counts = await getNotificationCount({ data: { clerkUserId: userId } });
        setUnreadTotal(counts.unreadMessages || 0);
      } catch { /* silent */ }
    };

    fetchUnread();

    const socket = getSocket(userId);
    if (!socket) return;

    const onNew = (data: any) => {
      // Only bump badge when message is from someone else
      if (data?.message?.sender_clerk_id && data.message.sender_clerk_id !== userId) {
        // Debounce to avoid hammering the DB
        if (unreadFetchRef.current) clearTimeout(unreadFetchRef.current);
        unreadFetchRef.current = setTimeout(fetchUnread, 800);
      }
    };
    socket.on("message:new", onNew);

    // Re-fetch when user navigates to a chat (they likely read it)
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (unreadFetchRef.current) clearTimeout(unreadFetchRef.current);
        unreadFetchRef.current = setTimeout(fetchUnread, 1000);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      socket.off("message:new", onNew);
      document.removeEventListener("visibilitychange", onVisibility);
      if (unreadFetchRef.current) clearTimeout(unreadFetchRef.current);
    };
  }, [isSignedIn, userId]);

  // When the user navigates to the Chats tab, reset badge
  useEffect(() => {
    if (location.pathname === "/" || location.pathname.startsWith("/chat/")) {
      // Give the read receipt a moment, then refresh
      const t = setTimeout(async () => {
        if (!userId) return;
        try {
          const counts = await getNotificationCount({ data: { clerkUserId: userId } });
          setUnreadTotal(counts.unreadMessages || 0);
        } catch { /* silent */ }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [location.pathname, userId]);

  // ─── Global call layer ─────────────────────────────────────────────
  // Incoming-call ringer + accepted-call modal must work on every page,
  // not just /chat/$id. useIncomingCall and useStartCall from callAPI
  // handle all signaling; this component only manages the session state.
  const socket = (isSignedIn && userId) ? getSocket(userId) : null;
  const [globalCall, setGlobalCall] = useState<CallSession | null>(null);

  // Buffer SDP offers that arrive during ringing (before callee taps accept).
  // The server never includes the offer in call:incoming — it arrives as a
  // separate call:signal event emitted by the caller's CallModal once it mounts.
  // Without this buffer the offer is lost if it arrives before the callee accepts.
  const offerCacheRef = useRef(new Map<string, RTCSessionDescriptionInit>());

  useEffect(() => {
    if (!socket) return;
    const onSignal = (data: { fromClerkId: string; signal: any }) => {
      if (data.signal?.type === "sdp" && data.signal.sdp?.type === "offer") {
        offerCacheRef.current.set(data.fromClerkId, data.signal.sdp);
      }
    };
    const onEnded = (data: { fromClerkId: string }) => {
      offerCacheRef.current.delete(data.fromClerkId);
    };
    socket.on("call:signal", onSignal);
    socket.on("call:ended", onEnded);
    return () => {
      socket.off("call:signal", onSignal);
      socket.off("call:ended", onEnded);
    };
  }, [socket]);

  // Called by useIncomingCall when the callee taps accept.
  // Merges any buffered offer so useCallSession can immediately answer.
  const onCallAccepted = useCallback((session: CallSession) => {
    const bufferedOffer = offerCacheRef.current.get(session.peerClerkId);
    setGlobalCall(bufferedOffer ? { ...session, initialOffer: bufferedOffer } : session);
    offerCacheRef.current.delete(session.peerClerkId);
  }, []);

  const onCallStarted = useCallback((session: CallSession) => {
    if (globalCall) return;
    setGlobalCall(session);
  }, [globalCall]);

  const { incoming, accept: acceptIncoming, reject: rejectRaw } = useIncomingCall(
    globalCall ? null : socket, // stop listening while already in a call
    userId ?? "",
    onCallAccepted
  );

  // Wrap reject so the offer cache is always cleared for this peer,
  // preventing a stale offer from being used on the next call from the same caller.
  const rejectIncoming = useCallback(() => {
    if (incoming) offerCacheRef.current.delete(incoming.fromClerkId);
    rejectRaw();
  }, [incoming, rejectRaw]);

  // useStartCall returns a stable function that emits call:invite + builds the session
  const startCall = useStartCall(
    socket,
    userId ?? "",
    user?.fullName ?? "Someone",
    user?.imageUrl ?? null,
    onCallStarted
  );

  // Allow any page (e.g. Contacts, calls page) to trigger a call without
  // navigating — registers the global helper used by startGlobalCall().
  useEffect(() => {
    if (!userId) return;
    registerCallStarter(({ conversationId, peerClerkId, peerName, peerAvatar, kind }) => {
      if (globalCall) return;
      startCall({ toClerkId: peerClerkId, peerName, peerAvatar, conversationId, kind });
    });
    return () => unregisterCallStarter();
  }, [userId, globalCall, startCall]);

  const callLayer = userId && socket && (
    <AnimatePresence>
      {incoming && !globalCall && (
        <IncomingCallSheet
          fromName={incoming.fromName}
          fromAvatar={incoming.fromAvatar}
          fromClerkId={incoming.fromClerkId}
          kind={incoming.kind}
          onAccept={acceptIncoming}
          onReject={rejectIncoming}
        />
      )}
      {globalCall && (
        <CallModal
          myClerkId={userId}
          session={globalCall}
          socket={socket}
          onClose={() => setGlobalCall(null)}
        />
      )}
    </AnimatePresence>
  );

  if (!isLoaded) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Show lock screen on top of everything (except the spinner above)
  if (appLocked && isSignedIn) {
    return <AppLockScreen onUnlocked={() => setAppLocked(false)} />;
  }

  if (isAuthPage) return <div className="h-dvh bg-background">{children}</div>;

  // ─── Desktop side rail (lg+) ──────────────────────────────────────
  const sideRail = (
    <nav className="hidden lg:flex w-[68px] shrink-0 flex-col items-center border-r border-border bg-surface py-3 gap-1">
      {tabs.map((tab) => {
        const isActive =
          tab.to === "/"
            ? location.pathname === "/" || location.pathname.startsWith("/chat/")
            : location.pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`group relative flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
            }`}
            title={tab.label}
          >
            <tab.icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
            {tab.to === "/" && unreadTotal > 0 && !isActive && (
              <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
                {unreadTotal > 99 ? "99" : unreadTotal}
              </span>
            )}
            {isActive && (
              <motion.span
                layoutId="rail-indicator"
                className="absolute left-0 h-6 w-1 rounded-r bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );

  const mobileBottomNav = (
    <nav className="lg:hidden flex items-center justify-around border-t border-border bg-surface px-2 pb-[env(safe-area-inset-bottom)] pt-1">
      {tabs.map((tab) => {
        const isActive =
          tab.to === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className="relative flex flex-col items-center gap-0.5 px-3 py-2"
          >
            <div className="relative">
              <tab.icon
                size={22}
                className={isActive ? "text-tab-active" : "text-tab-inactive"}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              {tab.to === "/" && unreadTotal > 0 && !isActive && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
                  {unreadTotal > 99 ? "99" : unreadTotal}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-medium ${isActive ? "text-tab-active" : "text-tab-inactive"}`}
            >
              {tab.label}
            </span>
            {isActive && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute -top-1 h-0.5 w-8 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );

  // ─── Chat detail route (`/chat/$id`) ──────────────────────────────
  // Mobile: just render the chat full-screen (no bottom nav).
  // Desktop: WhatsApp-style — rail + chat list + chat pane.
  if (isChat) {
    return (
      <>
        <div className="flex h-dvh bg-background">
          {sideRail}
          <aside className="hidden lg:flex w-[360px] xl:w-[400px] shrink-0 flex-col border-r border-border bg-surface">
            <ChatListPanel compactActive />
          </aside>
          <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
        </div>
        {isSignedIn && needsHandle && userId && (
          <HandleClaimModal
            clerkUserId={userId}
            onClaimed={() => setNeedsHandle(false)}
          />
        )}
        {callLayer}
      </>
    );
  }

  // ─── Full-width content pages (e.g. Discover) ──────────────────────
  // Mobile: fills the screen with the bottom tab bar, same as any tab.
  // Desktop: rail + the route filling all remaining width — no narrow
  // list column, no empty chat placeholder next to it.
  if (isFullWidthPage) {
    return (
      <>
        <div className="flex h-dvh bg-background">
          {sideRail}
          <div className="flex flex-1 min-w-0 flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
            {mobileBottomNav}
          </div>
        </div>
        {isSignedIn && needsHandle && userId && (
          <HandleClaimModal
            clerkUserId={userId}
            onClaimed={() => setNeedsHandle(false)}
          />
        )}
        {callLayer}
      </>
    );
  }

  // ─── All other routes ─────────────────────────────────────────────
  // Mobile: route fills the screen with bottom tab bar.
  // Desktop: rail + the route as the middle list pane + an empty placeholder
  // pane on the right (so the layout stays consistent).
  return (
    <div className="flex h-dvh bg-background">
      {sideRail}
      <div className="flex flex-1 min-w-0 flex-col">
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 lg:max-w-[420px] xl:max-w-[460px] lg:border-r lg:border-border overflow-hidden">
            {children}
          </div>
          <div className="hidden lg:flex flex-1 items-center justify-center bg-background">
            <div className="text-center max-w-sm px-6">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle size={36} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Pick up where you left off</h2>
              <p className="text-sm text-muted-foreground">Select a conversation from the Chats tab to start messaging.</p>
            </div>
          </div>
        </div>
        {mobileBottomNav}
      </div>

      {isSignedIn && needsHandle && userId && (
        <HandleClaimModal
          clerkUserId={userId}
          onClaimed={() => setNeedsHandle(false)}
        />
      )}
      {callLayer}
    </div>
  );
}
