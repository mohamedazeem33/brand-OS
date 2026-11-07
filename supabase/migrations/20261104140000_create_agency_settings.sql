-- Migration: 20261104140000_create_agency_settings.sql
-- Description: Create public.agency_settings table, seed default configuration,
-- configure Admin-only Row Level Security (RLS) policies, prevent hard deletion,
-- and provide verified system security status inspection for Admin Settings.

BEGIN;

-- 1. Create agency_settings table
CREATE TABLE IF NOT EXISTS public.agency_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  agency_name text NOT NULL DEFAULT 'Taha Media',
  tagline text NOT NULL DEFAULT 'Performance & Growth Marketing',
  contact_email text DEFAULT 'contact@taha.in',
  contact_phone text DEFAULT '+91 98765 43210',
  address text DEFAULT 'Mumbai, Maharashtra, India',
  gstin text DEFAULT '',
  currency text NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR', 'USD', 'AED', 'EUR', 'GBP', 'SAR')),
  currency_symbol text NOT NULL DEFAULT '₹',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  invoice_prefix text NOT NULL DEFAULT 'TM-INV-',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 2. Trigger for updated_at and updated_by
CREATE OR REPLACE FUNCTION public.handle_agency_settings_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_settings_updated ON public.agency_settings;
CREATE TRIGGER trg_agency_settings_updated
  BEFORE UPDATE ON public.agency_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_agency_settings_updated();

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Active Admins only; hard deletion blocked
DROP POLICY IF EXISTS "admins can read agency_settings" ON public.agency_settings;
CREATE POLICY "admins can read agency_settings"
  ON public.agency_settings FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admins can insert agency_settings" ON public.agency_settings;
CREATE POLICY "admins can insert agency_settings"
  ON public.agency_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins can update agency_settings" ON public.agency_settings;
CREATE POLICY "admins can update agency_settings"
  ON public.agency_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "prevent deletion on agency_settings" ON public.agency_settings;
CREATE POLICY "prevent deletion on agency_settings"
  ON public.agency_settings FOR DELETE TO authenticated
  USING (false);

-- 5. Seed default configuration row for Taha Media
INSERT INTO public.agency_settings (
  id,
  agency_name,
  tagline,
  contact_email,
  contact_phone,
  address,
  gstin,
  currency,
  currency_symbol,
  timezone,
  invoice_prefix
) VALUES (
  'default',
  'Taha Media',
  'Performance & Growth Marketing',
  'contact@taha.in',
  '+91 98765 43210',
  'Mumbai, Maharashtra, India',
  '',
  'INR',
  '₹',
  'Asia/Kolkata',
  'TM-INV-'
)
ON CONFLICT (id) DO NOTHING;

-- 6. RPC Function to securely inspect verifiable system security statuses for Admin Settings
CREATE OR REPLACE FUNCTION public.get_system_security_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'information_schema'
AS $$
DECLARE
  v_reg_hardened boolean;
  v_call_log_trigger boolean;
  v_meta_leads_count bigint;
  v_last_meta_lead timestamptz;
BEGIN
  -- Restrict strictly to active admins
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  -- 1. Verify account registration default is hardened (is_active = false)
  SELECT (column_default = 'false') INTO v_reg_hardened
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active';

  -- 2. Verify call-log immutability trigger exists and is active
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND event_object_table = 'lead_call_logs' AND trigger_name = 'trg_protect_call_log_immutability'
  ) INTO v_call_log_trigger;

  -- 3. Verify Meta lead intake activity (without exposing webhook secrets or credentials)
  SELECT count(*), max(created_at) INTO v_meta_leads_count, v_last_meta_lead
  FROM public.leads
  WHERE source = 'Meta Ads';

  RETURN jsonb_build_object(
    'account_registration_hardened', coalesce(v_reg_hardened, false),
    'call_log_immutability_active', coalesce(v_call_log_trigger, false),
    'meta_leads_count', coalesce(v_meta_leads_count, 0),
    'last_meta_lead_at', v_last_meta_lead
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_system_security_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_security_status() TO authenticated;

COMMIT;

