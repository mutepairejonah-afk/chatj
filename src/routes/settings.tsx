import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, Sun, Moon, Lock, Shield, ChevronRight, Crown, MessageSquare, Smartphone, Download, Info } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { usePremium } from "@/hooks/usePremium";
import { useTheme } from "@/hooks/useTheme";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings" }] }),
});

type FontSize = "small" | "medium" | "large";

function SettingsPage() {
  const navigate = useNavigate();
  const { isPremium, isPro } = usePremium();
  const { theme, setTheme, isDark } = useTheme();

  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem("chatapp_notif_settings");
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore malformed or unavailable local storage and use defaults.
    }
    return { messages: true, mentions: true, requests: true, sounds: true, vibrate: true };
  });
  const [chatSettings, setChatSettings] = useState<{ fontSize: FontSize; enterToSend: boolean; mediaAutoDownload: boolean }>(() => {
    try {
      const saved = localStorage.getItem("chatapp_chat_settings");
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore malformed or unavailable local storage and use defaults.
    }
    return { fontSize: "medium" as FontSize, enterToSend: false, mediaAutoDownload: true };
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem("chatapp_notif_settings", JSON.stringify(notifications));
    } catch {
      // Persistence is best-effort when storage is unavailable.
    }
  }, [notifications]);
  useEffect(() => {
    try {
      localStorage.setItem("chatapp_chat_settings", JSON.stringify(chatSettings));
    } catch {
      // Persistence is best-effort when storage is unavailable.
    }
  }, [chatSettings]);

  return (
    <div className="flex flex-col h-dvh bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={() => navigate({ to: "/me" })} className="p-2 -ml-2 text-muted-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 space-y-4 pb-10"
        >
          {/* Appearance */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Appearance</h2>
            <div className="rounded-2xl bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {isDark ? <Moon size={16} className="text-primary" /> : <Sun size={16} className="text-amber-500" />}
                  <div>
                    <p className="text-sm text-foreground">{isDark ? "Dark Mode (Black)" : "Light Mode"}</p>
                    <p className="text-xs text-muted-foreground">{isDark ? "Pure black background" : "Bright clean theme"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDark ? "bg-primary" : "bg-secondary"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${isDark ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="px-4 pb-3 border-t border-border">
                <p className="text-[11px] text-muted-foreground mt-3 mb-2">Choose theme</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={`flex-1 rounded-xl py-2.5 text-xs font-medium border-2 transition-all flex items-center justify-center gap-1.5 ${theme === "light" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                  >
                    <Sun size={13} /> Light
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`flex-1 rounded-xl py-2.5 text-xs font-medium border-2 transition-all flex items-center justify-center gap-1.5 ${theme === "dark" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                  >
                    <Moon size={13} /> Black
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Notifications */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Notifications</h2>
            <div className="rounded-2xl bg-card divide-y divide-border overflow-hidden">
              {([
                { key: "messages", label: "New Messages", icon: MessageSquare },
                { key: "mentions", label: "Mentions & Replies", icon: Bell },
                { key: "requests", label: "Contact Requests", icon: Shield },
                { key: "sounds", label: "Notification Sounds", icon: Bell },
                { key: "vibrate", label: "Vibrate", icon: Smartphone },
              ] as { key: keyof typeof notifications; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon size={16} className="text-muted-foreground" />
                    <span className="text-sm text-foreground">{label}</span>
                  </div>
                  <button
                    onClick={() => setNotifications((n) => ({ ...n, [key]: !n[key] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notifications[key] ? "bg-primary" : "bg-secondary"}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${notifications[key] ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Chat Settings */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Chat</h2>
            <div className="rounded-2xl bg-card divide-y divide-border overflow-hidden">
              <div className="px-4 py-3">
                <p className="text-sm text-foreground mb-2">Font Size</p>
                <div className="flex gap-2">
                  {(["small", "medium", "large"] as FontSize[]).map((size) => (
                    <button
                      key={size}
                      onClick={() => setChatSettings((s) => ({ ...s, fontSize: size }))}
                      className={`flex-1 py-1.5 rounded-xl text-sm capitalize transition-colors ${chatSettings.fontSize === size ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">Enter to Send</p>
                  <p className="text-xs text-muted-foreground">Press Enter to send messages</p>
                </div>
                <button
                  onClick={() => setChatSettings((s) => ({ ...s, enterToSend: !s.enterToSend }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${chatSettings.enterToSend ? "bg-primary" : "bg-secondary"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${chatSettings.enterToSend ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">Auto-download Media</p>
                  <p className="text-xs text-muted-foreground">Download photos/videos automatically</p>
                </div>
                <button
                  onClick={() => setChatSettings((s) => ({ ...s, mediaAutoDownload: !s.mediaAutoDownload }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${chatSettings.mediaAutoDownload ? "bg-primary" : "bg-secondary"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${chatSettings.mediaAutoDownload ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </section>

          {/* Privacy */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Privacy & Security</h2>
            <div className="rounded-2xl bg-card divide-y divide-border overflow-hidden">
              <Link to="/edit-profile" className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Lock size={16} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Privacy Settings</span>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </Link>
              <Link to="/blocked" className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Shield size={16} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Blocked Users</span>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </Link>
            </div>
          </section>

          {/* Premium */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Subscription</h2>
            <Link to="/premium" className="rounded-2xl block overflow-hidden">
              <div className={`p-4 ${isPro ? "bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-400/30" : isPremium ? "bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-amber-400/30" : "bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20"} rounded-2xl`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Crown size={20} className={isPro ? "text-fuchsia-500" : isPremium ? "text-amber-500" : "text-primary"} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {isPro ? "Pro Plan" : isPremium ? "Premium Plan" : "Free Plan"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isPro ? "All features unlocked" : isPremium ? "Upgrade to Pro for AI + more" : "Upgrade for premium features"}
                      </p>
                    </div>
                  </div>
                  {!isPro && (
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      Upgrade
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </section>

          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Storage & Data</h2>
            <div className="rounded-2xl bg-card divide-y divide-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Download size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm text-foreground">Max Upload Size</p>
                    <p className="text-xs text-muted-foreground">{isPremium ? "500 MB per file" : "50 MB per file"}</p>
                  </div>
                </div>
              </div>
              {isPro && (
                <button className="flex items-center justify-between w-full px-4 py-3 text-left">
                  <div className="flex items-center gap-3">
                    <Download size={16} className="text-muted-foreground" />
                    <span className="text-sm text-foreground">Export Chat History</span>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </button>
              )}
            </div>
          </section>

          <section>
            <div className="rounded-2xl bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <Info size={16} className="text-muted-foreground" />
                <span className="text-sm text-foreground">Version 1.0.0</span>
              </div>
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
