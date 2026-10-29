/*
# Create Taha Media Phase 1 foundation

1. New Tables
- `profiles`: one internal employee profile per authenticated account, with a future-ready role and active flag.
- `leads`: internal lead records with contact details, source, service interest, assignment, status, follow-up date, notes, and received date.

2. New Columns
- `profiles.id`: authenticated user id.
- `profiles.email`: private account email.
- `profiles.full_name`: employee display name.
- `profiles.role`: extensible employee role, initially admin or employee.
- `profiles.is_active`: whether the account may use the internal workspace.
- `leads.name`, `phone`, `email`: lead contact details.
- `leads.source`: Meta Ads, Referral, Phone Call, or Other.
- `leads.service`: requested service or package.
- `leads.assigned_to`: optional employee assignment.
- `leads.status`: new, contacted, follow_up, converted, or lost.
- `leads.follow_up_date`: optional next follow-up date.
- `leads.notes`: internal notes.
- `leads.received_at`: date the lead entered the system.
- `leads.created_by`, `created_at`, `updated_at`: audit and ownership timestamps.

3. Security
- RLS is enabled on both tables.
- Only authenticated active employees can access the internal data.
- Profiles are readable by authenticated employees but only admins can change account role or active state through the database.
- Lead data is readable and editable by active authenticated employees.
- Role and ownership checks are derived from the authenticated session, never from user-provided fields.
- Grants are limited to the authenticated role.

4. Important Notes
- There is intentionally no public registration flow.
- The database structure supports future roles without changing lead records.
- Meta Ads is represented as a supported source now; no live Meta webhook is configured by this migration.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT 'Taha Media team member',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'sales', 'editor', 'script_writer', 'social_media_manager', 'finance', 'employee')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  source text NOT NULL DEFAULT 'Other' CHECK (source IN ('Meta Ads', 'Referral', 'Phone Call', 'Other')),
  service text NOT NULL DEFAULT 'Not specified',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'follow_up', 'converted', 'lost')),
  follow_up_date date,
  notes text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_source_idx ON public.leads(source);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_follow_up_date_idx ON public.leads(follow_up_date);

CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "active employees can read profiles" ON public.profiles;
CREATE POLICY "active employees can read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_active_employee());

DROP POLICY IF EXISTS "employees can update their name" ON public.profiles;
CREATE POLICY "employees can update their name" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND public.is_active_employee())
  WITH CHECK (id = auth.uid() AND public.is_active_employee());

DROP POLICY IF EXISTS "active employees can read leads" ON public.leads;
CREATE POLICY "active employees can read leads" ON public.leads FOR SELECT TO authenticated
  USING (public.is_active_employee());

DROP POLICY IF EXISTS "active employees can create leads" ON public.leads;
CREATE POLICY "active employees can create leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.is_active_employee() AND created_by = auth.uid());

DROP POLICY IF EXISTS "active employees can update leads" ON public.leads;
CREATE POLICY "active employees can update leads" ON public.leads FOR UPDATE TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

DROP POLICY IF EXISTS "active employees can delete leads" ON public.leads;
CREATE POLICY "active employees can delete leads" ON public.leads FOR DELETE TO authenticated
  USING (public.is_admin());
