import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/tanstack-start";
import { Loader2, Users, ArrowLeft, Check } from "lucide-react";
import { lookupInvite, joinGroupByInvite } from "@/lib/api.functions";

export const Route = createFileRoute("/join/$code")({
  component: JoinGroupPage,
  head: () => ({ meta: [{ title: "Join group — ChatApp" }] }),
});

function JoinGroupPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { userId, isSignedIn, isLoaded } = useAuth();

  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await lookupInvite({ data: { code } });
        if (!res) setError("Invite link is invalid or expired.");
        else setInfo(res);
      } catch (e: any) {
        setError(e.message || "Failed to look up invite");
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  const handleJoin = async () => {
    if (!userId) {
      navigate({ to: "/login" });
      return;
    }
    setJoining(true);
    try {
      const r = await joinGroupByInvite({ data: { clerkUserId: userId, code } });
      navigate({ to: "/chat/$id", params: { id: r.conversationId } });
    } catch (e: any) {
      setError(e.message || "Failed to join group");
      setJoining(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 pb-2 pt-[max(env(safe-area-inset-top),8px)]">
        <button onClick={() => navigate({ to: "/" })} className="p-1 text-primary">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[15px] font-semibold text-foreground flex-1">Group invite</h1>
      </header>

      <div className="flex-1 flex items-center justify-center px-6">
        {loading || !isLoaded ? (
          <Loader2 size={28} className="animate-spin text-primary" />
        ) : error ? (
          <div className="text-center max-w-sm">
            <p className="text-foreground mb-2">{error}</p>
            <button onClick={() => navigate({ to: "/" })} className="text-primary text-sm">Go home</button>
          </div>
        ) : info ? (
          <div className="text-center max-w-sm w-full">
            <div className="size-24 mx-auto rounded-full bg-secondary flex items-center justify-center overflow-hidden mb-4 border-2 border-border">
              {info.avatar_url ? (
                <img src={info.avatar_url} className="h-full w-full object-cover" />
              ) : (
                <Users size={36} className="text-muted-foreground" />
              )}
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-1">{info.name}</h2>
            {info.description && (
              <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap">{info.description}</p>
            )}
            <p className="text-xs text-muted-foreground mb-6">{info.memberCount} member{info.memberCount !== 1 ? "s" : ""}</p>

            {!isSignedIn ? (
              <button
                onClick={() => navigate({ to: "/login" })}
                className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-medium"
              >
                Sign in to join
              </button>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {joining ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {joining ? "Joining…" : "Join group"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
