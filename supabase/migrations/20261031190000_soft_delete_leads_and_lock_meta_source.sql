/*
# Soft Deletion for Leads & Source Locking for Meta Leads

## 1. Schema Extensions
- `public.leads`:
  - `deleted_at`: timestamptz (null for active leads, timestamp when soft-deleted)
  - `deleted_by`: uuid REFERENCES public.profiles(id) (tracks which admin soft-deleted the lead)
  - Index `leads_deleted_at_idx` on `public.leads(deleted_at)` for query performance

## 2. Trigger Function Update: `protect_lead_ownership()`
- Permanently locks `source` for any Meta-origin lead (`OLD.meta_lead_id IS NOT NULL`):
  Neither admins nor salespeople can alter `source` if `meta_lead_id` is present.
- Enforces admin-only soft deletion & restoration:
  Only administrators (`is_admin()`) or `service_role` can modify `deleted_at` or `deleted_by`.
- Preserves existing ownership protections:
  Non-admins cannot alter `created_by` or `assigned_to`.

## 3. RLS Policies Update on `public.leads`
- SELECT (`role based read leads`):
  - Admins can read all leads (both active and deleted, enabling the Deleted Leads page).
  - Non-admins can only read active leads assigned to them (`assigned_to = auth.uid() AND deleted_at IS NULL`).
- UPDATE (`role based update leads`):
  - Admins can update any lead (including soft deletion and restoration).
  - Non-admins can only update active leads assigned to them (`assigned_to = auth.uid() AND deleted_at IS NULL`).
- DELETE (`prevent hard delete leads`):
  - Replaces hard delete with `USING (false)` to prevent accidental permanent deletion.
*/

-- 1. Add soft-delete columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS leads_deleted_at_idx ON public.leads(deleted_at);

-- 2. Update trigger function protect_lead_ownership
CREATE OR REPLACE FUNCTION public.protect_lead_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rule 1: Universal Source Lock for Meta-Origin Leads
  -- If a lead has a meta_lead_id, the source is immutable for ALL users (admins and salespeople)
  IF OLD.meta_lead_id IS NOT NULL AND NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'Cannot modify the source of a Meta-origin lead.';
  END IF;

  -- Rule 2: Service role and Admins have full access to manage all other fields (including soft delete/restore)
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Rule 3: Non-Admin Restrictions
  -- Non-admins cannot alter the original created_by audit field
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Cannot modify the created_by field.';
  END IF;

  -- Non-admins cannot soft-delete or restore leads
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    RAISE EXCEPTION 'Only administrators can delete or restore leads.';
  END IF;

  -- Non-admins cannot reassign leads to other salespeople
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Cannot modify the assigned salesperson.';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Update RLS policies on public.leads
DROP POLICY IF EXISTS "role based read leads" ON public.leads;
CREATE POLICY "role based read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.is_admin() 
    OR (public.is_active_employee() AND assigned_to = auth.uid() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "role based update leads" ON public.leads;
CREATE POLICY "role based update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "active employees can delete leads" ON public.leads;
DROP POLICY IF EXISTS "prevent hard delete leads" ON public.leads;
CREATE POLICY "prevent hard delete leads"
  ON public.leads FOR DELETE TO authenticated
  USING (false);

