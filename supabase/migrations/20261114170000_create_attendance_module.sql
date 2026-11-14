-- Migration: 20261114170000_create_attendance_module.sql
-- Description: Complete Office GPS Attendance Module for Taha Media CRM
-- Registered Office: 2/116, Daya Sadan Main Road, Pallavan Nagar, Koyambedu, Chennai, Tamil Nadu 600107, India
-- Latitude: 13.0693169, Longitude: 80.1814571, Radius: 100m, Timezone: Asia/Kolkata

BEGIN;

-- 1. Create attendance_settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id text PRIMARY KEY DEFAULT 'default',
  office_address text NOT NULL DEFAULT '2/116, Daya Sadan Main Road, Pallavan Nagar, Koyambedu, Chennai, Tamil Nadu 600107, India',
  office_lat numeric(10, 7) NOT NULL DEFAULT 13.0693169,
  office_lng numeric(10, 7) NOT NULL DEFAULT 80.1814571,
  geofence_radius_meters integer NOT NULL DEFAULT 100,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  late_threshold_time time NOT NULL DEFAULT '10:00:00',
  max_gps_accuracy_meters numeric NOT NULL DEFAULT 150.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Seed default office configuration
INSERT INTO public.attendance_settings (
  id,
  office_address,
  office_lat,
  office_lng,
  geofence_radius_meters,
  timezone,
  late_threshold_time,
  max_gps_accuracy_meters
) VALUES (
  'default',
  '2/116, Daya Sadan Main Road, Pallavan Nagar, Koyambedu, Chennai, Tamil Nadu 600107, India',
  13.0693169,
  80.1814571,
  100,
  'Asia/Kolkata',
  '10:00:00',
  150.0
) ON CONFLICT (id) DO UPDATE SET
  office_address = EXCLUDED.office_address,
  office_lat = EXCLUDED.office_lat,
  office_lng = EXCLUDED.office_lng,
  geofence_radius_meters = EXCLUDED.geofence_radius_meters,
  timezone = EXCLUDED.timezone,
  late_threshold_time = EXCLUDED.late_threshold_time,
  max_gps_accuracy_meters = EXCLUDED.max_gps_accuracy_meters;

-- 2. Create Haversine Distance Calculation Function (in metres)
CREATE OR REPLACE FUNCTION public.calculate_distance_meters(
  lat1 numeric,
  lon1 numeric,
  lat2 numeric,
  lon2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r constant numeric := 6371000; -- Earth mean radius in metres
  phi1 numeric;
  phi2 numeric;
  delta_phi numeric;
  delta_lambda numeric;
  a numeric;
  c numeric;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;

  phi1 := radians(lat1);
  phi2 := radians(lat2);
  delta_phi := radians(lat2 - lat1);
  delta_lambda := radians(lon2 - lon1);

  a := sin(delta_phi / 2.0)^2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2.0)^2;
  IF a > 1.0 THEN a := 1.0; END IF;
  c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
  RETURN round(r * c, 2);
END;
$$;

-- 3. Create attendance_records table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  check_in_time timestamptz,
  check_in_lat numeric(10, 7),
  check_in_lng numeric(10, 7),
  check_in_accuracy numeric,
  check_in_distance_meters numeric,
  check_out_time timestamptz,
  check_out_lat numeric(10, 7),
  check_out_lng numeric(10, 7),
  check_out_accuracy numeric,
  check_out_distance_meters numeric,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'incomplete', 'absent', 'half_day')),
  verification_status text NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'flagged', 'rejected', 'manual_override')),
  verification_notes text,
  is_corrected boolean NOT NULL DEFAULT false,
  corrected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  corrected_at timestamptz,
  correction_reason text,
  original_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendance_employee_date UNIQUE (profile_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_profile_date ON public.attendance_records(profile_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance_records(status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Policies for attendance_settings
DROP POLICY IF EXISTS "active employees can read attendance_settings" ON public.attendance_settings;
CREATE POLICY "active employees can read attendance_settings"
  ON public.attendance_settings FOR SELECT TO authenticated
  USING (public.is_active_employee());

DROP POLICY IF EXISTS "admins can update attendance_settings" ON public.attendance_settings;
CREATE POLICY "admins can update attendance_settings"
  ON public.attendance_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policies for attendance_records
-- Employees can view only their own records; Admins can view all team records
DROP POLICY IF EXISTS "employees and admins can read attendance_records" ON public.attendance_records;
CREATE POLICY "employees and admins can read attendance_records"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    public.is_admin() OR (profile_id = auth.uid() AND public.is_active_employee())
  );

-- Direct client INSERT/UPDATE/DELETE are blocked. Attendance must be recorded via verified RPCs.
-- Admins can update for auditable corrections through admin_correct_attendance or with admin check.
DROP POLICY IF EXISTS "prevent client insert on attendance_records" ON public.attendance_records;
CREATE POLICY "prevent client insert on attendance_records"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "prevent client update on attendance_records" ON public.attendance_records;
CREATE POLICY "prevent client update on attendance_records"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "prevent client delete on attendance_records" ON public.attendance_records;
CREATE POLICY "prevent client delete on attendance_records"
  ON public.attendance_records FOR DELETE TO authenticated
  USING (false);

-- 5. Secure Backend Check-In Function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.record_attendance_check_in(
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_settings public.attendance_settings%ROWTYPE;
  v_distance numeric;
  v_today date;
  v_local_time time;
  v_status text;
  v_verification_status text := 'verified';
  v_notes text;
  v_record public.attendance_records%ROWTYPE;
BEGIN
  -- 1. Authenticate user identity strictly from session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. No active session found.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Access denied. Account is inactive or does not exist.';
  END IF;

  -- 2. Validate coordinates
  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'GPS coordinates are required for attendance verification.';
  END IF;

  IF p_latitude < -90.0 OR p_latitude > 90.0 OR p_longitude < -180.0 OR p_longitude > 180.0 THEN
    RAISE EXCEPTION 'Invalid GPS coordinate bounds.';
  END IF;

  -- 3. Load office settings
  SELECT * INTO v_settings FROM public.attendance_settings WHERE id = 'default' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Office attendance settings are unconfigured.';
  END IF;

  -- 4. Check reported GPS accuracy
  IF p_accuracy IS NOT NULL AND p_accuracy > v_settings.max_gps_accuracy_meters THEN
    RAISE EXCEPTION 'GPS accuracy is too low (reported accuracy: ±% m, required: ±% m). Please enable high accuracy or move closer to an open window.',
      round(p_accuracy), round(v_settings.max_gps_accuracy_meters);
  END IF;

  -- 5. Calculate distance to registered office using server-side Haversine formula
  v_distance := public.calculate_distance_meters(p_latitude, p_longitude, v_settings.office_lat, v_settings.office_lng);

  -- 6. Enforce geofence rule (100 metres)
  IF v_distance > v_settings.geofence_radius_meters THEN
    RAISE EXCEPTION 'Check-in rejected: You are % metres away from the registered office. Attendance is only accepted within % metres of %.',
      round(v_distance), v_settings.geofence_radius_meters, v_settings.office_address;
  END IF;

  -- 7. Calculate authoritative server local date & time in configured timezone
  v_today := (now() AT TIME ZONE v_settings.timezone)::date;
  v_local_time := (now() AT TIME ZONE v_settings.timezone)::time;

  -- 8. Enforce single check-in per local calendar date
  SELECT * INTO v_record FROM public.attendance_records
  WHERE profile_id = v_user_id AND attendance_date = v_today;

  IF FOUND AND v_record.check_in_time IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate check-in rejected: You have already checked in today at % (IST).',
      to_char(v_record.check_in_time AT TIME ZONE v_settings.timezone, 'HH12:MI AM');
  END IF;

  -- 9. Determine status based on configurable late arrival threshold
  IF v_local_time > v_settings.late_threshold_time THEN
    v_status := 'late';
    v_notes := format('Late check-in at %s (Threshold: %s)',
      to_char(v_local_time, 'HH12:MI AM'), to_char(v_settings.late_threshold_time, 'HH12:MI AM'));
  ELSE
    v_status := 'present';
    v_notes := 'Verified office check-in on time';
  END IF;

  IF p_accuracy > 80.0 THEN
    v_verification_status := 'flagged';
    v_notes := v_notes || format(' [Marginal GPS accuracy: ±%s m]', round(p_accuracy));
  END IF;

  -- 10. Upsert attendance record with authoritative server timestamp
  INSERT INTO public.attendance_records (
    profile_id,
    attendance_date,
    check_in_time,
    check_in_lat,
    check_in_lng,
    check_in_accuracy,
    check_in_distance_meters,
    status,
    verification_status,
    verification_notes,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_today,
    now(),
    p_latitude,
    p_longitude,
    p_accuracy,
    v_distance,
    v_status,
    v_verification_status,
    v_notes,
    now(),
    now()
  )
  ON CONFLICT (profile_id, attendance_date) DO UPDATE SET
    check_in_time = now(),
    check_in_lat = EXCLUDED.check_in_lat,
    check_in_lng = EXCLUDED.check_in_lng,
    check_in_accuracy = EXCLUDED.check_in_accuracy,
    check_in_distance_meters = EXCLUDED.check_in_distance_meters,
    status = EXCLUDED.status,
    verification_status = EXCLUDED.verification_status,
    verification_notes = EXCLUDED.verification_notes,
    updated_at = now()
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Checked in successfully as %s (%s metres from office).', v_status, round(v_distance)),
    'record', row_to_json(v_record)
  );
END;
$$;

-- 6. Secure Backend Check-Out Function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.record_attendance_check_out(
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_settings public.attendance_settings%ROWTYPE;
  v_distance numeric;
  v_today date;
  v_record public.attendance_records%ROWTYPE;
BEGIN
  -- 1. Authenticate user identity strictly from session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. No active session found.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Access denied. Account is inactive or does not exist.';
  END IF;

  -- 2. Validate coordinates
  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'GPS coordinates are required for attendance verification.';
  END IF;

  IF p_latitude < -90.0 OR p_latitude > 90.0 OR p_longitude < -180.0 OR p_longitude > 180.0 THEN
    RAISE EXCEPTION 'Invalid GPS coordinate bounds.';
  END IF;

  -- 3. Load office settings
  SELECT * INTO v_settings FROM public.attendance_settings WHERE id = 'default' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Office attendance settings are unconfigured.';
  END IF;

  -- 4. Check accuracy
  IF p_accuracy IS NOT NULL AND p_accuracy > v_settings.max_gps_accuracy_meters THEN
    RAISE EXCEPTION 'GPS accuracy is too low (reported accuracy: ±% m, required: ±% m).',
      round(p_accuracy), round(v_settings.max_gps_accuracy_meters);
  END IF;

  -- 5. Calculate distance from office
  v_distance := public.calculate_distance_meters(p_latitude, p_longitude, v_settings.office_lat, v_settings.office_lng);

  -- 6. Enforce geofence rule (100 metres)
  IF v_distance > v_settings.geofence_radius_meters THEN
    RAISE EXCEPTION 'Check-out rejected: You are % metres away from the registered office. Check-out is only permitted within % metres.',
      round(v_distance), v_settings.geofence_radius_meters;
  END IF;

  -- 7. Find today's check-in record
  v_today := (now() AT TIME ZONE v_settings.timezone)::date;

  SELECT * INTO v_record FROM public.attendance_records
  WHERE profile_id = v_user_id AND attendance_date = v_today;

  IF NOT FOUND OR v_record.check_in_time IS NULL THEN
    RAISE EXCEPTION 'Check-out rejected: You have not checked in today. A valid check-in is required before checking out.';
  END IF;

  IF v_record.check_out_time IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate check-out rejected: You have already checked out today at % (IST).',
      to_char(v_record.check_out_time AT TIME ZONE v_settings.timezone, 'HH12:MI AM');
  END IF;

  -- 8. Record check-out with authoritative server timestamp
  UPDATE public.attendance_records
  SET check_out_time = now(),
      check_out_lat = p_latitude,
      check_out_lng = p_longitude,
      check_out_accuracy = p_accuracy,
      check_out_distance_meters = v_distance,
      updated_at = now()
  WHERE id = v_record.id
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Checked out successfully (%s metres from office).', round(v_distance)),
    'record', row_to_json(v_record)
  );
END;
$$;

-- 7. Secure Auditable Admin Attendance Correction Function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_correct_attendance(
  p_record_id uuid,
  p_status text,
  p_check_in_time timestamptz,
  p_check_out_time timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_old_record public.attendance_records%ROWTYPE;
  v_new_record public.attendance_records%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  -- Verify admin role
  v_admin_id := auth.uid();
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required to perform attendance corrections.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A detailed correction reason (minimum 5 characters) is mandatory for audit compliance.';
  END IF;

  SELECT * INTO v_old_record FROM public.attendance_records WHERE id = p_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found.';
  END IF;

  -- Build audit snapshot preserving original evidence
  v_snapshot := jsonb_build_object(
    'recorded_at', now(),
    'modified_by', v_admin_id,
    'original_status', v_old_record.status,
    'original_check_in_time', v_old_record.check_in_time,
    'original_check_out_time', v_old_record.check_out_time,
    'original_check_in_lat', v_old_record.check_in_lat,
    'original_check_in_lng', v_old_record.check_in_lng,
    'original_check_in_distance_meters', v_old_record.check_in_distance_meters,
    'original_verification_status', v_old_record.verification_status,
    'original_notes', v_old_record.verification_notes,
    'reason', p_reason
  );

  UPDATE public.attendance_records
  SET status = COALESCE(p_status, status),
      check_in_time = COALESCE(p_check_in_time, check_in_time),
      check_out_time = COALESCE(p_check_out_time, check_out_time),
      is_corrected = true,
      corrected_by = v_admin_id,
      corrected_at = now(),
      correction_reason = p_reason,
      verification_status = 'manual_override',
      original_data = CASE
        WHEN original_data IS NULL THEN jsonb_build_array(v_snapshot)
        ELSE original_data || v_snapshot
      END,
      updated_at = now()
  WHERE id = p_record_id
  RETURNING * INTO v_new_record;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Attendance record corrected and audited successfully.',
    'record', row_to_json(v_new_record)
  );
END;
$$;

-- 8. Secure Admin Function to Manually Create Attendance (e.g. for approved leave/on-duty)
CREATE OR REPLACE FUNCTION public.admin_create_attendance_record(
  p_employee_id uuid,
  p_attendance_date date,
  p_status text,
  p_check_in_time timestamptz,
  p_check_out_time timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_record public.attendance_records%ROWTYPE;
BEGIN
  v_admin_id := auth.uid();
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required to manually register attendance.';
  END IF;

  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee profile ID is required.';
  END IF;

  IF p_attendance_date IS NULL THEN
    RAISE EXCEPTION 'Attendance date is required.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A detailed creation reason (minimum 5 characters) is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_employee_id) THEN
    RAISE EXCEPTION 'Employee profile not found.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.attendance_records WHERE profile_id = p_employee_id AND attendance_date = p_attendance_date) THEN
    RAISE EXCEPTION 'An attendance record already exists for this employee on %. Please use the correction tool to modify existing records.', p_attendance_date;
  END IF;

  INSERT INTO public.attendance_records (
    profile_id,
    attendance_date,
    check_in_time,
    check_out_time,
    status,
    verification_status,
    verification_notes,
    is_corrected,
    corrected_by,
    corrected_at,
    correction_reason,
    original_data,
    created_at,
    updated_at
  ) VALUES (
    p_employee_id,
    p_attendance_date,
    p_check_in_time,
    p_check_out_time,
    COALESCE(p_status, 'present'),
    'manual_override',
    format('Manual entry created by Admin: %s', p_reason),
    true,
    v_admin_id,
    now(),
    p_reason,
    jsonb_build_array(jsonb_build_object(
      'created_manually', true,
      'created_by', v_admin_id,
      'reason', p_reason,
      'created_at', now()
    )),
    now(),
    now()
  )
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Attendance record created successfully.',
    'record', row_to_json(v_record)
  );
END;
$$;

-- 9. Grants
GRANT EXECUTE ON FUNCTION public.calculate_distance_meters(numeric, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance_check_in(numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance_check_out(numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_correct_attendance(uuid, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_attendance_record(uuid, date, text, timestamptz, timestamptz, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_attendance_check_in(numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_attendance_check_out(numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_correct_attendance(uuid, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_attendance_record(uuid, date, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;

COMMIT;
