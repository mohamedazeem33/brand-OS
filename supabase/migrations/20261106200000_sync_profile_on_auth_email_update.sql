-- Migration: 20261106200000_sync_profile_on_auth_email_update.sql
-- Description: Automatically synchronize public.profiles.email whenever an existing
-- user's email in auth.users is updated or confirmed. Handles delayed email confirmations
-- seamlessly without requiring further client or Edge Function requests.

BEGIN;

-- 1. Create or replace trigger function to sync profile email when auth user email changes
CREATE OR REPLACE FUNCTION public.handle_user_email_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Synchronize public.profiles.email if auth.users email actually changed
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Revoke execute on the function from public/anon to avoid RPC exposure
REVOKE EXECUTE ON FUNCTION public.handle_user_email_updated() FROM PUBLIC, anon;

-- 3. Create AFTER UPDATE trigger on auth.users for email column changes
DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;

CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_user_email_updated();

COMMIT;

