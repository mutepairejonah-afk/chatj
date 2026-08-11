import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, ShieldOff, Loader2 } from "lucide-react";
import { getBlockedUsers, unblockUser } from "@/lib/api-client";

export const Route = createFileRoute("/blocked")({
  component: BlockedPage,
  head: () => ({ meta: [{ title: "Blocked — ChatApp" }] }),
});

function BlockedPage() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    try {
      const r = await getBlockedUsers({ data: { clerkUserId: userId } });
      setItems(r);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [userId]);

  const handleUnblock = async (target: string) => {
    if (!userId) return;
    setBusy(target);
    try {
      await unblockUser({ data: { clerkUserId: userId, targetClerkId: target } });
      await load();
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally { setBusy(null); }
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 pb-2 pt-[max(env(safe-area-inset-top),8px)]">
        <button onClick={() => navigate({ to: "/me" })} className="p-1 text-primary">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[15px] font-semibold text-foreground flex-1">Blocked users</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <ShieldOff size={36} className="text-muted-foreground mb-2" />
            <p className="text-foreground">No blocked users</p>
            <p className="text-xs text-muted-foreground mt-1">When you block someone, they appear here.</p>
          </div>
        ) : (
          items.map((it: any) => (
            <div key={it.blocked_clerk_id} className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="size-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {it.profile?.avatar_url ? (
                    <img src={it.profile.avatar_url} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">{(it.profile?.display_name || "U")[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{it.profile?.display_name || "User"}</p>
                  {it.profile?.username && <p className="text-xs text-muted-foreground truncate">@{it.profile.username}</p>}
                </div>
              </div>
              <button
                onClick={() => handleUnblock(it.blocked_clerk_id)}
                disabled={busy === it.blocked_clerk_id}
                className="rounded-full bg-secondary text-foreground px-3 py-1 text-xs font-medium disabled:opacity-50"
              >
                {busy === it.blocked_clerk_id ? "..." : "Unblock"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
