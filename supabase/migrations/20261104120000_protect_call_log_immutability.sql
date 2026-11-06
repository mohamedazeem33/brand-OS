-- Migration: 20261104120000_protect_call_log_immutability.sql
-- Description: Adds a BEFORE UPDATE trigger on public.lead_call_logs to enforce
-- historical record immutability. Non-admin salespeople may only transition
-- follow_up_status from 'pending' to 'superseded', 'cancelled', or 'completed'.
-- All historical call metrics, outcomes, notes, and timestamps are immutable.

BEGIN;

-- 1. Create or replace the protection trigger function
CREATE OR REPLACE FUNCTION public.protect_call_log_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Service role and Admins retain full management permissions
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot alter primary key or foreign key links
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot modify call log ID.';
  END IF;

  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    RAISE EXCEPTION 'Cannot modify call log lead link.';
  END IF;

  IF NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id THEN
    RAISE EXCEPTION 'Cannot modify the salesperson who recorded the call.';
  END IF;

  -- Non-admins cannot alter call metrics, outcomes, notes, or timestamps
  IF NEW.interaction_type IS DISTINCT FROM OLD.interaction_type OR
     NEW.attempt_number IS DISTINCT FROM OLD.attempt_number OR
     NEW.call_result IS DISTINCT FROM OLD.call_result OR
     NEW.call_outcome IS DISTINCT FROM OLD.call_outcome OR
     NEW.qualification_result IS DISTINCT FROM OLD.qualification_result OR
     NEW.response IS DISTINCT FROM OLD.response OR
     NEW.unqualified_reason IS DISTINCT FROM OLD.unqualified_reason OR
     NEW.unqualified_notes IS DISTINCT FROM OLD.unqualified_notes OR
     NEW.scheduled_follow_up_at IS DISTINCT FROM OLD.scheduled_follow_up_at OR
     NEW.notes IS DISTINCT FROM OLD.notes OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Historical call log records are immutable. Only follow_up_status may be updated.';
  END IF;

  -- Validate follow_up_status transition for non-admins
  IF NEW.follow_up_status IS DISTINCT FROM OLD.follow_up_status THEN
    IF OLD.follow_up_status IS DISTINCT FROM 'pending' OR
       NEW.follow_up_status NOT IN ('superseded', 'cancelled', 'completed') THEN
      RAISE EXCEPTION 'Invalid follow_up_status transition. Only pending follow-ups can be marked as superseded, cancelled, or completed.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Revoke execute on the trigger function from public to prevent RPC exposure
REVOKE EXECUTE ON FUNCTION public.protect_call_log_immutability() FROM PUBLIC, anon, authenticated;

-- 3. Create BEFORE UPDATE trigger on public.lead_call_logs
DROP TRIGGER IF EXISTS trg_protect_call_log_immutability ON public.lead_call_logs;

CREATE TRIGGER trg_protect_call_log_immutability
BEFORE UPDATE ON public.lead_call_logs
FOR EACH ROW
EXECUTE FUNCTION public.protect_call_log_immutability();

COMMIT;

