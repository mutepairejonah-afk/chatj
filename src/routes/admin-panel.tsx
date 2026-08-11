import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-start";
import { ArrowLeft, Shield, ShieldAlert, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { getIsAdmin } from "@/lib/api.functions";
import { AdminPaymentsView } from "@/admin-dashboard/AdminPaymentsView";

export const Route = createFileRoute("/admin-panel")({
  component: AdminPanelPage,
  head: () => ({
    meta: [{ title: "Admin Dashboard" }],
  }),
});

function AdminPanelPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Server-side admin check — the getIsAdmin function verifies against Supabase
  useEffect(() => {
    if (!userId) { setChecking(false); return; }
    getIsAdmin({ data: { clerkUserId: userId } })
      .then(({ isAdmin: flag }) => setIsAdmin(flag))
      .catch(() => setIsAdmin(false))
      .finally(() => setChecking(false));
  }, [userId]);

  if (!userId || checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── 403 Forbidden ───────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center bg-background">
        <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert size={40} className="text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">403 — Access Denied</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            You do not have admin privileges. If you believe this is an error, contact the system administrator.
          </p>
        </div>
        <div className="rounded-2xl bg-secondary px-4 py-3 text-xs text-muted-foreground font-mono text-left max-w-xs w-full">
          <p className="font-semibold text-foreground mb-1">To grant admin access (SQL):</p>
          <p className="break-all">UPDATE public.profiles SET is_admin = true WHERE clerk_user_id = '{userId}';</p>
        </div>
        <button
          onClick={() => navigate({ to: "/" })}
          className="rounded-2xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Go Home
        </button>
      </div>
    );
  }

  // ─── Admin Dashboard ─────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <button onClick={() => navigate({ to: "/" })} className="p-2 -ml-2 text-muted-foreground">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Shield size={18} className="text-primary shrink-0" />
          <div>
            <h1 className="font-semibold text-foreground leading-tight">Admin Dashboard</h1>
            <p className="text-[11px] text-muted-foreground">EcoCash Payment Verification</p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          Admin
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-2xl p-4 pb-12"
        >
          <AdminPaymentsView clerkUserId={userId} />
        </motion.div>
      </div>
    </div>
  );
}
