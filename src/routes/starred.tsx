import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Star, Loader2, Image as ImageIcon, Video as VideoIcon, FileText, Mic } from "lucide-react";
import { getStarredMessages } from "@/lib/api-client";
import { messageTime } from "@/lib/mock-data";

export const Route = createFileRoute("/starred")({
  component: StarredPage,
  head: () => ({ meta: [{ title: "Starred — ChatApp" }] }),
});

function StarredPage() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const r = await getStarredMessages({ data: { clerkUserId: userId } });
        setItems(r);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 pb-2 pt-[max(env(safe-area-inset-top),8px)]">
        <button onClick={() => navigate({ to: "/" })} className="p-1 text-primary">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[15px] font-semibold text-foreground flex-1">Starred messages</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <Star size={36} className="text-muted-foreground mb-2" />
            <p className="text-foreground">No starred messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Long-press a message and tap Star to save it here.</p>
          </div>
        ) : (
          items.map((it: any) => (
            <button
              key={it.id}
              onClick={() => navigate({ to: "/chat/$id", params: { id: it.conversation_id } })}
              className="flex items-start gap-3 w-full px-4 py-3 border-b border-border hover:bg-secondary/40 text-left"
            >
              <div className="size-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                {it.conversation?.avatar_url ? (
                  <img src={it.conversation.avatar_url} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">
                    {(it.conversation?.name || it.sender?.display_name || "U")[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <Star size={12} className="text-amber-500 fill-amber-500" />
                  <p className="text-sm font-semibold text-foreground truncate">
                    {it.conversation?.type === "group"
                      ? `${it.conversation.name} · ${it.sender?.display_name || "User"}`
                      : it.sender?.display_name || "User"}
                  </p>
                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{messageTime(new Date(it.created_at))}</span>
                </div>
                {it.image_url ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><ImageIcon size={13} /> Photo</div>
                ) : it.video_url ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><VideoIcon size={13} /> Video</div>
                ) : it.audio_url ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Mic size={13} /> Voice message</div>
                ) : it.file_url ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><FileText size={13} /> {it.file_name || "File"}</div>
                ) : (
                  <p className="text-sm text-foreground line-clamp-2">{it.text || ""}</p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
