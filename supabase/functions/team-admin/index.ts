// Team admin edge function — admin-only employee account management.
// JWT-protected: callers must pass their authenticated access token.
// All privilege checks run server-side on every request.


import { createClient } from "npm:@supabase/supabase-js@2.45.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ROLES = ["sales", "editor", "script_writer", "social_media_manager", "finance", "employee"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number) {
  return json({ error: message }, status);
}

// Create a service-role admin client (bypasses RLS, uses privileged key).
function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Verify the caller is an active admin. Returns the caller's profile or null.
async function requireAdmin(supabase: ReturnType<typeof adminClient>, jwt: string | null) {
  if (!jwt) return null;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.is_active) return null;
  return profile;
}

function randomPassword(length = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Checks for email collision across all auth users via pagination,
 * as well as pending email changes and public.profiles records.
 * Returns an error object on failure to ensure fail-closed security.
 */
async function isEmailTaken(
  supabase: ReturnType<typeof adminClient>,
  emailToCheck: string,
  excludeUserId?: string
): Promise<{ taken: boolean; error?: string }> {
  const targetEmail = emailToCheck.trim().toLowerCase();
  let page = 1;
  const perPage = 50;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("isEmailTaken: listUsers failed on page", page, error.message);
      return { taken: false, error: `Failed to verify email availability: ${error.message}` };
    }

    if (!data?.users || data.users.length === 0) break;

    for (const u of data.users) {
      if (!excludeUserId || u.id !== excludeUserId) {
        if (u.email?.toLowerCase() === targetEmail) return { taken: true };
        // Check if an unconfirmed email change is already targeting this email
        const newEmailPending = (u as { new_email?: string }).new_email;
        if (newEmailPending && newEmailPending.toLowerCase() === targetEmail) return { taken: true };
      }
    }

    if (data.users.length < perPage) break;
    page++;
  }

  // Secondary check against public.profiles
  let profileQuery = supabase.from("profiles").select("id").ilike("email", targetEmail);
  if (excludeUserId) {
    profileQuery = profileQuery.neq("id", excludeUserId);
  }
  const { data: profileMatch, error: profileErr } = await profileQuery.maybeSingle();
  if (profileErr) {
    console.error("isEmailTaken: profile lookup failed:", profileErr.message);
    return { taken: false, error: `Failed to check existing profile records: ${profileErr.message}` };
  }
  if (profileMatch) return { taken: true };

  return { taken: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const supabase = adminClient();

    const admin = await requireAdmin(supabase, jwt);
    if (!admin) return errorResponse("Admin access required.", 403);

    // POST — create a new employee account (invite flow, temp-password fallback)
    if (req.method === "POST") {
      const body = await req.json();
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const role = typeof body.role === "string" ? body.role : "";

      if (!email || !fullName) return errorResponse("Name and email are required.", 400);
      if (!ALLOWED_ROLES.includes(role)) return errorResponse("Invalid role.", 400);

      // Check for existing user with this email across all paginated users (fail-closed)
      const emailCheck = await isEmailTaken(supabase, email);
      if (emailCheck.error) return errorResponse(emailCheck.error, 500);
      if (emailCheck.taken) return errorResponse("An account with this email already exists.", 409);

      // Primary: invite flow — user sets their own password via email link.
      let inviteMethod: "invite" | "temp_password" = "invite";
      let tempPassword: string | null = null;

      const appOrigin = typeof body.app_url === "string" ? body.app_url.replace(/\/$/, "") : "";
      if (!appOrigin) return errorResponse("Application URL is required.", 400);
      const redirectTo = `${appOrigin}/auth/invite`;
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        options: { redirectTo },
      });

      if (inviteError) {
        // Fallback: create user with a random temp password, mark email confirmed.
        inviteMethod = "temp_password";
        tempPassword = randomPassword();
        const { error: createError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createError) return errorResponse("Could not create the employee account.", 500);
      }

      // The handle_new_user trigger created a profile row. Update it with the
      // admin-chosen role and full name.
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role, full_name: fullName, is_active: true })
        .eq("email", email);

      if (profileError) return errorResponse("Account created but profile setup failed. Contact support.", 500);

      return json({
        success: true,
        method: inviteMethod,
        ...(tempPassword ? { temp_password: tempPassword } : {}),
      });
    }

    // PATCH — update role, toggle active status, or update credentials
    if (req.method === "PATCH") {
      const body = await req.json();
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";

      if (!userId || !UUID_REGEX.test(userId)) {
        return errorResponse("A valid employee UUID is required.", 400);
      }

      // Fetch the target profile to ensure account exists
      const { data: target, error: fetchErr } = await supabase
        .from("profiles")
        .select("id, email, role, is_active")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr || !target) return errorResponse("Employee not found.", 404);

      // Update role
      if (body.action === "set_role") {
        const newRole = body.role;
        if (!ALLOWED_ROLES.includes(newRole)) return errorResponse("Invalid role.", 400);
        // Never allow promoting to admin through this path
        const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
        if (error) return errorResponse("Could not update the role.", 500);
        return json({ success: true });
      }

      // Toggle active
      if (body.action === "toggle_active") {
        const nextActive = !!body.is_active;

        // Prevent deactivating your own account (lockout guard)
        if (!nextActive && userId === admin.id) {
          return errorResponse("You cannot deactivate your own account.", 400);
        }

        // Prevent deactivating the last remaining active admin
        if (!nextActive && target.role === "admin") {
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "admin")
            .eq("is_active", true);
          if ((count ?? 0) <= 1) return errorResponse("Cannot deactivate the last active admin.", 400);
        }

        const { error } = await supabase.from("profiles").update({ is_active: nextActive }).eq("id", userId);
        if (error) return errorResponse("Could not update the account status.", 500);
        return json({ success: true });
      }

      // Update credentials (email and/or password)
      if (body.action === "update_credentials") {
        const rawEmail = typeof body.new_email === "string" ? body.new_email : (typeof body.email === "string" ? body.email : "");
        const rawPassword = typeof body.new_password === "string" ? body.new_password : (typeof body.password === "string" ? body.password : "");

        const newEmail = rawEmail.trim().toLowerCase();
        const newPassword = rawPassword;

        if (!newEmail && !newPassword) {
          return errorResponse("Either a new email or new password must be provided.", 400);
        }

        const updates: { email?: string; password?: string } = {};

        if (newEmail) {
          if (!EMAIL_REGEX.test(newEmail)) {
            return errorResponse("Invalid email format.", 400);
          }

          // Check if new email is already taken across all paginated users (fail-closed)
          const emailCheck = await isEmailTaken(supabase, newEmail, userId);
          if (emailCheck.error) {
            return errorResponse(emailCheck.error, 500);
          }
          if (emailCheck.taken) {
            return errorResponse("An account with this email already exists.", 409);
          }
          updates.email = newEmail;
        }

        if (newPassword) {
          if (newPassword.length < MIN_PASSWORD_LENGTH) {
            return errorResponse(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, 400);
          }
          updates.password = newPassword;
        }

        // Support explicit administrative email confirmation without email dispatch
        if (body.email_confirm === true) {
          updates.email_confirm = true;
        }

        // Update existing Supabase Auth user by UUID (never delete or recreate)
        const { data: updateRes, error: updateError } = await supabase.auth.admin.updateUserById(
          userId,
          updates
        );

        if (updateError) {
          console.error("Auth admin updateUserById failed for user:", userId, updateError.message);
          if (updateError.message?.toLowerCase().includes("already registered") || updateError.status === 422) {
            return errorResponse("An account with this email already exists.", 409);
          }
          return errorResponse(updateError.message || "Failed to update user credentials.", 400);
        }

        const updatedUser = updateRes?.user;
        const isEmailConfirmed = updatedUser?.email?.toLowerCase() === newEmail;

        // Requirement: Do not update public.profiles.email until Auth email change is fully confirmed.
        // Profile must stay consistent with the actual confirmed Auth email.
        if (newEmail && isEmailConfirmed) {
          const { error: profileSyncError } = await supabase
            .from("profiles")
            .update({ email: newEmail })
            .eq("id", userId);

          if (profileSyncError) {
            console.error("Profile email synchronization failed for user:", userId, profileSyncError.message);
            return errorResponse("Authentication updated, but profile email synchronization failed.", 500);
          }
        }

        // Distinct, accurate success messages for each scenario
        let message = "User credentials updated successfully.";
        if (newEmail && newPassword) {
          message = isEmailConfirmed
            ? "Email and password updated successfully."
            : `Password updated successfully. Email change confirmation sent to ${newEmail}.`;
        } else if (newEmail) {
          message = isEmailConfirmed
            ? "Email updated successfully."
            : `Email change confirmation sent to ${newEmail}.`;
        } else if (newPassword) {
          message = "Password updated successfully.";
        }

        return json({
          success: true,
          message,
          user_id: userId,
          email_updated: isEmailConfirmed,
          email_change_pending: !isEmailConfirmed && !!newEmail,
          password_updated: !!newPassword,
        });
      }

      return errorResponse("Unknown action.", 400);
    }

    return errorResponse("Method not allowed.", 405);
  } catch (err) {
    return errorResponse("Server error.", 500);
  }
});
