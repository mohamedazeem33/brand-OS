/*
# Tighten Taha Media Phase 1 access

1. Scope
- Removes any inherited Data API privileges from the unauthenticated `anon` role.
- Removes profile write privileges from authenticated employees except the editable display name column.
- Removes remote execution access to internal helper functions from the unauthenticated role.

2. Security
- `profiles` and `leads` are reachable only by authenticated employees through their existing RLS policies.
- Employee role, active state, email, ownership, and audit fields cannot be changed through the browser.
- The internal authorization helpers remain callable only in the authenticated workspace context.

3. Important Notes
- This migration changes permissions only; it does not delete or alter user or lead data.
*/

REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

REVOKE ALL ON public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_active_employee() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
