import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/tanstack-start";
import { getPremiumStatus } from "@/lib/api.functions";

export type PlanTier = "free" | "premium" | "pro";

export interface PremiumSettings {
  hideReadReceipts: boolean;
  verified: boolean;
  bioLinks: { label: string; url: string }[];
}

export interface UsePremiumResult {
  tier: PlanTier;
  isPremium: boolean;
  isPro: boolean;
  isAdmin: boolean;
  loading: boolean;
  settings: PremiumSettings;
  refresh: () => void;
}

export function usePremium(): UsePremiumResult {
  const { userId } = useAuth();
  const [tier, setTier] = useState<PlanTier>("free");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PremiumSettings>({
    hideReadReceipts: false,
    verified: false,
    bioLinks: [],
  });

  const refresh = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    getPremiumStatus({ data: { clerkUserId: userId } })
      .then((data) => {
        setTier((data.tier as PlanTier) ?? "free");
        setIsAdmin(data.isAdmin ?? false);
        setSettings({
          hideReadReceipts: data.hideReadReceipts ?? false,
          verified: data.verified ?? false,
          bioLinks: data.bioLinks ?? [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    tier,
    isPremium: tier === "premium" || tier === "pro",
    isPro: tier === "pro",
    isAdmin,
    loading,
    settings,
    refresh,
  };
}
