import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Check, X, ExternalLink, Loader2, AlertCircle,
  RefreshCw, Clock, CheckCircle2, XCircle, Settings2, ChevronDown,
} from "lucide-react";
import { getAdminPayments, verifyOrder, updateEcoCashSettings, getEcoCashSettings } from "@/lib/api.functions";

interface AdminPaymentsViewProps {
  clerkUserId: string;
}

type StatusFilter = "pending" | "approved" | "rejected";

interface Payment {
  id: string;
  user_id: string;
  user_display_name: string | null;
  amount: number;
  currency: string;
  transaction_id: string;
  status: string;
  screenshot_url: string | null;
  approved_by: string | null;
  processed_at: string | null;
  rejection_reason: string | null;
  dispute_note: string | null;
  created_at: string;
}

export function AdminPaymentsView({ clerkUserId }: AdminPaymentsViewProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filtered, setFiltered] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; txId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [rate, setRate] = useState("13.5");
  const [phoneNum, setPhoneNum] = useState("0788800342");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await getAdminPayments({ data: { clerkUserId, status: statusFilter } });
      setPayments(rows);
    } catch (err: any) {
      setError(err?.message || "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }, [clerkUserId, statusFilter]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  useEffect(() => {
    getEcoCashSettings({ data: {} })
      .then((s) => { setRate(String(s.usd_to_zig_rate)); setPhoneNum(s.ecocash_number); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = search.toUpperCase().trim();
    if (!q) { setFiltered(payments); return; }
    setFiltered(payments.filter((p) =>
      p.transaction_id.includes(q) ||
      (p.user_display_name || "").toUpperCase().includes(q) ||
      p.user_id.toUpperCase().includes(q)
    ));
  }, [search, payments]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await verifyOrder({ data: { clerkUserId, paymentId: id, action: "approved" } });
      setPayments((prev) => prev.filter((p) => p.id !== id));
      showToast("success", "Payment approved ✓");
    } catch (err: any) {
      showToast("error", err?.message || "Approval failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionLoading(rejectModal.id);
    try {
      await verifyOrder({
        data: { clerkUserId, paymentId: rejectModal.id, action: "rejected", rejectionReason: rejectReason.trim() || undefined },
      });
      setPayments((prev) => prev.filter((p) => p.id !== rejectModal.id));
      setRejectModal(null);
      setRejectReason("");
      showToast("success", "Payment rejected.");
    } catch (err: any) {
      showToast("error", err?.message || "Rejection failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateEcoCashSettings({ data: { clerkUserId, usdToZigRate: parseFloat(rate), ecocashNumber: phoneNum.trim() } });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      showToast("success", "Settings saved.");
    } catch (err: any) {
      showToast("error", err?.message || "Save failed.");
    } finally {
      setSavingSettings(false);
    }
  };

  const statusIcon = { pending: <Clock size={13} className="text-amber-500" />, approved: <CheckCircle2 size={13} className="text-green-500" />, rejected: <XCircle size={13} className="text-destructive" /> };
  const statusColor = { pending: "bg-amber-500/10 text-amber-600 border-amber-500/25", approved: "bg-green-500/10 text-green-600 border-green-500/25", rejected: "bg-destructive/10 text-destructive border-destructive/25" };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by Transaction ID or user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl bg-secondary pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <button
          onClick={loadPayments}
          className="rounded-2xl bg-secondary p-2.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`rounded-2xl p-2.5 transition-colors ${showSettings ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          title="EcoCash settings"
        >
          <Settings2 size={16} />
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-2xl bg-secondary p-1">
        {(["pending", "approved", "rejected"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium capitalize transition-all ${statusFilter === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {statusIcon[s]} {s}
          </button>
        ))}
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">EcoCash Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">USD → ZiG Rate</label>
                  <input
                    type="number" step="0.001" min="0.001" value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full rounded-xl bg-secondary px-3 py-2 text-sm font-mono text-foreground outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">EcoCash Number</label>
                  <input
                    type="text" value={phoneNum}
                    onChange={(e) => setPhoneNum(e.target.value)}
                    className="w-full rounded-xl bg-secondary px-3 py-2 text-sm font-mono text-foreground outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveSettings} disabled={savingSettings}
                className="w-full rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {savingSettings ? <Loader2 size={13} className="mx-auto animate-spin" /> : settingsSaved ? "Saved ✓" : "Save Settings"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats bar */}
      <div className="rounded-2xl bg-card border border-border px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
          {statusFilter} payment{filtered.length !== 1 ? "s" : ""}
        </span>
        {search && (
          <button onClick={() => setSearch("")} className="text-xs text-primary">Clear filter</button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 border border-destructive/25 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 size={36} className="text-muted-foreground mb-3 opacity-40" />
          <p className="text-sm font-medium text-muted-foreground">No {statusFilter} payments</p>
          {search && <p className="text-xs text-muted-foreground mt-1">Try clearing the search filter</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((payment) => (
              <motion.div
                key={payment.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl bg-card border border-border p-4 space-y-3"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {payment.user_display_name || "Anonymous User"}
                      </p>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColor[payment.status as StatusFilter]}`}>
                        {statusIcon[payment.status as StatusFilter]}
                        {payment.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                      {payment.user_id}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-foreground text-base">
                      {payment.currency === "USD" ? "$" : "ZiG "}{payment.amount.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{payment.currency}</p>
                  </div>
                </div>

                {/* Transaction ID */}
                <div className="rounded-xl bg-secondary px-3 py-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">EcoCash Transaction ID</p>
                  <p className="font-mono text-sm font-bold text-foreground tracking-wider select-all">
                    {payment.transaction_id}
                  </p>
                </div>

                {/* Details row */}
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                  <span>{new Date(payment.created_at).toLocaleString()}</span>
                  {payment.screenshot_url && (
                    <a
                      href={payment.screenshot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink size={11} /> View Screenshot
                    </a>
                  )}
                  {payment.dispute_note && (
                    <span className="text-amber-600">⚠ Dispute: {payment.dispute_note}</span>
                  )}
                  {payment.rejection_reason && (
                    <span className="text-destructive">Reason: {payment.rejection_reason}</span>
                  )}
                </div>

                {/* Action buttons — only for pending */}
                {payment.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(payment.id)}
                      disabled={actionLoading === payment.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-500/15 py-2.5 text-sm font-semibold text-green-600 hover:bg-green-500/25 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === payment.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectModal({ id: payment.id, txId: payment.transaction_id })}
                      disabled={actionLoading === payment.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive/10 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
                    >
                      <X size={14} />
                      Reject
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Reject Modal */}
      <AnimatePresence>
        {rejectModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black"
              onClick={() => { setRejectModal(null); setRejectReason(""); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card border border-border p-5 shadow-2xl"
            >
              <h3 className="font-semibold text-foreground mb-1">Reject Payment?</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Transaction: <span className="font-mono font-bold text-foreground">{rejectModal.txId}</span>
              </p>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional: reason for rejection (shown to user)…"
                maxLength={500}
                className="w-full resize-none rounded-2xl bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setRejectModal(null); setRejectReason(""); }}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Reject
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              toastMsg.type === "success" ? "bg-green-500 text-white" : "bg-destructive text-destructive-foreground"
            }`}
          >
            {toastMsg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
