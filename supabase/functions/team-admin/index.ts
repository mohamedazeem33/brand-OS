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
const TAHA_PAGE_ID = "104523992487431";
const FORM_ID_REGEX = /^\d{14,18}$/;

interface VerifiedMetaLeadForm {
  id: string;
  name: string;
  meta_form_name: string;
  status: "active" | "inactive";
  page_id: string;
  verified_page_id: string;
  verified_at: string;
  verified_by: string;
  verification_sig: string;
  source_url?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Deterministic Canonical JSON stringification for HMAC signing.
 * Strictly ordered keys (ASCII order):
 * id, meta_form_name, status, verified_at, verified_by, verified_page_id
 */
function canonicalizeFormPayload(data: {
  id: string;
  meta_form_name: string;
  status: "active" | "inactive";
  verified_at: string;
  verified_by: string;
  verified_page_id: string;
}): string {
  return JSON.stringify({
    id: String(data.id || "").trim(),
    meta_form_name: String(data.meta_form_name || "").trim(),
    status: data.status,
    verified_at: String(data.verified_at || "").trim(),
    verified_by: String(data.verified_by || "").trim(),
    verified_page_id: String(data.verified_page_id || "").trim(),
  });
}

/**
 * Computes HMAC-SHA256 hex signature using Web Crypto API.
 */
async function computeFormRegistryHmac(
  canonicalPayload: string,
  secretKey: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonicalPayload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extracts 14-18 digit Meta Form ID from URLs, query params, or direct numeric string.
 */
function extractFormId(input: string): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (FORM_ID_REGEX.test(raw)) return raw;

  const qMatch = raw.match(/[?&](?:id|form_id|selected_form_id)=(\d{14,18})/i);
  if (qMatch) return qMatch[1];

  const pMatch = raw.match(/\/(?:forms|leadgen)\/(\d{14,18})/i);
  if (pMatch) return pMatch[1];

  if (/facebook\.com|fb\.me|meta\.com|instagram\.com/i.test(raw)) {
    const fbMatch = raw.match(/\b(\d{14,18})\b/);
    if (fbMatch) return fbMatch[1];
  }

  return null;
}

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

    // PATCH — employee account management OR Meta Lead Form management
    if (req.method === "PATCH") {
      const body = await req.json();

      // ==========================================
      // Meta Lead Form Registry Actions (Admin-only)
      // ==========================================

      // 1. Verify with Meta Graph API v26.0 and Register Form
      if (body.action === "verify_and_register_meta_form") {
        const rawUrl = typeof body.form_url === "string" ? body.form_url.trim() : (typeof body.form_id === "string" ? body.form_id.trim() : "");
        const customName = typeof body.custom_name === "string" ? body.custom_name.trim() : "";

        if (!rawUrl) return errorResponse("Meta Instant Form URL or Form ID is required.", 400);

        const formId = extractFormId(rawUrl);
        if (!formId || !FORM_ID_REGEX.test(formId)) {
          return errorResponse("Could not detect a valid 14-18 digit Meta Form ID from the provided link.", 400);
        }

        // Require META_FORM_REGISTRY_HMAC_SECRET (Fail-closed)
        const hmacSecret = Deno.env.get("META_FORM_REGISTRY_HMAC_SECRET")?.trim();
        if (!hmacSecret) {
          return errorResponse(
            "Cryptographic signing key (META_FORM_REGISTRY_HMAC_SECRET) is not configured in Supabase Secrets. Cannot register form without cryptographic sealing.",
            500
          );
        }

        // Check if META_PAGE_ACCESS_TOKEN is configured
        const metaToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
        if (!metaToken || !metaToken.trim()) {
          // Rule: If a real Meta API verification requires a token that is not available locally,
          // implement the backend integration safely and report that live verification remains pending.
          // Do not fake a successful verification.
          return json({
            success: false,
            verified: false,
            error: "Meta verification token (META_PAGE_ACCESS_TOKEN) is not configured in Supabase Secrets. Live Meta Graph API verification remains pending.",
            form_id: formId,
          }, 503);
        }

        // Live verification with Meta Graph API v26.0
        const metaApiUrl = `https://graph.facebook.com/v26.0/${formId}?fields=id,name,status,page{id,name}&access_token=${encodeURIComponent(metaToken.trim())}`;
        let metaData: any;
        try {
          const metaRes = await fetch(metaApiUrl);
          metaData = await metaRes.json();
          if (!metaRes.ok || metaData.error) {
            const errMsg = metaData.error?.message || `Meta Graph API returned HTTP ${metaRes.status}`;
            return errorResponse(`Meta verification failed: ${errMsg}`, 400);
          }
        } catch (fetchErr: any) {
          console.error("Meta Graph API fetch exception:", fetchErr);
          return errorResponse(`Failed to connect to Meta Graph API: ${fetchErr.message || fetchErr}`, 502);
        }

        // Verify Page ownership
        const pageId = metaData.page?.id ? String(metaData.page.id).trim() : null;
        const pageName = metaData.page?.name ? String(metaData.page.name).trim() : "Unknown Page";
        if (pageId !== TAHA_PAGE_ID) {
          return errorResponse(
            `Form verification failed: Form belongs to Page '${pageId}' (${pageName}), not Taha Media Page (${TAHA_PAGE_ID}).`,
            400
          );
        }

        // Verify Status is ACTIVE
        const formStatus = metaData.status ? String(metaData.status).trim().toUpperCase() : "";
        if (formStatus !== "ACTIVE") {
          return errorResponse(
            `Form verification failed: Form status is '${formStatus}'. Only ACTIVE Meta Instant Forms can be registered.`,
            400
          );
        }

        const metaFormName = metaData.name ? String(metaData.name).trim() : (customName || "Taha Media Form");
        const displayName = customName || metaFormName;
        const nowIso = new Date().toISOString();

        // Sign with META_FORM_REGISTRY_HMAC_SECRET
        const payloadToSign = canonicalizeFormPayload({
          id: formId,
          meta_form_name: metaFormName,
          status: "active",
          verified_at: nowIso,
          verified_by: admin.id,
          verified_page_id: TAHA_PAGE_ID,
        });

        const verificationSig = await computeFormRegistryHmac(payloadToSign, hmacSecret);
        if (!verificationSig) {
          return errorResponse("Failed to compute cryptographic signature for form.", 500);
        }

        // Fetch existing forms array targeting default row
        let settingsRow: any = null;
        let targetSettingsId = "default";
        const { data: defaultRow, error: defaultErr } = await supabase
          .from("agency_settings")
          .select("id, meta_lead_forms")
          .eq("id", "default")
          .maybeSingle();

        if (!defaultErr && defaultRow) {
          settingsRow = defaultRow;
          targetSettingsId = defaultRow.id;
        } else {
          const { data: fallbackRow, error: fallbackErr } = await supabase
            .from("agency_settings")
            .select("id, meta_lead_forms")
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (fallbackErr) {
            return errorResponse("Failed to read agency settings: " + fallbackErr.message, 500);
          }
          settingsRow = fallbackRow;
          if (fallbackRow?.id) targetSettingsId = fallbackRow.id;
        }

        const existingForms: VerifiedMetaLeadForm[] = Array.isArray(settingsRow?.meta_lead_forms)
          ? settingsRow.meta_lead_forms
          : [];

        // Check if form already exists
        const existingIdx = existingForms.findIndex((f) => String(f.id).trim() === formId);
        const newRecord: VerifiedMetaLeadForm = {
          id: formId,
          name: displayName,
          meta_form_name: metaFormName,
          status: "active",
          page_id: TAHA_PAGE_ID,
          verified_page_id: TAHA_PAGE_ID,
          verified_at: nowIso,
          verified_by: admin.id,
          verification_sig: verificationSig,
          source_url: rawUrl.startsWith("http") ? rawUrl : undefined,
          created_at: existingIdx >= 0 ? existingForms[existingIdx].created_at || nowIso : nowIso,
          updated_at: nowIso,
        };

        let updatedList: VerifiedMetaLeadForm[];
        if (existingIdx >= 0) {
          updatedList = [...existingForms];
          updatedList[existingIdx] = newRecord;
        } else {
          updatedList = [...existingForms, newRecord];
        }

        // Update agency_settings with service_role client
        const { error: updateErr } = await supabase
          .from("agency_settings")
          .update({
            meta_lead_forms: updatedList,
            updated_at: nowIso,
            updated_by: admin.id,
          })
          .eq("id", targetSettingsId);

        if (updateErr) {
          return errorResponse("Failed to save verified form to registry: " + updateErr.message, 500);
        }

        return json({
          success: true,
          verified: true,
          message: `Form '${displayName}' verified with Meta Page ${TAHA_PAGE_ID} and registered successfully.`,
          form: newRecord,
          forms: updatedList,
        });
      }

      // 2. Set Status (Activate / Deactivate) with HMAC re-signing & tamper check
      if (body.action === "set_meta_form_status") {
        const formId = typeof body.form_id === "string" ? body.form_id.trim() : "";
        const nextStatus = body.status === "active" ? "active" : (body.status === "inactive" ? "inactive" : null);

        if (!formId || !FORM_ID_REGEX.test(formId)) {
          return errorResponse("Valid Form ID is required.", 400);
        }
        if (!nextStatus) {
          return errorResponse("status must be 'active' or 'inactive'.", 400);
        }

        const hmacSecret = Deno.env.get("META_FORM_REGISTRY_HMAC_SECRET")?.trim();
        if (!hmacSecret) {
          return errorResponse(
            "Cryptographic signing key (META_FORM_REGISTRY_HMAC_SECRET) is not configured in Supabase Secrets. Cannot update form status.",
            500
          );
        }

        let settingsRow: any = null;
        let targetSettingsId = "default";
        const { data: defaultRow, error: defaultErr } = await supabase
          .from("agency_settings")
          .select("id, meta_lead_forms")
          .eq("id", "default")
          .maybeSingle();

        if (!defaultErr && defaultRow) {
          settingsRow = defaultRow;
          targetSettingsId = defaultRow.id;
        } else {
          const { data: fallbackRow, error: fallbackErr } = await supabase
            .from("agency_settings")
            .select("id, meta_lead_forms")
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (fallbackErr) return errorResponse("Failed to read agency settings: " + fallbackErr.message, 500);
          settingsRow = fallbackRow;
          if (fallbackRow?.id) targetSettingsId = fallbackRow.id;
        }

        const existingForms: VerifiedMetaLeadForm[] = Array.isArray(settingsRow?.meta_lead_forms)
          ? settingsRow.meta_lead_forms
          : [];

        const targetIdx = existingForms.findIndex((f) => String(f.id).trim() === formId);
        if (targetIdx === -1) {
          return errorResponse("Form ID not found in registry.", 404);
        }

        const target = existingForms[targetIdx];

        // Anti-tampering check: Form must have an existing valid signature before status transition
        if (!target.verification_sig || typeof target.verification_sig !== "string" || !target.verification_sig.trim()) {
          return errorResponse(
            "Cannot update status: Form record is unsigned or missing cryptographic verification. It must be re-verified through Meta Graph API before activating.",
            403
          );
        }

        const existingCanonical = canonicalizeFormPayload({
          id: target.id,
          meta_form_name: target.meta_form_name || target.name,
          status: target.status,
          verified_at: target.verified_at,
          verified_by: target.verified_by,
          verified_page_id: target.verified_page_id || TAHA_PAGE_ID,
        });
        const expectedExistingSig = await computeFormRegistryHmac(existingCanonical, hmacSecret);
        if (!secureCompare(target.verification_sig.trim(), expectedExistingSig)) {
          return errorResponse(
            "Cannot update status: Form record failed cryptographic integrity check. Possible database tampering detected.",
            403
          );
        }

        const nowIso = new Date().toISOString();
        const payloadToSign = canonicalizeFormPayload({
          id: target.id,
          meta_form_name: target.meta_form_name || target.name,
          status: nextStatus,
          verified_at: target.verified_at || nowIso,
          verified_by: admin.id,
          verified_page_id: target.verified_page_id || TAHA_PAGE_ID,
        });
        const newSig = await computeFormRegistryHmac(payloadToSign, hmacSecret);

        const updatedRecord: VerifiedMetaLeadForm = {
          ...target,
          status: nextStatus,
          verification_sig: newSig,
          updated_at: nowIso,
        };

        const updatedList = [...existingForms];
        updatedList[targetIdx] = updatedRecord;

        const { error: updateErr } = await supabase
          .from("agency_settings")
          .update({
            meta_lead_forms: updatedList,
            updated_at: nowIso,
            updated_by: admin.id,
          })
          .eq("id", targetSettingsId);

        if (updateErr) return errorResponse("Failed to update form status: " + updateErr.message, 500);

        return json({
          success: true,
          message: `Form '${target.name}' status set to ${nextStatus}.`,
          form: updatedRecord,
          forms: updatedList,
        });
      }

      // 3. Rename Form Custom Display Label
      if (body.action === "rename_meta_form") {
        const formId = typeof body.form_id === "string" ? body.form_id.trim() : "";
        const newName = typeof body.new_name === "string" ? body.new_name.trim() : "";

        if (!formId || !FORM_ID_REGEX.test(formId)) return errorResponse("Valid Form ID is required.", 400);
        if (!newName) return errorResponse("New form name is required.", 400);

        let settingsRow: any = null;
        let targetSettingsId = "default";
        const { data: defaultRow, error: defaultErr } = await supabase
          .from("agency_settings")
          .select("id, meta_lead_forms")
          .eq("id", "default")
          .maybeSingle();

        if (!defaultErr && defaultRow) {
          settingsRow = defaultRow;
          targetSettingsId = defaultRow.id;
        } else {
          const { data: fallbackRow, error: fallbackErr } = await supabase
            .from("agency_settings")
            .select("id, meta_lead_forms")
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (fallbackErr) return errorResponse("Failed to read agency settings: " + fallbackErr.message, 500);
          settingsRow = fallbackRow;
          if (fallbackRow?.id) targetSettingsId = fallbackRow.id;
        }

        const existingForms: VerifiedMetaLeadForm[] = Array.isArray(settingsRow?.meta_lead_forms)
          ? settingsRow.meta_lead_forms
          : [];

        const targetIdx = existingForms.findIndex((f) => String(f.id).trim() === formId);
        if (targetIdx === -1) return errorResponse("Form ID not found in registry.", 404);

        const target = existingForms[targetIdx];
        const hmacSecret = Deno.env.get("META_FORM_REGISTRY_HMAC_SECRET")?.trim();
        if (hmacSecret && target.verification_sig) {
          const existingCanonical = canonicalizeFormPayload({
            id: target.id,
            meta_form_name: target.meta_form_name || target.name,
            status: target.status,
            verified_at: target.verified_at,
            verified_by: target.verified_by,
            verified_page_id: target.verified_page_id || TAHA_PAGE_ID,
          });
          const expectedExistingSig = await computeFormRegistryHmac(existingCanonical, hmacSecret);
          if (!secureCompare(target.verification_sig.trim(), expectedExistingSig)) {
            return errorResponse(
              "Cannot rename form: Form record failed cryptographic integrity check.",
              403
            );
          }
        }

        const nowIso = new Date().toISOString();
        const updatedRecord: VerifiedMetaLeadForm = {
          ...target,
          name: newName,
          updated_at: nowIso,
        };

        const updatedList = [...existingForms];
        updatedList[targetIdx] = updatedRecord;

        const { error: updateErr } = await supabase
          .from("agency_settings")
          .update({
            meta_lead_forms: updatedList,
            updated_at: nowIso,
            updated_by: admin.id,
          })
          .eq("id", targetSettingsId);

        if (updateErr) return errorResponse("Failed to rename form: " + updateErr.message, 500);

        return json({
          success: true,
          message: `Form renamed to '${newName}'.`,
          form: updatedRecord,
          forms: updatedList,
        });
      }

      // 4. Remove Form (Archives to inactive with HMAC sealing to preserve attribution)
      if (body.action === "remove_meta_form") {
        const formId = typeof body.form_id === "string" ? body.form_id.trim() : "";
        if (!formId || !FORM_ID_REGEX.test(formId)) return errorResponse("Valid Form ID is required.", 400);

        const hmacSecret = Deno.env.get("META_FORM_REGISTRY_HMAC_SECRET")?.trim();
        if (!hmacSecret) {
          return errorResponse("Cryptographic signing key is not configured in Supabase Secrets.", 500);
        }

        let settingsRow: any = null;
        let targetSettingsId = "default";
        const { data: defaultRow, error: defaultErr } = await supabase
          .from("agency_settings")
          .select("id, meta_lead_forms")
          .eq("id", "default")
          .maybeSingle();

        if (!defaultErr && defaultRow) {
          settingsRow = defaultRow;
          targetSettingsId = defaultRow.id;
        } else {
          const { data: fallbackRow, error: fallbackErr } = await supabase
            .from("agency_settings")
            .select("id, meta_lead_forms")
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (fallbackErr) return errorResponse("Failed to read agency settings: " + fallbackErr.message, 500);
          settingsRow = fallbackRow;
          if (fallbackRow?.id) targetSettingsId = fallbackRow.id;
        }

        const existingForms: VerifiedMetaLeadForm[] = Array.isArray(settingsRow?.meta_lead_forms)
          ? settingsRow.meta_lead_forms
          : [];

        const targetIdx = existingForms.findIndex((f) => String(f.id).trim() === formId);
        if (targetIdx === -1) return errorResponse("Form ID not found in registry.", 404);

        const target = existingForms[targetIdx];
        if (target.verification_sig) {
          const existingCanonical = canonicalizeFormPayload({
            id: target.id,
            meta_form_name: target.meta_form_name || target.name,
            status: target.status,
            verified_at: target.verified_at,
            verified_by: target.verified_by,
            verified_page_id: target.verified_page_id || TAHA_PAGE_ID,
          });
          const expectedExistingSig = await computeFormRegistryHmac(existingCanonical, hmacSecret);
          if (!secureCompare(target.verification_sig.trim(), expectedExistingSig)) {
            return errorResponse(
              "Cannot deactivate form: Form record failed cryptographic integrity check.",
              403
            );
          }
        }

        const nowIso = new Date().toISOString();
        const payloadToSign = canonicalizeFormPayload({
          id: target.id,
          meta_form_name: target.meta_form_name || target.name,
          status: "inactive",
          verified_at: target.verified_at || nowIso,
          verified_by: admin.id,
          verified_page_id: target.verified_page_id || TAHA_PAGE_ID,
        });
        const newSig = await computeFormRegistryHmac(payloadToSign, hmacSecret);

        const updatedRecord: VerifiedMetaLeadForm = {
          ...target,
          status: "inactive",
          verification_sig: newSig,
          updated_at: nowIso,
        };

        const updatedList = [...existingForms];
        updatedList[targetIdx] = updatedRecord;

        const { error: updateErr } = await supabase
          .from("agency_settings")
          .update({
            meta_lead_forms: updatedList,
            updated_at: nowIso,
            updated_by: admin.id,
          })
          .eq("id", targetSettingsId);

        if (updateErr) return errorResponse("Failed to deactivate form: " + updateErr.message, 500);

        return json({
          success: true,
          message: `Form '${existingForms[targetIdx].name}' deactivated and removed from active list.`,
          forms: updatedList,
        });
      }

        if (updateErr) return errorResponse("Failed to deactivate form: " + updateErr.message, 500);

        return json({
          success: true,
          message: `Form '${existingForms[targetIdx].name}' deactivated and removed from active list.`,
          forms: updatedList,
        });
      }

      // ==========================================
      // Employee Account Actions (require user_id)
      // ==========================================
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
