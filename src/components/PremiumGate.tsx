import { BadgeCheck } from "lucide-react";
import { usePremium } from "@/hooks/usePremium";

export function VerifiedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const iconSize = size === "md" ? 16 : 13;
  return (
    <BadgeCheck
      size={iconSize}
      className="text-primary shrink-0"
      aria-label="Verified"
    />
  );
}

export function PremiumBadge({ tier }: { tier: "premium" | "pro" | "verified" }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary">
      <BadgeCheck size={9} />
      VERIFIED
    </span>
  );
}

interface PremiumGateProps {
  require: "premium" | "pro";
  children: React.ReactNode;
  mode?: "blur" | "hide" | "badge";
  className?: string;
}

export function PremiumGate({ children }: PremiumGateProps) {
  return <>{children}</>;
}
