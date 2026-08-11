-- ═══════════════════════════════════════════════════════════════
-- EcoCash P2P Payment Verification System
-- ═══════════════════════════════════════════════════════════════

-- 1. Add is_admin column to profiles for admin access control
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Payments / orders table
CREATE TABLE IF NOT EXISTS public.payments (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          TEXT          NOT NULL,
  user_display_name TEXT,
  amount           DECIMAL(10,2) NOT NULL,
  currency         TEXT          NOT NULL DEFAULT 'USD'
                     CHECK (currency IN ('USD', 'ZiG')),
  transaction_id   TEXT          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  screenshot_url   TEXT,
  approved_by      TEXT,
  processed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  dispute_note     TEXT,
  created_at       TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  CONSTRAINT payments_transaction_id_unique UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id  ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_txid     ON public.payments(transaction_id);

-- 3. EcoCash admin settings (exchange rate + merchant number)
CREATE TABLE IF NOT EXISTS public.ecocash_settings (
  id               INTEGER       PRIMARY KEY DEFAULT 1,
  usd_to_zig_rate  DECIMAL(10,4) NOT NULL DEFAULT 13.5000,
  ecocash_number   TEXT          NOT NULL DEFAULT '0788800342',
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

INSERT INTO public.ecocash_settings (id, usd_to_zig_rate, ecocash_number)
VALUES (1, 13.5, '0788800342')
ON CONFLICT (id) DO NOTHING;

-- 4. Storage bucket for payment receipt screenshots (public read for admin viewing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- ── How to grant admin access ──────────────────────────────────
-- Run in Supabase SQL editor to make a user an admin:
--   UPDATE public.profiles SET is_admin = true
--   WHERE clerk_user_id = '<your-clerk-user-id>';
