/*
# Remove public execution from Taha Media authorization helpers

1. Scope
- Removes the default PostgreSQL PUBLIC execution grant from the two internal authorization functions.

2. Security
- Only authenticated callers can invoke the helper functions used by the internal workspace.
- Unauthenticated callers receive no function execution privilege.

3. Important Notes
- This changes function permissions only and does not modify tables or records.
*/

REVOKE EXECUTE ON FUNCTION public.is_active_employee() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
