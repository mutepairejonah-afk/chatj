import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-start";
import { ArrowLeft, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { CheckoutView } from "@/customer-app/CheckoutView";

export const Route = createFileRoute("/checkout")({
  validateSearch: (search: Record<string, unknown>) => ({
    amount: search.amount !== undefined ? Number(search.amount) : undefined,
    currency: (search.currency === "ZiG" ? "ZiG" : "USD") as "USD" | "ZiG",
    description: typeof search.description === "string" ? search.description : "ChatApp Premium",
  }),
  component: CheckoutPage,
  head: () => ({
    meta: [{ title: "Checkout — EcoCash Payment" }],
  }),
});

function CheckoutPage() {
  const { amount, currency, description } = Route.useSearch();
  const { userId } = useAuth();
  const navigate = useNavigate();

  // Expose clerk user ID for the checkout component (client-side only)
  useEffect(() => {
    if (typeof window !== "undefined" && userId) {
      (window as any).__clerk_user_id = userId;
    }
  }, [userId]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <button onClick={() => navigate({ to: "/" })} className="p-2 -ml-2 text-muted-foreground">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-foreground">EcoCash Checkout</h1>
          {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
        </div>
        <Crown size={18} className="text-amber-500 shrink-0" />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-md p-4 pb-12"
        >
          {!userId ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <p className="text-sm text-muted-foreground">You must be signed in to complete a payment.</p>
              <button
                onClick={() => navigate({ to: "/login" })}
                className="rounded-2xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Sign In
              </button>
            </div>
          ) : (
            <CheckoutView
              initialAmount={amount}
              initialCurrency={currency}
              description={description}
              onSuccess={() => {}}
            />
          )}
        </motion.div>
      </div>

      {/* Footer note */}
      <div className="border-t border-border bg-background/60 px-4 py-3 text-center">
        <p className="text-[11px] text-muted-foreground">
          Manual EcoCash verification · Payments reviewed within minutes · Secure
        </p>
      </div>
    </div>
  );
}
