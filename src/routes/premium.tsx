import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { BadgeCheck, ArrowLeft, CheckCircle2, ShieldCheck, Star, Zap, Globe, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { usePremium } from "@/hooks/usePremium";

export const Route = createFileRoute("/premium")({
  component: VerifiedPage,
  head: () => ({
    meta: [
      { title: "Get Verified — ChatApp" },
      { name: "description", content: "Get a verified badge on your ChatApp profile" },
    ],
  }),
});

const VERIFIED_PERKS = [
  { icon: BadgeCheck, text: "Blue verified checkmark on your profile and in chats" },
  { icon: Star, text: "Priority in search results and contact suggestions" },
  { icon: Globe, text: "Custom link-in-bio: add links to your public profile" },
  { icon: Zap, text: "Stand out — verified badge visible to everyone" },
  { icon: Eye, text: "Verified stories ring — gold border on your stories" },
  { icon: ShieldCheck, text: "Trust signal — others know your account is authentic" },
];

function VerifiedPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const { settings, isAdmin } = usePremium();
  const isVerified = settings.verified || isAdmin;
  const [submitted, setSubmitted] = useState(false);

  const handleApply = () => {
    navigate({ to: "/checkout", search: { amount: 2.99, currency: "USD", description: "Verified Badge" } });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <button onClick={() => navigate({ to: "/me" })} className="rounded-full bg-secondary p-2 text-muted-foreground">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Verified Badge</h1>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-8 space-y-4">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-br from-primary/20 via-sky-500/10 to-cyan-500/10 border border-primary/20 p-6 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary to-sky-400 mb-3 shadow-lg">
            <BadgeCheck size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1">Get Verified</h2>
          <p className="text-sm text-muted-foreground">
            A blue checkmark shows everyone your account is real and trustworthy.
          </p>
        </motion.div>

        {/* Already verified */}
        {isVerified && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 flex items-center gap-3"
          >
            <BadgeCheck size={20} className="text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">You're already verified ✓</p>
              <p className="text-xs text-muted-foreground">Your profile shows the blue checkmark</p>
            </div>
          </motion.div>
        )}

        {/* Perks list */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl bg-card border border-border overflow-hidden"
        >
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What you get</p>
          </div>
          <div className="divide-y divide-border">
            {VERIFIED_PERKS.map((perk, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <perk.icon size={14} className="text-primary" />
                </div>
                <p className="text-sm text-foreground leading-snug">{perk.text}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Price + CTA */}
        {!isVerified && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl bg-card border border-border p-5 space-y-4"
          >
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">$2.99<span className="text-base font-normal text-muted-foreground"> one-time</span></p>
              <p className="text-xs text-muted-foreground mt-1">Pay once — verified for life</p>
            </div>
            <button
              onClick={handleApply}
              className="w-full rounded-2xl bg-gradient-to-r from-primary to-sky-400 py-3.5 text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-transform"
            >
              Get Verified — Pay with EcoCash
            </button>
            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Tap above to go to the payment screen</li>
              <li>Send $2.99 equivalent via EcoCash to the listed number</li>
              <li>Enter your EcoCash Transaction ID and submit</li>
              <li>An admin will verify your payment and activate your badge</li>
            </ol>
          </motion.div>
        )}

        {/* Free plan reminder */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl bg-card border border-border p-4 text-center"
        >
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <CheckCircle2 size={14} className="text-online" />
            <p className="text-sm font-semibold text-foreground">All features are free</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Messaging, calls, stories, polls, groups, AI chat — all free for everyone. The verified badge is optional.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
