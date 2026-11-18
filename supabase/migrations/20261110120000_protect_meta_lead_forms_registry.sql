-- Migration: 20261110120000_protect_meta_lead_forms_registry.sql
-- Description: Prevent direct client modifications to agency_settings.meta_lead_forms column.
-- Ordinary authenticated users (even Admins) can update agency profile fields (name, tagline, address, logo, etc.),
-- but any direct update to meta_lead_forms must go through privileged service_role backend actions.

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_agency_meta_lead_forms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If meta_lead_forms column is being modified
  IF NEW.meta_lead_forms IS DISTINCT FROM OLD.meta_lead_forms THEN
    -- Only allow if the executing role is service_role (used by Edge Functions)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client updates to meta_lead_forms are strictly prohibited. Updates must be performed via the verified team-admin backend service.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_agency_meta_lead_forms ON public.agency_settings;
CREATE TRIGGER trg_protect_agency_meta_lead_forms
  BEFORE UPDATE ON public.agency_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_agency_meta_lead_forms();

COMMIT;

