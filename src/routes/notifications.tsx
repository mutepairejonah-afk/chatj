import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-start";
import { ArrowLeft, Bell, Check, X, Clock, UserPlus, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import {
  getPendingRequests,
  getOutgoingRequests,
  acceptContactRequest,
  rejectContactRequest,
} from "@/lib/api.functions";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "Notifications — ChatApp" },
      { name: "description", content: "Friend requests and updates" },
    ],
  }),
});

type Profile = {
  clerk_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  status_message: string | null;
  username: string | null;
};

type RequestRow = {
  id: string;
  contact_clerk_id: string;
  created_at: string;
  profile: Profile | null;
};

const avatarFor = (p: Pick<Profile, "avatar_url" | "clerk_user_id">) =>
  p.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${p.clerk_user_id}`;

function NotificationsPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [incoming, setIncoming] = useState<RequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [inc, out] = await Promise.all([
        getPendingRequests({ data: { clerkUserId: userId } }),
        getOutgoingRequests({ data: { clerkUserId: userId } }),
      ]);
      setIncoming(inc as RequestRow[]);
      setOutgoing(out as RequestRow[]);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAccept = async (requesterId: string) => {
    if (!userId || actingOn) return;
    setActingOn(requesterId);
    try {
      await acceptContactRequest({ data: { clerkUserId: userId, requesterClerkId: requesterId } });
      setIncoming((prev) => prev.filter((r) => r.contact_clerk_id !== requesterId));
    } catch (err) {
      console.error("Failed to accept:", err);
    } finally {
      setActingOn(null);
    }
  };

  const handleReject = async (requesterId: string) => {
    if (!userId || actingOn) return;
    setActingOn(requesterId);
    try {
      await rejectContactRequest({ data: { clerkUserId: userId, requesterClerkId: requesterId } });
      setIncoming((prev) => prev.filter((r) => r.contact_clerk_id !== requesterId));
    } catch (err) {
      console.error("Failed to reject:", err);
    } finally {
      setActingOn(null);
    }
  };

  const handleCancelOutgoing = async (targetId: string) => {
    if (!userId || actingOn) return;
    setActingOn(targetId);
    try {
      await rejectContactRequest({ data: { clerkUserId: userId, requesterClerkId: targetId } });
      setOutgoing((prev) => prev.filter((r) => r.contact_clerk_id !== targetId));
    } catch (err) {
      console.error("Failed to cancel:", err);
    } finally {
      setActingOn(null);
    }
  };

  const list = tab === "incoming" ? incoming : outgoing;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <Link to="/me" className="rounded-full bg-secondary p-2 text-muted-foreground">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Notifications</h1>
      </header>

      <div className="px-4 pb-3">
        <div className="flex rounded-2xl bg-card p-1">
          <button
            onClick={() => setTab("incoming")}
            className={`relative flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
              tab === "incoming" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Requests
            {incoming.length > 0 && tab !== "incoming" && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {incoming.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("outgoing")}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
              tab === "outgoing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Sent
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Bell size={40} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {tab === "incoming" ? "No pending requests" : "No outgoing requests"}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-2">
              {list.map((r) => {
                const p = r.profile;
                if (!p) return null;
                const acting = actingOn === r.contact_clerk_id;
                return (
                  <motion.div
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="flex items-center gap-3 rounded-2xl bg-card p-3"
                  >
                    <button
                      onClick={() => p.username && navigate({ to: "/u/$handle", params: { handle: p.username } })}
                      className="shrink-0"
                    >
                      <img src={avatarFor(p)} alt="" className="h-12 w-12 rounded-full bg-muted" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{p.display_name || "User"}</p>
                      {p.username && <p className="text-xs text-primary truncate">@{p.username}</p>}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {tab === "incoming" ? "Wants to add you as a contact" : "Request sent"}
                      </p>
                    </div>
                    {tab === "incoming" ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => handleReject(r.contact_clerk_id)}
                          disabled={acting}
                          className="rounded-full bg-secondary p-2 text-muted-foreground disabled:opacity-50"
                          title="Decline"
                        >
                          <X size={16} />
                        </button>
                        <button
                          onClick={() => handleAccept(r.contact_clerk_id)}
                          disabled={acting}
                          className="flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          {acting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          Accept
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                          <Clock size={11} /> Pending
                        </span>
                        <button
                          onClick={() => handleCancelOutgoing(r.contact_clerk_id)}
                          disabled={acting}
                          className="rounded-full bg-secondary p-2 text-muted-foreground disabled:opacity-50"
                          title="Cancel request"
                        >
                          {acting ? <Loader2 size={14} className="animate-spin" /> : <X size={16} />}
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}

        {!loading && tab === "incoming" && incoming.length === 0 && (
          <div className="mx-auto mt-2 max-w-xs rounded-2xl bg-card p-4 text-center">
            <UserPlus size={20} className="mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              When someone scans your QR code or adds you by handle, their request will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
