import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@clerk/tanstack-start";
import { motion, AnimatePresence } from "framer-motion";
import { ProfilePreview } from "@/components/ProfilePreview";
import {
  ArrowLeft, Camera, Pencil, Check, X, UserPlus, UserMinus, Crown,
  LogOut, Link2, RotateCw, Copy, Bell, BellOff, Lock, Clock, Image as ImageIcon,
  Loader2, ShieldCheck, AlertTriangle, Search,
} from "lucide-react";
import {
  getGroupInfo,
  updateGroupInfo,
  updateGroupPermissions,
  setGroupMemberRole,
  generateInviteCode,
  uploadGroupAvatar,
  setConversationMute,
  getAllProfiles,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  getConversationMedia,
  reportTarget,
} from "@/lib/api.functions";

export const Route = createFileRoute("/group/$id")({
  component: GroupInfoPage,
  head: () => ({ meta: [{ title: "Group info — ChatApp" }] }),
});

const DISAPPEARING_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "24 hours", value: 60 * 60 * 24 },
  { label: "7 days", value: 60 * 60 * 24 * 7 },
  { label: "90 days", value: 60 * 60 * 24 * 90 },
];

const MUTE_OPTIONS = [
  { label: "8 hours", value: 60 * 60 * 8 },
  { label: "1 week", value: 60 * 60 * 24 * 7 },
  { label: "Always", value: 0 }, // 0 means forever (10y)
  { label: "Unmute", value: null as number | null },
];

function GroupInfoPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMute, setShowMute] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState("");
  const [media, setMedia] = useState<any[]>([]);
  const [previewMember, setPreviewMember] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = info?.myRole === "admin";

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [g, profs, m] = await Promise.all([
        getGroupInfo({ data: { clerkUserId: userId, conversationId: id } }),
        getAllProfiles({ data: { clerkUserId: userId } }),
        getConversationMedia({ data: { conversationId: id } }),
      ]);
      setInfo(g);
      setNameDraft(g?.name || "");
      setDescDraft(g?.description || "");
      setAllProfiles(profs);
      setMedia(m);
    } catch (err) {
      console.error("Failed to load group info:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, id]);

  useEffect(() => { load(); }, [load]);

  const saveName = async () => {
    if (!userId || !nameDraft.trim()) return;
    setSaving(true);
    try {
      await updateGroupInfo({ data: { clerkUserId: userId, conversationId: id, name: nameDraft.trim() } });
      setEditingName(false);
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  const saveDesc = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await updateGroupInfo({ data: { clerkUserId: userId, conversationId: id, description: descDraft.trim() || null } });
      setEditingDesc(false);
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) { alert("Pick an image"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; }
    setSaving(true);
    try {
      const reader = new FileReader();
      const b64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await uploadGroupAvatar({
        data: { clerkUserId: userId, conversationId: id, fileBase64: b64, contentType: file.type },
      });
      load();
    } catch (err: any) { alert(err.message || "Upload failed"); }
    finally { setSaving(false); if (e.target) e.target.value = ""; }
  };

  const togglePermission = async (key: "only_admins_send" | "only_admins_edit", value: boolean) => {
    if (!userId) return;
    setSaving(true);
    try {
      await updateGroupPermissions({
        data: {
          clerkUserId: userId,
          conversationId: id,
          ...(key === "only_admins_send" ? { onlyAdminsSend: value } : { onlyAdminsEdit: value }),
        },
      });
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  const setDisappearing = async (seconds: number) => {
    if (!userId) return;
    setSaving(true);
    try {
      await updateGroupPermissions({
        data: { clerkUserId: userId, conversationId: id, disappearingSeconds: seconds || null },
      });
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  const toggleAdmin = async (memberClerkId: string, makeAdmin: boolean) => {
    if (!userId) return;
    try {
      await setGroupMemberRole({ data: { clerkUserId: userId, conversationId: id, memberClerkId, role: makeAdmin ? "admin" : "member" } });
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
  };

  const handleAddMember = async (clerkId: string) => {
    if (!userId) return;
    try {
      await addGroupMember({ data: { clerkUserId: userId, conversationId: id, memberClerkId: clerkId } });
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
  };

  const handleRemoveMember = async (clerkId: string) => {
    if (!userId) return;
    if (!confirm("Remove this member from the group?")) return;
    try {
      await removeGroupMember({ data: { clerkUserId: userId, conversationId: id, memberClerkId: clerkId } });
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
  };

  const handleLeave = async () => {
    if (!userId) return;
    if (!confirm("Leave this group?")) return;
    try {
      await leaveGroup({ data: { clerkUserId: userId, conversationId: id } });
      navigate({ to: "/" });
    } catch (e: any) { alert(e.message || "Failed"); }
  };

  const generateInvite = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const r = await generateInviteCode({ data: { clerkUserId: userId, conversationId: id } });
      setInfo((prev: any) => ({ ...prev, invite_code: r.code }));
    } catch (e: any) { alert(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  const handleMute = async (seconds: number | null) => {
    if (!userId) return;
    try {
      await setConversationMute({ data: { clerkUserId: userId, conversationId: id, muteSeconds: seconds } });
      setShowMute(false);
      load();
    } catch (e: any) { alert(e.message || "Failed"); }
  };

  const submitReport = async () => {
    if (!userId || !reportText.trim()) return;
    try {
      await reportTarget({ data: { clerkUserId: userId, targetType: "group", targetId: id, reason: reportText.trim() } });
      setShowReport(false);
      setReportText("");
      alert("Report submitted. Thanks for letting us know.");
    } catch (e: any) { alert(e.message || "Failed"); }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        Group not found
      </div>
    );
  }

  const inviteUrl = info.invite_code ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${info.invite_code}` : "";
  const muteActive = info.myMuteUntil && new Date(info.myMuteUntil).getTime() > Date.now();

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 pb-2 pt-[max(env(safe-area-inset-top),8px)]">
        <button onClick={() => navigate({ to: "/chat/$id", params: { id } })} className="p-1 text-primary">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[15px] font-semibold text-foreground flex-1">Group info</h1>
        {saving && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
      </header>

      <div className="flex-1 overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2 py-6 bg-surface border-b border-border">
          <label className="relative cursor-pointer">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
            <div className="size-28 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-border">
              {info.avatar_url ? (
                <img src={info.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-muted-foreground">{(info.name || "G")[0]?.toUpperCase()}</span>
              )}
            </div>
            <span className="absolute bottom-0 right-0 rounded-full bg-primary p-2 text-primary-foreground border-2 border-surface">
              <Camera size={14} />
            </span>
          </label>

          {editingName ? (
            <div className="flex items-center gap-2 mt-2 w-full max-w-xs px-3">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={100}
                className="flex-1 rounded-xl bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                autoFocus
              />
              <button onClick={saveName} className="p-2 bg-primary text-primary-foreground rounded-full"><Check size={16} /></button>
              <button onClick={() => { setEditingName(false); setNameDraft(info.name || ""); }} className="p-2 text-muted-foreground"><X size={16} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{info.name}</h2>
              <button onClick={() => setEditingName(true)} className="p-1 text-muted-foreground" title="Edit name"><Pencil size={14} /></button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Group · {info.members.length} member{info.members.length !== 1 ? "s" : ""}</p>
        </div>

        {/* Description */}
        <div className="bg-surface border-b border-border mt-2 px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Description</p>
            {!editingDesc && (
              <button onClick={() => setEditingDesc(true)} className="text-primary text-xs">Edit</button>
            )}
          </div>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Add a description"
                className="w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditingDesc(false); setDescDraft(info.description || ""); }} className="text-xs text-muted-foreground px-2 py-1">Cancel</button>
                <button onClick={saveDesc} className="text-xs bg-primary text-primary-foreground rounded-full px-3 py-1">Save</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {info.description || <span className="text-muted-foreground italic">No description</span>}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-surface border-b border-border mt-2 grid grid-cols-3 divide-x divide-border">
          <button onClick={() => setShowMute(true)} className="flex flex-col items-center py-3 gap-1 hover:bg-secondary/50">
            {muteActive ? <BellOff size={18} className="text-primary" /> : <Bell size={18} className="text-foreground" />}
            <span className="text-[11px]">{muteActive ? "Muted" : "Mute"}</span>
          </button>
          <button onClick={() => setShowInvite(true)} className="flex flex-col items-center py-3 gap-1 hover:bg-secondary/50">
            <Link2 size={18} className="text-foreground" />
            <span className="text-[11px]">Invite</span>
          </button>
          <button onClick={() => setShowReport(true)} className="flex flex-col items-center py-3 gap-1 hover:bg-secondary/50">
            <AlertTriangle size={18} className="text-destructive" />
            <span className="text-[11px]">Report</span>
          </button>
        </div>

        {/* Media gallery */}
        {media.length > 0 && (
          <div className="bg-surface border-b border-border mt-2 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Media, files & docs</p>
              <span className="text-xs text-muted-foreground">{media.length}</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {media.slice(0, 12).map((m: any) => (
                <div key={m.id} className="size-16 shrink-0 rounded-lg overflow-hidden bg-secondary flex items-center justify-center">
                  {m.image_url && <img src={m.image_url} className="h-full w-full object-cover" />}
                  {m.video_url && <video src={m.video_url} className="h-full w-full object-cover" />}
                  {!m.image_url && !m.video_url && <ImageIcon size={20} className="text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Permissions (admins only) */}
        {isAdmin && (
          <div className="bg-surface border-b border-border mt-2 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Group permissions</p>
            <button
              onClick={() => togglePermission("only_admins_send", !info.only_admins_send)}
              className="flex items-center justify-between w-full py-2"
            >
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-muted-foreground" />
                <span className="text-sm text-foreground">Only admins can send messages</span>
              </div>
              <div className={`h-5 w-9 rounded-full p-0.5 transition-colors ${info.only_admins_send ? "bg-primary" : "bg-secondary"}`}>
                <div className={`h-4 w-4 rounded-full bg-white transition-transform ${info.only_admins_send ? "translate-x-4" : ""}`} />
              </div>
            </button>
            <button
              onClick={() => togglePermission("only_admins_edit", !info.only_admins_edit)}
              className="flex items-center justify-between w-full py-2"
            >
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-muted-foreground" />
                <span className="text-sm text-foreground">Only admins can edit info</span>
              </div>
              <div className={`h-5 w-9 rounded-full p-0.5 transition-colors ${info.only_admins_edit ? "bg-primary" : "bg-secondary"}`}>
                <div className={`h-4 w-4 rounded-full bg-white transition-transform ${info.only_admins_edit ? "translate-x-4" : ""}`} />
              </div>
            </button>

            {/* Disappearing messages */}
            <div className="mt-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2 mb-1.5">
                <Clock size={16} className="text-muted-foreground" />
                <span className="text-sm text-foreground">Disappearing messages</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DISAPPEARING_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setDisappearing(o.value)}
                    className={`text-xs rounded-full px-3 py-1 ${
                      (info.disappearing_seconds || 0) === o.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Members */}
        <div className="bg-surface border-b border-border mt-2 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{info.members.length} Members</p>
            {isAdmin && (
              <button onClick={() => setShowAddMembers(true)} className="text-primary text-xs flex items-center gap-1">
                <UserPlus size={14} /> Add
              </button>
            )}
          </div>
          {info.members.map((m: any) => (
            <div key={m.clerk_user_id} className="flex items-center justify-between py-2">
              <button
                onClick={() => setPreviewMember(m)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="size-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">{(m.profile?.display_name || "U")[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.profile?.display_name || "User"}{m.clerk_user_id === userId ? " (You)" : ""}
                    </p>
                    {m.role === "admin" && (
                      <span className="text-[10px] bg-primary/15 text-primary rounded px-1.5 py-0.5 font-semibold">Admin</span>
                    )}
                  </div>
                  {m.profile?.status_message && (
                    <p className="text-xs text-muted-foreground truncate">{m.profile.status_message}</p>
                  )}
                </div>
              </button>
              {isAdmin && m.clerk_user_id !== userId && (
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleAdmin(m.clerk_user_id, m.role !== "admin")}
                    className="p-1.5 text-muted-foreground hover:text-primary"
                    title={m.role === "admin" ? "Demote" : "Make admin"}
                  >
                    <Crown size={14} className={m.role === "admin" ? "text-primary" : ""} />
                  </button>
                  <button
                    onClick={() => handleRemoveMember(m.clerk_user_id)}
                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded"
                    title="Remove"
                  >
                    <UserMinus size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Leave group */}
        <div className="bg-surface border-b border-border mt-2 px-4 py-3">
          <button onClick={handleLeave} className="flex items-center gap-2 w-full py-2 text-destructive">
            <LogOut size={18} /> Leave group
          </button>
        </div>
      </div>

      {/* Add members modal */}
      <AnimatePresence>
        {showAddMembers && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => setShowAddMembers(false)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-surface w-full max-w-lg rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)] max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-[15px] font-semibold text-foreground">Add members</h3>
                <button onClick={() => setShowAddMembers(false)} className="p-1 text-muted-foreground"><X size={18} /></button>
              </div>
              <div className="px-4 py-2">
                <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2">
                  <Search size={14} className="text-muted-foreground" />
                  <input
                    placeholder="Search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {allProfiles
                  .filter((p) => !info.members.some((m: any) => m.clerk_user_id === p.clerk_user_id))
                  .filter((p) => !memberSearch || (p.display_name || "").toLowerCase().includes(memberSearch.toLowerCase()))
                  .map((p) => (
                    <div key={p.clerk_user_id} className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/50">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                          {p.avatar_url ? <img src={p.avatar_url} className="h-full w-full object-cover" /> : <span className="text-sm">{(p.display_name || "U")[0]}</span>}
                        </div>
                        <span className="text-sm text-foreground">{p.display_name || "User"}</span>
                      </div>
                      <button onClick={() => handleAddMember(p.clerk_user_id)} className="p-1.5 text-primary hover:bg-primary/10 rounded">
                        <UserPlus size={16} />
                      </button>
                    </div>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute modal */}
      <AnimatePresence>
        {showMute && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => setShowMute(false)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-surface w-full max-w-lg rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-[15px] font-semibold text-foreground">Mute notifications</h3>
              </div>
              {MUTE_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  onClick={() => handleMute(o.value)}
                  className="flex items-center w-full px-4 py-3 hover:bg-secondary border-b border-border last:border-b-0 text-left text-sm text-foreground"
                >
                  {o.value === null && <BellOff size={16} className="mr-2 text-primary" />}
                  {o.label}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-sm rounded-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-semibold text-foreground">Invite via link</h3>
                <button onClick={() => setShowInvite(false)} className="p-1 text-muted-foreground"><X size={18} /></button>
              </div>
              {info.invite_code ? (
                <>
                  <div className="bg-white rounded-xl p-3 flex items-center justify-center mb-3">
                    <img
                      alt="QR code"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteUrl)}`}
                      className="size-44"
                    />
                  </div>
                  <div className="rounded-xl bg-secondary px-3 py-2 text-xs text-foreground break-all mb-3">{inviteUrl}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { navigator.clipboard?.writeText(inviteUrl); }}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium"
                    >
                      <Copy size={14} /> Copy
                    </button>
                    {isAdmin && (
                      <button
                        onClick={generateInvite}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-secondary text-foreground py-2 text-sm font-medium"
                      >
                        <RotateCw size={14} /> Reset
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">No invite link yet. {isAdmin ? "Create one to let others join." : "Ask an admin to create one."}</p>
                  {isAdmin && (
                    <button
                      onClick={generateInvite}
                      className="w-full flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium"
                    >
                      <Link2 size={14} /> Create invite link
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report modal */}
      <AnimatePresence>
        {showReport && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowReport(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-sm rounded-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={18} className="text-destructive" />
                <h3 className="text-[15px] font-semibold text-foreground">Report group</h3>
              </div>
              <textarea
                rows={4}
                placeholder="What's wrong with this group?"
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                className="w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground outline-none mb-3"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReport(false)} className="flex-1 rounded-full bg-secondary text-foreground py-2 text-sm">Cancel</button>
                <button onClick={submitReport} disabled={!reportText.trim()} className="flex-1 rounded-full bg-destructive text-destructive-foreground py-2 text-sm font-medium disabled:opacity-50">Submit</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ProfilePreview
        open={!!previewMember}
        onClose={() => setPreviewMember(null)}
        clerkUserId={previewMember?.clerk_user_id}
        initialName={previewMember?.profile?.display_name}
        initialAvatarUrl={previewMember?.profile?.avatar_url}
        initialUsername={previewMember?.profile?.username}
        initialStatus={previewMember?.profile?.status_message}
        isSelf={previewMember?.clerk_user_id === userId}
      />
    </div>
  );
}
