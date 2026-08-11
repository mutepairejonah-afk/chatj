import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Copy, Check, Upload, X, Loader2, AlertCircle,
  ExternalLink, ChevronDown, CheckCircle2, MessageSquare,
} from "lucide-react";
import { getEcoCashSettings, submitPayment, uploadPaymentScreenshot } from "@/lib/api.functions";

interface CheckoutViewProps {
  initialAmount?: number;
  initialCurrency?: "USD" | "ZiG";
  description?: string;
  onSuccess?: (paymentId: string) => void;
}

type Currency = "USD" | "ZiG";
type Stage = "form" | "submitting" | "success" | "dispute";

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["image/jpeg", "image/png"] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CheckoutView({ initialAmount, initialCurrency = "USD", description = "ChatApp Premium", onSuccess }: CheckoutViewProps) {
  const [settings, setSettings] = useState({ usd_to_zig_rate: 13.5, ecocash_number: "0788800342" });
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [customAmount, setCustomAmount] = useState(initialAmount ? String(initialAmount) : "");
  const [txId, setTxId] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotError, setScreenshotError] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState("");
  const [copiedField, setCopiedField] = useState<"phone" | "amount" | null>(null);
  const [showCurrencyDrop, setShowCurrencyDrop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const clerkUserId = (window as any).__clerk_user_id as string | undefined;

  useEffect(() => {
    getEcoCashSettings({ data: {} })
      .then(setSettings)
      .catch(() => {});
  }, []);

  const parsedAmount: number | null = (() => {
    const n = parseFloat(customAmount);
    return isNaN(n) || n <= 0 ? null : n;
  })();

  const displayAmount: number | null = parsedAmount
    ? currency === "ZiG"
      ? parseFloat((parsedAmount * settings.usd_to_zig_rate).toFixed(2))
      : parsedAmount
    : null;

  const displayAmountStr = displayAmount !== null
    ? `${currency === "USD" ? "$" : "ZiG "}${displayAmount.toFixed(2)}`
    : "—";

  const copy = useCallback((field: "phone" | "amount") => {
    const text = field === "phone" ? settings.ecocash_number : displayAmount ? String(displayAmount) : "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, [settings.ecocash_number, displayAmount]);

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScreenshotError("");
    const file = e.target.files?.[0];
    if (!file) { setScreenshot(null); return; }
    if (!ALLOWED_MIME.includes(file.type as any)) {
      setScreenshotError("Only JPEG or PNG images are accepted.");
      if (e.target) e.target.value = "";
      return;
    }
    if (file.size > MAX_SCREENSHOT_SIZE) {
      setScreenshotError("Screenshot must be under 5 MB.");
      if (e.target) e.target.value = "";
      return;
    }
    setScreenshot(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clerkUserId) { setError("You must be signed in to submit a payment."); return; }
    if (!parsedAmount) { setError("Please enter a valid amount."); return; }
    if (txId.trim().length < 3) { setError("Please enter a valid EcoCash Transaction ID."); return; }

    setError("");
    setStage("submitting");

    try {
      let screenshotUrl: string | undefined;
      if (screenshot) {
        const base64 = await fileToBase64(screenshot);
        const { url } = await uploadPaymentScreenshot({
          data: {
            clerkUserId,
            fileBase64: base64,
            mimeType: screenshot.type as "image/jpeg" | "image/png",
            fileName: screenshot.name,
          },
        });
        screenshotUrl = url;
      }

      const amountInUSD = currency === "ZiG"
        ? parseFloat((parsedAmount / settings.usd_to_zig_rate).toFixed(6))
        : parsedAmount;

      const payment = await submitPayment({
        data: {
          clerkUserId,
          amount: amountInUSD,
          currency,
          transactionId: txId.toUpperCase().trim(),
          screenshotUrl,
          disputeNote: disputeNote.trim() || undefined,
        },
      });

      setSuccessId(payment.id);
      setStage("success");
      onSuccess?.(payment.id);
    } catch (err: any) {
      setError(err?.message || "Submission failed. Please try again.");
      setStage("form");
    }
  };

  if (stage === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center gap-6 py-12 px-4 text-center"
      >
        <div className="h-20 w-20 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-green-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Payment Submitted!</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your proof of payment has been received. An admin will verify your transaction shortly — usually within a few minutes.
          </p>
        </div>
        <div className="rounded-2xl bg-secondary px-4 py-3 text-xs text-muted-foreground font-mono break-all">
          Ref: {successId}
        </div>
        <p className="text-xs text-muted-foreground">
          Once approved you'll receive access automatically. If you experience issues,{" "}
          <button onClick={() => setStage("dispute")} className="text-primary underline underline-offset-2">
            report a dispute
          </button>.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Currency Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowCurrencyDrop(!showCurrencyDrop)}
          className="flex w-full items-center justify-between rounded-2xl bg-card border border-border px-4 py-3 text-sm font-medium text-foreground"
        >
          <span>Currency: <span className="text-primary font-semibold">{currency}</span></span>
          <ChevronDown size={16} className={`text-muted-foreground transition-transform ${showCurrencyDrop ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {showCurrencyDrop && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 right-0 top-full mt-1 z-10 rounded-2xl bg-card border border-border shadow-lg overflow-hidden"
            >
              {(["USD", "ZiG"] as Currency[]).map((c) => (
                <button
                  key={c} type="button"
                  onClick={() => { setCurrency(c); setShowCurrencyDrop(false); }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-sm ${currency === c ? "text-primary font-semibold" : "text-foreground"} hover:bg-secondary`}
                >
                  {currency === c && <Check size={14} />}
                  {c === "USD" ? "🇺🇸 USD (US Dollar)" : "🇿🇼 ZiG (Zimbabwe Gold)"}
                </button>
              ))}
              {currency === "ZiG" && (
                <p className="px-4 pb-3 text-[11px] text-muted-foreground">
                  Rate: 1 USD = {settings.usd_to_zig_rate} ZiG
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Amount Input (shown only if no initialAmount) */}
      {initialAmount === undefined && (
        <div className="rounded-2xl bg-card border border-border px-4 py-3">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount ({currency})</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder={currency === "USD" ? "e.g. 9.99" : "e.g. 134.87"}
            className="w-full bg-transparent text-lg font-bold text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      )}

      {/* Payment Instructions */}
      <div className="rounded-2xl bg-primary/10 border border-primary/25 p-4 space-y-3">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">EcoCash Payment Instructions</p>

        {displayAmount !== null && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-background/60 border border-border px-3 py-2.5">
            <div>
              <p className="text-[11px] text-muted-foreground">Send exactly</p>
              <p className="text-lg font-bold text-foreground">{displayAmountStr}</p>
              {currency === "ZiG" && parsedAmount && (
                <p className="text-[11px] text-muted-foreground">≈ USD {parsedAmount.toFixed(2)}</p>
              )}
            </div>
            <button
              type="button" onClick={() => copy("amount")}
              className="rounded-xl bg-primary/10 p-2 text-primary hover:bg-primary/20 transition-colors"
              title="Copy amount"
            >
              {copiedField === "amount" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 rounded-xl bg-background/60 border border-border px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Phone size={16} className="text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">EcoCash number</p>
              <p className="text-base font-bold text-foreground font-mono">{settings.ecocash_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button" onClick={() => copy("phone")}
              className="rounded-xl bg-primary/10 p-2 text-primary hover:bg-primary/20 transition-colors"
              title="Copy number"
            >
              {copiedField === "phone" ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <a
              href={`tel:*151%23`}
              className="rounded-xl bg-green-500/15 p-2 text-green-600 hover:bg-green-500/25 transition-colors"
              title="Open dialer"
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>

        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Dial <span className="font-mono font-semibold text-foreground">*151#</span> on your mobile device to open EcoCash, then send{" "}
          {displayAmount !== null ? <span className="font-semibold text-foreground">{displayAmountStr}</span> : "the exact amount"}{" "}
          to <span className="font-mono font-semibold text-foreground">{settings.ecocash_number}</span>. Keep your transaction ID from the SMS confirmation.
        </p>
      </div>

      {/* Transaction ID */}
      <div className="rounded-2xl bg-card border border-border px-4 py-3">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          EcoCash Transaction ID <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          required
          maxLength={25}
          value={txId}
          onChange={(e) => setTxId(e.target.value.toUpperCase())}
          placeholder="e.g. MMI240610123456"
          className="w-full bg-transparent font-mono text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/40 placeholder:font-normal tracking-wider"
          style={{ textTransform: "uppercase" }}
        />
        <p className="mt-1 text-right text-[10px] text-muted-foreground">{txId.length}/25</p>
      </div>

      {/* Screenshot Upload */}
      <div className="rounded-2xl bg-card border border-border px-4 py-3">
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          Receipt Screenshot <span className="text-muted-foreground">(optional but recommended)</span>
        </label>
        {screenshot ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-xl bg-secondary px-3 py-2 text-sm text-foreground truncate">
              {screenshot.name}
            </div>
            <button
              type="button"
              onClick={() => { setScreenshot(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Upload size={16} />
            Tap to attach screenshot (JPEG or PNG, max 5 MB)
          </button>
        )}
        <input
          ref={fileRef} type="file" accept="image/jpeg,image/png"
          className="hidden" onChange={handleScreenshotChange}
        />
        {screenshotError && (
          <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
            <AlertCircle size={12} /> {screenshotError}
          </p>
        )}
      </div>

      {/* Dispute / Note */}
      <div className="rounded-2xl bg-card border border-border px-4 py-3">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
          <MessageSquare size={12} /> Report issue / dispute note (optional)
        </label>
        <textarea
          rows={2}
          maxLength={500}
          value={disputeNote}
          onChange={(e) => setDisputeNote(e.target.value)}
          placeholder="e.g. I accidentally sent the wrong amount, correct amount was..."
          className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        <p className="text-right text-[10px] text-muted-foreground">{disputeNote.length}/500</p>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-2xl bg-destructive/10 border border-destructive/25 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button
        type="submit"
        disabled={stage === "submitting" || !txId.trim() || txId.trim().length < 3}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-opacity"
      >
        {stage === "submitting" ? (
          <><Loader2 size={16} className="animate-spin" /> Submitting…</>
        ) : (
          "Submit Payment Proof"
        )}
      </button>

      <p className="text-center text-[11px] text-muted-foreground">
        Having trouble?{" "}
        <button type="button" onClick={() => setStage("dispute")} className="text-primary underline underline-offset-2">
          Report a dispute
        </button>
      </p>
    </form>
  );
}
