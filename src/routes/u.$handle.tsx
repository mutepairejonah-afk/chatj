import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-start";
import { ArrowLeft, MessageCircle, UserPlus, Loader2, Check, Clock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  getProfileByUsername,
  isContact,
  addContact,
  getOrCreateDirectConversation,
} from "@/lib/api.functions";

export const Route = createFileRoute("/u/$handle")({
  component: PublicProfilePage,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} — ChatApp` },
      { name: "description", content: `View @${params.handle}'s profile on ChatApp` },
    ],
  }),
});

type Profile = {
  clerk_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  status_message: string | null;
  username: string | null;
  is_online: boolean | null;
};

type RelationStatus = "none" | "accepted" | "pending_outgoing" | "pending_incoming";

function PublicProfilePage() {
  const { handle } = Route.useParams();
  const { userId, isLoaded } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<RelationStatus>("none");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      try {
        const p = await getProfileByUsername({ data: { username: handle } });
        if (cancelled) return;
        if (!p) {
          setNotFound(true);
          return;
        }
        setProfile(p as Profile);
        if (userId && (p as Profile).clerk_user_id !== userId) {
          const r = await isContact({
            data: { clerkUserId: userId, contactClerkId: (p as Profile).clerk_user_id },
          });
          if (!cancelled) setStatus(r.status);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [handle, userId, isLoaded]);

  const isMe = profile && userId && profile.clerk_user_id === userId;

  const handleAdd = async () => {
    if (!userId || !profile || acting) return;
    setActing(true);
    try {
      const res = await addContact({
        data: { clerkUserId: userId, contactClerkId: profile.clerk_user_id },
      });
      setStatus(res.status as RelationStatus);
    } catch (err) {
      console.error("Failed to send request:", err);
    } finally {
      setActing(false);
    }
  };

  const handleMessage = async () => {
    if (!userId || !profile || acting) return;
    setActing(true);
    try {
      const conv = await getOrCreateDirectConversation({
        data: { clerkUserId: userId, otherClerkId: profile.clerk_user_id },
      });
      navigate({ to: "/chat/$id", params: { id: conv.id } });
    } catch (err) {
      console.error("Failed to open chat:", err);
      setActing(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <Link to="/contacts" className="rounded-full bg-secondary p-2 text-muted-foreground">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground truncate">@{handle}</h1>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : notFound || !profile ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <AlertCircle size={40} className="text-muted-foreground/40" />
          <p className="text-base font-semibold text-foreground">User not found</p>
          <p className="text-sm text-muted-foreground">
            No one with the handle <span className="font-mono">@{handle}</span> on ChatApp.
          </p>
          <Link
            to="/contacts"
            className="mt-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Back to Contacts
          </Link>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-1 flex-col items-center px-4 pt-4"
        >
          <div className="relative">
            <img
              src={profile.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${profile.clerk_user_id}`}
              alt=""
              className="h-28 w-28 rounded-full bg-muted object-cover"
            />
            {profile.is_online && (
              <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-background bg-online" />
            )}
          </div>
          <h2 className="mt-4 text-2xl font-bold text-foreground">{profile.display_name || "User"}</h2>
          {profile.username && (
            <p className="mt-0.5 text-sm font-medium text-primary">@{profile.username}</p>
          )}
          <p className="mt-3 max-w-xs text-center text-sm text-muted-foreground">
            {profile.status_message || "Hey there! I'm using ChatApp"}
          </p>

          <div className="mt-8 w-full max-w-sm space-y-2">
            {isMe ? (
              <Link
                to="/edit-profile"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                Edit Profile
              </Link>
            ) : (
              <>
                {status === "accepted" && (
                  <button
                    onClick={handleMessage}
                    disabled={acting}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {acting ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                    Send Message
                  </button>
                )}
                {status === "none" && (
                  <button
                    onClick={handleAdd}
                    disabled={acting}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {acting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    Add to Contacts
                  </button>
                )}
                {status === "pending_outgoing" && (
                  <button
                    disabled
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-medium text-muted-foreground"
                  >
                    <Clock size={16} /> Request Sent
                  </button>
                )}
                {status === "pending_incoming" && (
                  <button
                    onClick={handleAdd}
                    disabled={acting}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-online py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {acting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Accept Request
                  </button>
                )}
                {status !== "accepted" && (
                  <p className="px-2 pt-1 text-center text-xs text-muted-foreground">
                    {status === "pending_outgoing"
                      ? "You can chat once they accept your request."
                      : status === "pending_incoming"
                        ? "Accept their request to start chatting."
                        : "Add as contact to start chatting."}
                  </p>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
