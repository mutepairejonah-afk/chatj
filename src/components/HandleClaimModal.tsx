import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { AtSign, Loader2, Check, X, Sparkles } from "lucide-react";
import { checkUsernameAvailability, claimUsername } from "@/lib/api.functions";

const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/;

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

export function HandleClaimModal({
  clerkUserId,
  onClaimed,
}: {
  clerkUserId: string;
  onClaimed: (handle: string) => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(
    (next: string) => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
      if (!next) {
        setStatus("idle");
        return;
      }
      if (!HANDLE_RE.test(next)) {
        setStatus("invalid");
        return;
      }
      setStatus("checking");
      checkTimer.current = setTimeout(async () => {
        try {
          const r = await checkUsernameAvailability({
            data: { username: next, clerkUserId },
          });
          setStatus(r.available ? "available" : "taken");
        } catch {
          setStatus("idle");
        }
      }, 400);
    },
    [clerkUserId]
  );

  const onChange = (raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
    setValue(cleaned);
    setError(null);
    check(cleaned);
  };

  const submit = async () => {
    if (status !== "available" || saving) return;
    setSaving(true);
    setError(null);
    try {
      await claimUsername({ data: { clerkUserId, username: value } });
      onClaimed(value.toLowerCase());
    } catch (e: any) {
      setError(e?.message || "Failed to claim handle");
    } finally {
      setSaving(false);
    }
  };

  const hint = () => {
    if (status === "invalid") return "3–30 chars, letters / numbers / underscores only";
    if (status === "checking") return "Checking…";
    if (status === "taken") return "Already taken — try another";
    if (status === "available") return "Available!";
    return "3–30 chars, letters / numbers / underscores only";
  };

  const hintColor =
    status === "available"
      ? "text-online"
      : status === "taken" || status === "invalid"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 320 }}
        className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl"
      >
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-primary/15 p-3">
            <Sparkles size={24} className="text-primary" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">Claim your @handle</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Pick a unique handle so friends can find and add you. You can change it later.
          </p>
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-3">
            <AtSign size={16} className="shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={30}
              autoFocus
              placeholder="yourhandle"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            {status === "checking" && (
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            )}
            {status === "available" && value && <Check size={14} className="text-online" />}
            {(status === "taken" || status === "invalid") && value && (
              <X size={14} className="text-destructive" />
            )}
          </div>
          <p className={`mt-2 text-xs ${hintColor}`}>{hint()}</p>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>

        <button
          onClick={submit}
          disabled={status !== "available" || saving}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : "Claim handle"}
        </button>
      </motion.div>
    </div>
  );
}
