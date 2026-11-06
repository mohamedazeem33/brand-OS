/*
# Role-based access control, ownership protection, and dynamic lead assignment foundation

## 1. Schema Extensions
- `profiles.last_assigned_at`: Timestamp tracking when a salesperson last received an assigned lead (for fair round-robin).
- `leads.meta_lead_id`: Unique identifier for incoming Meta Instant Form leads to guarantee deduplication.

## 2. Dynamic Assignment Function
- `assign_next_salesperson()`: Concurrency-safe function using a transaction-level advisory lock (`pg_advisory_xact_lock`)
  to serialize lead assignment across burst webhook invocations.
  Assigns incoming leads to the active salesperson who least recently received a lead.
  If no active salespeople exist, safely returns NULL (lead remains unassigned).
  Permissions: Execution restricted strictly to `service_role`. Execution revoked from PUBLIC, anon, and authenticated.

## 3. Immutability Triggers for Ownership
- `protect_lead_ownership()`: Enforces that `created_by` cannot be modified by non-admins on updates.
- `protect_client_ownership()`: Enforces that `created_by` and `lead_id` cannot be modified by non-admins on updates.

## 4. Row Level Security (RLS) Redesign
- `leads`:
  - SELECT: Admins can read all leads. Non-admins can read only leads where `assigned_to = auth.uid()`.
  - INSERT: Authenticated active employees can create leads, but non-admins must assign them to themselves (`assigned_to = auth.uid()`).
  - UPDATE: Admins can update any lead. Non-admins can update only their assigned leads and cannot reassign them.
  - DELETE: Admins only.
- `clients`:
  - SELECT: Admins can read all clients. Non-admins can read only clients where `assigned_to = auth.uid()`.
  - INSERT: Authenticated active employees can create clients, but non-admins must assign them to themselves (`assigned_to = auth.uid()`).
  - UPDATE: Admins can update any client. Non-admins can update only their assigned clients and cannot reassign them.
  - DELETE: Admins only.
*/

-- 1. Schema Extensions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_lead_id text;

CREATE UNIQUE INDEX IF NOT EXISTS leads_meta_lead_id_idx
  ON public.leads(meta_lead_id)
  WHERE meta_lead_id IS NOT NULL;

-- 2. Concurrency-Safe Round-Robin Lead Assignment Function
CREATE OR REPLACE FUNCTION public.assign_next_salesperson()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_sales_id uuid;
BEGIN
  -- Transaction-scoped advisory lock serializes assignment across concurrent webhooks
  -- Automatically released when transaction completes (commit or rollback)
  PERFORM pg_advisory_xact_lock(hashtext('lead_assignment_rotation_lock'));

  -- Select the active sales profile least recently assigned
  -- NULLS FIRST prioritizes newly created salespeople
  SELECT id INTO selected_sales_id
  FROM public.profiles
  WHERE role = 'sales' AND is_active = true
  ORDER BY last_assigned_at ASC NULLS FIRST, created_at ASC
  LIMIT 1;

  -- If an active salesperson was found, update their timestamp
  IF selected_sales_id IS NOT NULL THEN
    UPDATE public.profiles
    SET last_assigned_at = now()
    WHERE id = selected_sales_id;
  END IF;

  -- Returns UUID or NULL if no active salesperson exists
  RETURN selected_sales_id;
END;
$$;

-- Restrict execution strictly to service_role (revoke from PUBLIC, anon, authenticated)
REVOKE ALL ON FUNCTION public.assign_next_salesperson() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_next_salesperson() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_next_salesperson() TO service_role;

-- 3. Immutability Triggers for Record Ownership & Linkages
CREATE OR REPLACE FUNCTION public.protect_lead_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role and admins can manage all fields
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot alter the original created_by audit field
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Cannot modify the created_by field.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_lead_ownership ON public.leads;
CREATE TRIGGER trg_protect_lead_ownership
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_lead_ownership();

CREATE OR REPLACE FUNCTION public.protect_client_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role and admins can manage all fields
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot alter created_by
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Cannot modify the created_by field.';
  END IF;

  -- Non-admins cannot alter the historical lead_id link
  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    RAISE EXCEPTION 'Cannot modify the lead_id link.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_client_ownership ON public.clients;
CREATE TRIGGER trg_protect_client_ownership
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_client_ownership();

-- 4. Update Leads RLS Policies
DROP POLICY IF EXISTS "active employees can read leads" ON public.leads;
DROP POLICY IF EXISTS "role based read leads" ON public.leads;
CREATE POLICY "role based read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS "active employees can create leads" ON public.leads;
DROP POLICY IF EXISTS "role based create leads" ON public.leads;
CREATE POLICY "role based create leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_employee()
    AND created_by = auth.uid()
    AND (
      public.is_admin()
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "active employees can update leads" ON public.leads;
DROP POLICY IF EXISTS "role based update leads" ON public.leads;
CREATE POLICY "role based update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid())
  );

-- 5. Update Clients RLS Policies
DROP POLICY IF EXISTS "active employees can read clients" ON public.clients;
DROP POLICY IF EXISTS "role based read clients" ON public.clients;
CREATE POLICY "role based read clients"
  ON public.clients FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS "active employees can create clients" ON public.clients;
DROP POLICY IF EXISTS "role based create clients" ON public.clients;
CREATE POLICY "role based create clients"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_employee()
    AND created_by = auth.uid()
    AND (
      public.is_admin()
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "active employees can update clients" ON public.clients;
DROP POLICY IF EXISTS "role based update clients" ON public.clients;
CREATE POLICY "role based update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_active_employee() AND assigned_to = auth.uid())
  );
