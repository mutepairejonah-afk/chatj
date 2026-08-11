import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useUser, useClerk } from "@clerk/clerk-react";
import {
  Settings, ChevronRight, Shield, Bell, Moon, Sun, Lock, UserCircle,
  QrCode, Star, HelpCircle, Info, LogOut, X, Download, Copy, Check,
  Fingerprint, BadgeCheck, Edit3, Camera
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { QRCodeSVG } from "qrcode.react";
import { getOrCreateProfile, getNotificationCount, getStoryHighlights, getIsAdmin, getStories, createStoryHighlight } from "@/lib/api-client";
import { Plus } from "lucide-react";
import { usePremium } from "@/hooks/usePremium";
import { SetupPin, AppLockScreen } from "@/components/AppLock";
import { ProfilePreview } from "@/components/ProfilePreview";
import { useTheme } from "@/hooks/useTheme";
import {
  isAppLockEnabled,
  hasPinSet,
  enableAppLock,
  clearLockData,
  isPlatformAuthenticatorAvailable,
  registerBiometric,
  isBiometricPreferred,
  setBiometricPreferred,
  isBiometricSupported,
} from "@/lib/appLock";

export const Route = createFileRoute("/me")({
  component: MePage,
  head: () => ({
    meta: [
      { title: "Me — ChatApp" },
      { name: "description", content: "Your profile and settings" },
    ],
  }),
});

function QRModal({ clerkUserId, username, onClose }: { clerkUserId: string; username?: string; onClose: () => void }) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const qrValue = username
    ? (baseUrl ? `${baseUrl}/u/${username}` : `chatapp://user/${username}`)
    : `chatapp://user/${clerkUserId}`;
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<SVGSVGElement>(null);

  const handleCopyHandle = async () => {
    const text = username ? `@${username}` : clerkUserId;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svg = qrRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-qr-code.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="w-full max-w-md rounded-t-3xl bg-card p-6 pb-[max(env(safe-area-inset-bottom),24px)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">My QR Code</h2>
            <button onClick={onClose} className="rounded-full bg-secondary p-2 text-muted-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col items-center gap-5">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <QRCodeSVG ref={qrRef} value={qrValue} size={220} level="M" includeMargin={false} />
            </div>
            <div className="text-center">
              {username ? (
                <p className="text-xl font-bold text-foreground">@{username}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No handle set yet</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Scan to find and connect with you</p>
            </div>
            <div className="flex w-full gap-3">
              <button onClick={handleCopyHandle} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-medium text-foreground">
                {copied ? <Check size={16} className="text-online" /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy Handle"}
              </button>
              <button onClick={handleDownload} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground">
                <Download size={16} /> Save QR
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MePage() {
  const { user } = useUser();
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const { settings: premiumSettings } = usePremium();
  const { theme, setTheme, isDark } = useTheme();
  const [showQR, setShowQR] = useState(false);
  const [showSelfPreview, setShowSelfPreview] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [notifCount, setNotifCount] = useState<{ pendingRequests: number; total: number }>({ pendingRequests: 0, total: 0 });
  const [highlights, setHighlights] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddHighlight, setShowAddHighlight] = useState(false);
  const [myActiveStories, setMyActiveStories] = useState<any[]>([]);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [highlightTitle, setHighlightTitle] = useState("");
  const [savingHighlight, setSavingHighlight] = useState(false);

  const [lockEnabled, setLockEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [platformBiometric, setPlatformBiometric] = useState(false);
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [showVerifyToDisable, setShowVerifyToDisable] = useState(false);

  useEffect(() => {
    setLockEnabled(isAppLockEnabled() && hasPinSet());
    setBiometricEnabled(isBiometricPreferred());
    if (isBiometricSupported()) {
      isPlatformAuthenticatorAvailable().then(setPlatformBiometric);
    }
  }, []);

  const handleLockToggle = () => {
    if (lockEnabled) setShowVerifyToDisable(true);
    else setShowSetupPin(true);
  };

  const handleDisableLock = () => {
    clearLockData();
    setLockEnabled(false);
    setBiometricEnabled(false);
    setShowVerifyToDisable(false);
  };

  const handleBiometricToggle = async () => {
    if (biometricEnabled) { setBiometricPreferred(false); setBiometricEnabled(false); }
    else {
      if (!userId) return;
      const ok = await registerBiometric(userId);
      if (ok) setBiometricEnabled(true);
    }
  };

  useEffect(() => {
    if (!userId) return;
    getOrCreateProfile({ data: { clerkUserId: userId, displayName: user?.fullName || undefined, avatarUrl: user?.imageUrl || undefined } })
      .then(setProfile).catch(console.error);
  }, [userId, user]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getNotificationCount({ data: { clerkUserId: userId } })
      .then((r) => { if (!cancelled) setNotifCount({ pendingRequests: r.pendingRequests, total: r.total }); })
      .catch(console.error);
    getStoryHighlights({ data: { clerkUserId: userId } })
      .then((rows) => { if (!cancelled) setHighlights(rows || []); })
      .catch(console.error);
    getIsAdmin({ data: { clerkUserId: userId } })
      .then(({ isAdmin: flag }) => { if (!cancelled) setIsAdmin(flag); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const requestBadge = notifCount.pendingRequests > 0 ? notifCount.pendingRequests : undefined;

  const openAddHighlight = async () => {
    if (!userId) return;
    setSelectedStoryIds([]); setHighlightTitle(""); setShowAddHighlight(true);
    try {
      const { groups } = await getStories({ data: { clerkUserId: userId } });
      const mine = (groups || []).find((g: any) => g.clerkUserId === userId);
      setMyActiveStories(mine?.stories || []);
    } catch { setMyActiveStories([]); }
  };

  const saveHighlight = async () => {
    if (!userId || !highlightTitle.trim() || selectedStoryIds.length === 0) return;
    setSavingHighlight(true);
    try {
      const coverStory = myActiveStories.find((s) => s.id === selectedStoryIds[0]);
      const row = await createStoryHighlight({ data: { clerkUserId: userId, title: highlightTitle.trim(), storyIds: selectedStoryIds, coverUrl: coverStory?.imageUrl || coverStory?.image_url || undefined } });
      setHighlights((prev) => [...prev, row]);
      setShowAddHighlight(false);
    } catch (err: any) {
      alert(err?.message || "Failed to create highlight");
    } finally { setSavingHighlight(false); }
  };

  const displayName = profile?.display_name || user?.fullName || user?.primaryEmailAddress?.emailAddress || "User";
  const avatarUrl = profile?.avatar_url || user?.imageUrl || `https://api.dicebear.com/9.x/avataaars/svg?seed=me`;

  const isVerified = premiumSettings.verified || isAdmin;
  const ringColor = isAdmin ? "ring-red-500" : isVerified ? "ring-primary" : "ring-transparent";

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pb-2 pt-[max(env(safe-area-inset-top),16px)]">
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <button onClick={() => navigate({ to: "/settings" })} className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Settings size={17} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-6">

        {/* Hero profile card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-2 mb-3 rounded-3xl bg-card overflow-hidden"
        >
          {/* Cover gradient */}
          <div className={`h-24 bg-gradient-to-br ${isAdmin ? "from-red-600/30 to-rose-500/20" : isVerified ? "from-primary/30 to-sky-500/20" : "from-primary/20 to-accent/10"}`} />

          {/* Avatar + info */}
          <div className="px-4 pb-4">
            <div className="flex items-end justify-between -mt-10 mb-3">
              <button onClick={() => setShowSelfPreview(true)} className="relative shrink-0">
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className={`h-20 w-20 rounded-full border-4 border-card object-cover ring-2 ${ringColor}`}
                />
                <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary border-2 border-card">
                  <Camera size={11} className="text-primary-foreground" />
                </div>
              </button>
              <button
                onClick={() => navigate({ to: "/edit-profile" })}
                className="flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <Edit3 size={13} /> Edit
              </button>
            </div>

            <div className="flex items-start gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground truncate">{displayName}</h2>
                  {isVerified && (
                    <BadgeCheck size={18} className={isAdmin ? "text-red-500 shrink-0" : "text-primary shrink-0"} />
                  )}
                </div>
                {profile?.username ? (
                  <p className="text-sm font-medium text-primary">@{profile.username}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No handle — tap Edit</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {profile?.status_message || "Hey there! I'm using ChatApp"}
                </p>
              </div>
            </div>

            {isVerified && !isAdmin && (
              <div className="mt-3">
                <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary">
                  <BadgeCheck size={9} /> VERIFIED
                </span>
              </div>
            )}
            {isAdmin && (
              <span className="mt-3 inline-flex rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-500">
                ADMIN
              </span>
            )}
          </div>
        </motion.div>

        {/* Quick action row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mx-4 mb-3 grid grid-cols-4 gap-2"
        >
          {[
            { icon: QrCode, label: "QR Code", onClick: () => setShowQR(true), color: "text-primary" },
            { icon: Bell, label: "Alerts", onClick: () => navigate({ to: "/notifications" }), color: "text-destructive", badge: requestBadge },
            { icon: Star, label: "Starred", onClick: () => navigate({ to: "/starred" }), color: "text-amber-400" },
            { icon: isDark ? Sun : Moon, label: isDark ? "Light" : "Dark", onClick: () => setTheme(isDark ? "light" : "dark"), color: isDark ? "text-amber-400" : "text-primary" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-card py-3 px-1 active:scale-95 transition-transform"
            >
              {item.badge && (
                <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
              <item.icon size={20} className={item.color} />
              <span className="text-[10px] font-medium text-muted-foreground">{item.label}</span>
            </button>
          ))}
        </motion.div>

        {/* Story Highlights */}
        {(
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mx-4 mb-3"
          >
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Story Highlights</span>
              <Star size={11} className="text-primary" />
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-0.5">
              {highlights.map((h: any) => (
                <div key={h.id} className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="w-14 h-14 rounded-full border-2 border-primary/70 overflow-hidden bg-muted">
                    <img src={h.cover_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${h.id}`} alt={h.title} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">{h.title}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <button
                  onClick={openAddHighlight}
                  className="w-14 h-14 rounded-full border-2 border-dashed border-border bg-secondary flex items-center justify-center active:bg-secondary/80 transition-colors"
                  aria-label="Add highlight"
                >
                  <Plus size={20} className="text-muted-foreground" />
                </button>
                <span className="text-[10px] text-muted-foreground">New</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Verified badge promo (unverified users only) */}
        {!isVerified && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => navigate({ to: "/premium" })}
            className="mx-4 mb-3 w-[calc(100%-2rem)] rounded-2xl bg-gradient-to-r from-primary/20 via-sky-500/10 to-cyan-500/10 border border-primary/20 p-4 flex items-center gap-3 active:opacity-90"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-sky-400">
              <BadgeCheck size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-foreground">Get Verified</p>
              <p className="text-xs text-muted-foreground">Blue checkmark · only $2.99 one-time</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" />
          </motion.button>
        )}

        {/* Menu sections */}
        {[
          {
            title: "Account",
            delay: 0.12,
            items: [
              { icon: UserCircle, label: "Edit Profile", color: "text-primary", onClick: () => navigate({ to: "/edit-profile" }) },
              {
                icon: BadgeCheck,
                label: "Verified Badge",
                color: isVerified ? "text-primary" : "text-muted-foreground",
                badge: isVerified ? "Active" : "Get",
                onClick: () => navigate({ to: "/premium" }),
              },
            ],
          },
          {
            title: "Privacy & Security",
            delay: 0.16,
            items: [
              {
                icon: Lock,
                label: "App Lock (Passcode)",
                color: "text-online",
                badge: lockEnabled ? "On" : "Off",
                onClick: handleLockToggle,
              },
              ...(lockEnabled && platformBiometric ? [{
                icon: Fingerprint,
                label: "Biometric Unlock",
                color: "text-primary",
                badge: biometricEnabled ? "On" : "Off",
                onClick: handleBiometricToggle,
              }] : []),
              { icon: Shield, label: "Privacy Settings", color: "text-primary", onClick: () => navigate({ to: "/edit-profile" }) },
            ],
          },
          {
            title: "More",
            delay: 0.2,
            items: [
              { icon: Bell, label: "Notifications", color: "text-destructive", badge: requestBadge ? String(requestBadge) : undefined, onClick: () => navigate({ to: "/notifications" }) },
              { icon: Settings, label: "Settings", color: "text-muted-foreground", onClick: () => navigate({ to: "/settings" }) },
              { icon: HelpCircle, label: "Help & Feedback", color: "text-muted-foreground" },
              { icon: Info, label: "About", color: "text-muted-foreground" },
              ...(isAdmin ? [{ icon: Shield, label: "Admin Dashboard", color: "text-destructive", badge: "Admin", onClick: () => navigate({ to: "/admin-panel" }) }] : []),
            ],
          },
        ].map((section) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: section.delay }}
            className="mx-4 mb-3"
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">{section.title}</p>
            <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border">
              {section.items.map((item: any) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="flex w-full items-center gap-3 px-4 py-3.5 active:bg-secondary/50 transition-colors"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.color.replace("text-", "bg-").replace("/", "/10")}/10`}>
                    <item.icon size={16} className={item.color} />
                  </div>
                  <span className="flex-1 text-left text-[14px] text-foreground">{item.label}</span>
                  {item.badge && (
                    <span className={`mr-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                      item.badge === "On" ? "bg-online/20 text-online" :
                      item.badge === "Off" ? "bg-secondary text-muted-foreground" :
                      item.badge === "Admin" ? "bg-red-500/15 text-red-500" :
                      item.badge === "Active" ? "bg-primary/15 text-primary" :
                      item.badge === "Get" ? "bg-secondary text-muted-foreground" :
                      "bg-destructive text-destructive-foreground"
                    }`}>
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight size={15} className="text-muted-foreground/50" />
                </button>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Sign Out */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="mx-4 mb-4 rounded-2xl bg-card overflow-hidden"
        >
          <button
            onClick={() => signOut()}
            className="flex w-full items-center justify-center gap-2 px-4 py-3.5 active:bg-secondary/50"
          >
            <LogOut size={17} className="text-destructive" />
            <span className="text-[14px] font-medium text-destructive">Sign Out</span>
          </button>
        </motion.div>
      </div>

      {/* Add Highlight modal */}
      <AnimatePresence>
        {showAddHighlight && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAddHighlight(false)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-card overflow-hidden flex flex-col max-h-[85dvh]"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <button onClick={() => setShowAddHighlight(false)} className="text-muted-foreground"><X size={20} /></button>
                <span className="font-semibold text-foreground">New Highlight</span>
                <button onClick={saveHighlight} disabled={savingHighlight || !highlightTitle.trim() || selectedStoryIds.length === 0} className="text-sm font-semibold text-primary disabled:opacity-40">
                  {savingHighlight ? "Saving…" : "Save"}
                </button>
              </div>
              <div className="px-4 py-3 shrink-0">
                <input value={highlightTitle} onChange={(e) => setHighlightTitle(e.target.value.slice(0, 60))} placeholder="Highlight name" className="w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground outline-none" />
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {myActiveStories.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Post a story first, then add it to a highlight.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {myActiveStories.map((s: any) => {
                      const selected = selectedStoryIds.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => setSelectedStoryIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])} className={`relative aspect-[9/14] rounded-xl overflow-hidden border-2 ${selected ? "border-primary" : "border-transparent"}`}>
                          {s.image_url ? <img src={s.image_url} alt="" className="w-full h-full object-cover" /> : (
                            <div className={`w-full h-full bg-gradient-to-br ${s.background_color || "from-primary to-fuchsia-500"} flex items-center justify-center p-2`}>
                              <span className="text-white text-[11px] font-semibold text-center line-clamp-4">{s.text}</span>
                            </div>
                          )}
                          {selected && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check size={12} className="text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showQR && userId && (
        <QRModal clerkUserId={userId} username={profile?.username} onClose={() => setShowQR(false)} />
      )}

      <ProfilePreview
        open={showSelfPreview}
        onClose={() => setShowSelfPreview(false)}
        clerkUserId={userId}
        initialName={profile?.display_name || user?.fullName}
        initialAvatarUrl={profile?.avatar_url || user?.imageUrl}
        initialUsername={profile?.username}
        initialStatus={profile?.status_message}
        isSelf
      />

      <AnimatePresence>
        {showSetupPin && (
          <SetupPin onDone={() => { setShowSetupPin(false); setLockEnabled(true); }} onCancel={() => setShowSetupPin(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVerifyToDisable && (
          <AppLockScreen onUnlocked={handleDisableLock} />
        )}
      </AnimatePresence>
    </div>
  );
}
