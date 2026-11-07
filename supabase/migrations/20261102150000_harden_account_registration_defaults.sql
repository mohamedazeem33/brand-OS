-- Migration: 20261102150000_harden_account_registration_defaults.sql
-- Description: Sets profiles.is_active default to false to ensure new self-registered
-- accounts require explicit administrator activation before gaining employee access.
-- Preserves existing active accounts, roles, and assignments.

BEGIN;

-- 1. Change column default for is_active from true to false
-- This affects only future row inserts. Existing rows are untouched.
ALTER TABLE public.profiles 
  ALTER COLUMN is_active SET DEFAULT false;

-- 2. Document the security rationale in PostgreSQL column metadata
COMMENT ON COLUMN public.profiles.is_active IS 
  'Account active status. Defaults to false so new self-registered profiles require explicit administrator activation.';

COMMIT;

