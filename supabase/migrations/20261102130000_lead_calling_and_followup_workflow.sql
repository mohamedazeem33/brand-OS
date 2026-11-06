-- ============================================================================
-- Migration: 20261102130000_lead_calling_and_followup_workflow.sql
-- Description: Structured call history, exact date/time follow-up scheduling,
--              lead qualification tracking, and unqualified leads management.
-- ============================================================================

-- 1. Synchronize schema migrations tracker if previous migration was not logged
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261031190000', 'soft_delete_leads_and_lock_meta_source')
ON CONFLICT (version) DO NOTHING;

-- 2. Extend public.leads with exact follow-up timestamp and qualification fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualification_status text,
  ADD COLUMN IF NOT EXISTS unqualified_reason text,
  ADD COLUMN IF NOT EXISTS unqualified_notes text,
  ADD COLUMN IF NOT EXISTS unqualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS unqualified_by uuid REFERENCES public.profiles(id);

-- Add check constraint for qualification_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_qualification_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_qualification_status_check
      CHECK (qualification_status IS NULL OR qualification_status IN ('qualified', 'unqualified'));
  END IF;
END $$;

-- Update status check constraint to include 'unqualified'
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'follow_up'::text, 'converted'::text, 'lost'::text, 'unqualified'::text]));

-- Backfill next_follow_up_at from existing follow_up_date (defaulting to 10:00 AM local time / Asia/Kolkata +05:30)
UPDATE public.leads
SET next_follow_up_at = (follow_up_date::text || ' 10:00:00+05:30')::timestamptz
WHERE follow_up_date IS NOT NULL AND next_follow_up_at IS NULL;

-- 3. Create public.lead_call_logs for dedicated structured call history
CREATE TABLE IF NOT EXISTS public.lead_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  salesperson_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  interaction_type text NOT NULL CHECK (interaction_type IN ('outgoing', 'incoming')),
  attempt_number integer CHECK (attempt_number IS NULL OR attempt_number > 0),
  call_result text NOT NULL CHECK (call_result IN ('attended', 'not_attended')),
  call_outcome text NOT NULL CHECK (call_outcome IN ('attended', 'signal_problem', 'full_ring')),
  qualification_result text CHECK (qualification_result IS NULL OR qualification_result IN ('qualified', 'unqualified')),
  response text,
  unqualified_reason text,
  unqualified_notes text,
  scheduled_follow_up_at timestamptz,
  follow_up_status text CHECK (follow_up_status IS NULL OR follow_up_status IN ('pending', 'completed', 'cancelled', 'superseded')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create performance indexes
CREATE INDEX IF NOT EXISTS lead_call_logs_lead_idx
  ON public.lead_call_logs (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_call_logs_salesperson_idx
  ON public.lead_call_logs (salesperson_id);

CREATE INDEX IF NOT EXISTS lead_call_logs_pending_idx
  ON public.lead_call_logs (scheduled_follow_up_at)
  WHERE follow_up_status = 'pending';

CREATE INDEX IF NOT EXISTS leads_next_follow_up_idx
  ON public.leads (next_follow_up_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS leads_unqualified_idx
  ON public.leads (unqualified_at)
  WHERE status = 'unqualified';

-- 5. Enable Row-Level Security (RLS) on public.lead_call_logs
ALTER TABLE public.lead_call_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admin can read all call logs
DROP POLICY IF EXISTS "admin read lead call logs" ON public.lead_call_logs;
CREATE POLICY "admin read lead call logs"
  ON public.lead_call_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Policy: Salespeople can read call logs for leads assigned to them
DROP POLICY IF EXISTS "salesperson read lead call logs" ON public.lead_call_logs;
CREATE POLICY "salesperson read lead call logs"
  ON public.lead_call_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_employee()
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_call_logs.lead_id
        AND l.assigned_to = auth.uid()
    )
  );

-- Policy: Active employees can insert call logs for assigned leads (or any lead if admin)
DROP POLICY IF EXISTS "insert lead call logs" ON public.lead_call_logs;
CREATE POLICY "insert lead call logs"
  ON public.lead_call_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_employee()
    AND salesperson_id = auth.uid()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_call_logs.lead_id
          AND l.assigned_to = auth.uid()
      )
    )
  );

-- Policy: Allow updating follow-up status (e.g., superseded / completed) for assigned leads
DROP POLICY IF EXISTS "update lead call logs" ON public.lead_call_logs;
CREATE POLICY "update lead call logs"
  ON public.lead_call_logs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_employee()
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_call_logs.lead_id
          AND l.assigned_to = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_active_employee()
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_call_logs.lead_id
          AND l.assigned_to = auth.uid()
      )
    )
  );

-- Policy: Permanently prevent hard deletion of call logs
DROP POLICY IF EXISTS "prevent hard delete lead call logs" ON public.lead_call_logs;
CREATE POLICY "prevent hard delete lead call logs"
  ON public.lead_call_logs
  FOR DELETE
  TO authenticated
  USING (false);

-- Record this migration
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102130000', 'lead_calling_and_followup_workflow')
ON CONFLICT (version) DO NOTHING;

