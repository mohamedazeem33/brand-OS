/*
# Create clients table for lead-to-client conversion

## Purpose
Stores client records created when a lead is converted. Each client
retains a link to the original lead (lead_id) for historical acquisition
tracking. Clients are visible to all active employees (same model as leads).

## New Table: clients
- id (uuid, PK, default gen_random_uuid())
- name (text, NOT NULL) — client's full name (copied from lead)
- company_name (text, nullable) — business/company name, optional at conversion
- phone (text, NOT NULL) — phone number (copied from lead)
- email (text, nullable) — email (copied from lead if present)
- service (text, NOT NULL, default 'Not specified') — interested service
- source (text, NOT NULL, default 'Other') — lead source, check constraint matching leads
- assigned_to (uuid, nullable) — salesperson, FK to profiles
- status (text, NOT NULL, default 'active') — client status: active, onboarding, paused, churned
- lead_id (uuid, nullable, UNIQUE) — FK to leads, prevents duplicate client per lead
- notes (text, default '') — internal notes
- created_by (uuid, default auth.uid()) — who created the client
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

## Indexes
- idx_clients_assigned_to for filtering by salesperson
- idx_clients_lead_id for dedup lookups
- idx_clients_status for status filtering

## Security (RLS)
- Enable RLS on clients
- Grant SELECT, INSERT, UPDATE, DELETE to authenticated
- 4 policies (select/insert/update/delete) using is_active_employee() — same model as leads
- DELETE restricted to admins via is_admin() — same as leads
- Grant service_role access for edge functions

## Notes
- lead_id has a UNIQUE constraint so the same lead cannot be converted twice
- source check constraint mirrors the leads table enum
- status uses a client-specific enum: active, onboarding, paused, churned
- The original lead is NOT deleted; it stays in the leads table with status='converted'
*/

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text,
  phone text NOT NULL,
  email text,
  service text NOT NULL DEFAULT 'Not specified',
  source text NOT NULL DEFAULT 'Other' CHECK (source IN ('Meta Ads', 'Referral', 'Phone Call', 'Other')),
  assigned_to uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'onboarding', 'paused', 'churned')),
  lead_id uuid UNIQUE REFERENCES leads(id),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON clients(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_lead_id ON clients(lead_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

GRANT SELECT, INSERT, UPDATE ON clients TO authenticated;
GRANT SELECT ON clients TO service_role;
GRANT UPDATE ON clients TO service_role;

DROP POLICY IF EXISTS "active employees can read clients" ON clients;
CREATE POLICY "active employees can read clients"
  ON clients FOR SELECT TO authenticated
  USING (is_active_employee());

DROP POLICY IF EXISTS "active employees can create clients" ON clients;
CREATE POLICY "active employees can create clients"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (is_active_employee() AND created_by = auth.uid());

DROP POLICY IF EXISTS "active employees can update clients" ON clients;
CREATE POLICY "active employees can update clients"
  ON clients FOR UPDATE TO authenticated
  USING (is_active_employee())
  WITH CHECK (is_active_employee());

DROP POLICY IF EXISTS "admins can delete clients" ON clients;
CREATE POLICY "admins can delete clients"
  ON clients FOR DELETE TO authenticated
  USING (is_admin());