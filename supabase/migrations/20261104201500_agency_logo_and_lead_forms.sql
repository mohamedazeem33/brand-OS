-- Migration: 20261104201500_agency_logo_and_lead_forms.sql
-- Description: Add logo_url and meta_lead_forms to public.agency_settings,
-- allow public/authenticated read for agency branding and logo display,
-- and configure storage policies for the 'agency-assets' bucket.

BEGIN;

-- 1. Add logo_url and meta_lead_forms columns to agency_settings
ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS meta_lead_forms jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Update SELECT policy on agency_settings so agency name & logo can be read across workspace & login
DROP POLICY IF EXISTS "admins can read agency_settings" ON public.agency_settings;
DROP POLICY IF EXISTS "allow read agency_settings" ON public.agency_settings;
CREATE POLICY "allow read agency_settings"
  ON public.agency_settings FOR SELECT
  TO authenticated, anon
  USING (true);

-- Ensure modification policies remain strictly active Admin only
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

-- 3. Configure storage bucket for agency assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agency-assets',
  'agency-assets',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

-- 4. Storage object policies for agency-assets
DROP POLICY IF EXISTS "Public read agency assets" ON storage.objects;
CREATE POLICY "Public read agency assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agency-assets');

DROP POLICY IF EXISTS "Admins can upload agency assets" ON storage.objects;
CREATE POLICY "Admins can upload agency assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agency-assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can update agency assets" ON storage.objects;
CREATE POLICY "Admins can update agency assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agency-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'agency-assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete agency assets" ON storage.objects;
CREATE POLICY "Admins can delete agency assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agency-assets' AND public.is_admin());

COMMIT;

