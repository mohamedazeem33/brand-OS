/*
# Grant service_role access to profiles for the team-admin edge function

1. Purpose
- The team-admin edge function creates employee accounts and manages roles/active state
  using the service role key (which bypasses RLS).
- The service_role still needs explicit column grants to perform UPDATE on profiles.
- This migration grants the minimum privileges the edge function needs.

2. Modified Privileges
- GRANT SELECT ON profiles TO service_role — so the edge function can list employees and verify the caller's admin status.
- GRANT UPDATE (full_name, role, is_active) ON profiles TO service_role — so the edge function can set the chosen role, name, and active flag when creating or managing employees.
- No new tables, columns, policies, or RLS changes.
- The browser (authenticated/anon) client keeps its existing privileges unchanged: SELECT on profiles, UPDATE on full_name only.

3. Security
- The service_role key is never exposed to the browser; it lives only in the edge function runtime.
- Admin enforcement happens server-side inside the edge function on every request.
- Existing RLS policies and grants for the authenticated/anon roles are untouched.
*/

GRANT SELECT ON public.profiles TO service_role;
GRANT UPDATE (full_name, role, is_active) ON public.profiles TO service_role;
