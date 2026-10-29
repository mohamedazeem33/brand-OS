/*
# Promote the initial Taha Media administrator

1. Purpose
- Promotes the one existing Taha Media profile identified by its authenticated user ID.
- Uses the supplied email as a second verification condition.

2. Modified Table
- `public.profiles.role`: changes only the matching profile's role from its current value to `admin`.
- `public.profiles.updated_at`: refreshes the modification timestamp for that same profile.

3. Security
- Runs through the trusted migration runner rather than the browser or an employee-facing update path.
- Does not alter RLS, grants, policies, authentication records, passwords, profile identity, or any other profile columns.
- Does not create a user, create a profile, expose an endpoint, or allow arbitrary role changes.

4. Safety Conditions
- The update is restricted to the exact authenticated user ID `7ad8282f-9d2c-44ab-abce-1d5ae3b8e089`.
- The email must also match `admin@taha.in` case-insensitively.
- If no exact matching profile exists, the migration raises an error and makes no change.
- The statement is safe to re-run for the same existing profile.
*/

DO $$
DECLARE
  matched_profile_id uuid;
BEGIN
  SELECT id
  INTO matched_profile_id
  FROM public.profiles
  WHERE id = '7ad8282f-9d2c-44ab-abce-1d5ae3b8e089'::uuid
    AND lower(email) = lower('admin@taha.in');

  IF matched_profile_id IS NULL THEN
    RAISE EXCEPTION 'No matching Taha Media profile found for the supplied ID and email';
  END IF;

  UPDATE public.profiles
  SET role = 'admin',
      updated_at = now()
  WHERE id = matched_profile_id;
END $$;
