import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useUser, useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Camera, Loader2, Check, X, AtSign, Link as LinkIcon, Plus, Trash2, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { getOrCreateProfile, updateProfile, uploadAvatar, claimUsername, checkUsernameAvailability, updatePrivacySettings, updateBioLinks } from "@/lib/api-client";

export const Route = createFileRoute("/edit-profile")({
  component: EditProfilePage,
  head: () => ({
    meta: [
      { title: "Edit Profile — ChatApp" },
      { name: "description", content: "Update your profile information" },
    ],
  }),
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/;

function EditProfilePage() {
  const { user } = useUser();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hideReadReceipts, setHideReadReceipts] = useState(false);
  const [bioLinks, setBioLinks] = useState<{ label: string; url: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    async function load() {
      try {
        const profile = await getOrCreateProfile({
          data: {
            clerkUserId: userId!,
            displayName: user?.fullName || undefined,
            avatarUrl: user?.imageUrl || undefined,
          },
        });
        setDisplayName(profile.display_name || "");
        setStatusMessage(profile.status_message || "");
        setAvatarUrl(profile.avatar_url || "");
        const handle = profile.username || "";
        setUsername(handle);
        setUsernameInput(handle);
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  const checkUsername = useCallback((value: string) => {
    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    if (!value) { setUsernameStatus("idle"); return; }
    if (!HANDLE_RE.test(value)) { setUsernameStatus("invalid"); return; }
    if (value.toLowerCase() === username.toLowerCase()) { setUsernameStatus("available"); return; }

    setUsernameStatus("checking");
    checkTimeout.current = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailability({ data: { username: value, clerkUserId: userId! } });
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 500);
  }, [username, userId]);

  const handleUsernameChange = (val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
    setUsernameInput(clean);
    checkUsername(clean);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || !userId) return;
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; }

    setUploadingAvatar(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadAvatar({
        data: { clerkUserId: userId, fileBase64: base64, contentType: file.type },
      });
      setAvatarUrl(result.publicUrl);
    } catch (err) {
      console.error("Failed to upload avatar:", err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const tasks: Promise<any>[] = [
        updateProfile({
          data: {
            clerkUserId: userId,
            displayName: displayName.trim() || undefined,
            statusMessage: statusMessage.trim(),
          },
        }),
        updatePrivacySettings({ data: { clerkUserId: userId, hideReadReceipts } }),
      ];

      if (bioLinks.length > 0) {
        const validLinks = bioLinks.filter((l) => l.label.trim() && l.url.trim());
        if (validLinks.length > 0) {
          tasks.push(updateBioLinks({ data: { clerkUserId: userId, bioLinks: validLinks } }));
        }
      }

      await Promise.all(tasks);

      if (usernameInput && usernameInput.toLowerCase() !== username.toLowerCase() && usernameStatus === "available") {
        await claimUsername({ data: { clerkUserId: userId, username: usernameInput } });
        setUsername(usernameInput.toLowerCase());
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const defaultAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${userId || "me"}&backgroundColor=b6e3f4`;

  const usernameHint = () => {
    if (!usernameInput) return "3–30 chars, letters, numbers, underscores only";
    if (usernameStatus === "invalid") return "3–30 chars, letters, numbers, underscores only";
    if (usernameStatus === "checking") return "Checking...";
    if (usernameStatus === "taken") return "Already taken — try another";
    if (usernameStatus === "available") return "Available!";
    return "";
  };

  const hintColor = () => {
    if (usernameStatus === "available") return "text-online";
    if (usernameStatus === "taken" || usernameStatus === "invalid") return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <Link to="/me" className="rounded-full bg-secondary p-2 text-muted-foreground">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Edit Profile</h1>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-6"
          >
            <div className="relative">
              <img
                src={avatarUrl || defaultAvatar}
                alt="Avatar"
                className="h-24 w-24 rounded-full bg-muted object-cover"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 rounded-full bg-primary p-2 text-primary-foreground shadow-lg"
              >
                {uploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {/* Handle / Username */}
            <div className="rounded-2xl bg-card p-4">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Handle (@username)
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
                <AtSign size={15} className="shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  maxLength={30}
                  placeholder="yourhandle"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {usernameStatus === "checking" && (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                )}
                {usernameStatus === "available" && usernameInput && (
                  <Check size={14} className="text-online" />
                )}
                {(usernameStatus === "taken" || usernameStatus === "invalid") && usernameInput && (
                  <X size={14} className="text-destructive" />
                )}
              </div>
              {usernameInput && (
                <p className={`mt-1.5 text-xs ${hintColor()}`}>{usernameHint()}</p>
              )}
              {!usernameInput && (
                <p className="mt-1.5 text-xs text-muted-foreground">{usernameHint()}</p>
              )}
            </div>

            <div className="rounded-2xl bg-card p-4">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                placeholder="Your name"
                className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>

            <div className="rounded-2xl bg-card p-4">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Status Message</label>
              <textarea
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Hey there! I'm using ChatApp"
                className="w-full resize-none rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{statusMessage.length}/500</p>
            </div>

            {/* Privacy Settings — available to all */}
            <div className="rounded-2xl bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Eye size={15} className="text-primary" />
                <label className="text-xs font-semibold text-foreground">Privacy Settings</label>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">Hide read receipts</p>
                  <p className="text-xs text-muted-foreground">Others won't see when you've read their messages</p>
                </div>
                <button
                  onClick={() => setHideReadReceipts(!hideReadReceipts)}
                  className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${hideReadReceipts ? "bg-primary" : "bg-secondary"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${hideReadReceipts ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>

            {/* Link in Bio — available to all */}
            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <LinkIcon size={15} className="text-primary" />
                  <label className="text-xs font-semibold text-foreground">Link in Bio</label>
                  <span className="text-xs text-muted-foreground">({bioLinks.length}/5)</span>
                </div>
                {bioLinks.length < 5 && (
                  <button onClick={() => setBioLinks([...bioLinks, { label: "", url: "" }])} className="rounded-full bg-primary/10 p-1 text-primary">
                    <Plus size={14} />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {bioLinks.map((link, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        placeholder="Label (e.g. My Website)"
                        value={link.label}
                        onChange={(e) => setBioLinks(bioLinks.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                        className="w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={link.url}
                        onChange={(e) => setBioLinks(bioLinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                        className="w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />
                    </div>
                    <button onClick={() => setBioLinks(bioLinks.filter((_, j) => j !== i))} className="mt-2 p-1.5 text-destructive hover:bg-destructive/10 rounded-lg">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {bioLinks.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">No links added yet. Links appear on your public profile.</p>
                )}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || (!!usernameInput && usernameStatus === "taken") || (!!usernameInput && usernameStatus === "invalid")}
              className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="mx-auto animate-spin" /> : saved ? "Saved ✓" : "Save Changes"}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
