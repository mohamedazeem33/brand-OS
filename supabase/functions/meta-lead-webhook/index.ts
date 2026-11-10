// Supabase Edge Function: meta-lead-webhook
// Receives Meta Instant Form leads from Make.com, assigns the next active
// salesperson via assign_next_salesperson(), and stores the lead in public.leads.

import { createClient } from "npm:@supabase/supabase-js@2.45.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-webhook-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400, details?: Record<string, unknown>) {
  return json({ success: false, error: message, ...details }, status);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Supported across all modern ECMAScript/Deno runtimes via TextEncoder.
 */
function secureCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const TAHA_PAGE_ID = "104523992487431";
const FORM_ID_REGEX = /^\d{14,18}$/;

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

interface MetaFieldData {
  name: string;
  values?: string[];
}

function extractFromFieldData(fieldData?: MetaFieldData[]) {
  if (!Array.isArray(fieldData)) return { name: "", phone: "", email: "", service: "", unmapped: [] };

  let name = "";
  let phone = "";
  let email = "";
  let service = "";
  const unmapped: string[] = [];

  for (const item of fieldData) {
    if (!item || !item.name) continue;
    const key = item.name.toLowerCase().trim();
    const val = Array.isArray(item.values) && item.values.length > 0 ? item.values[0].trim() : "";
    if (!val) continue;

    if (["full_name", "name"].includes(key)) {
      name = val;
    } else if (key === "first_name") {
      name = name ? `${val} ${name}`.trim() : val;
    } else if (key === "last_name") {
      name = name ? `${name} ${val}`.trim() : val;
    } else if (["phone_number", "phone", "mobile_number", "mobile", "contact_number"].includes(key)) {
      phone = val;
    } else if (["email", "email_address"].includes(key)) {
      email = val;
    } else if (["service", "service_interest", "package", "interested_in"].includes(key) || key.includes("service")) {
      service = val;
    } else {
      unmapped.push(`${item.name}: ${val}`);
    }
  }

  return { name, phone, email, service, unmapped };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed. Only POST requests are accepted.", 405);
  }

  try {
    // 1. Fail-Closed Webhook Secret Authentication
    const configuredSecret = Deno.env.get("WEBHOOK_SECRET");
    if (!configuredSecret || !configuredSecret.trim()) {
      console.error("CRITICAL: WEBHOOK_SECRET is not configured in Edge Function environment variables.");
      return errorResponse("Server configuration error: Webhook authentication is unconfigured.", 500);
    }

    const headerSecret = req.headers.get("x-webhook-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    const secretMatches =
      (headerSecret !== null && secureCompare(headerSecret.trim(), configuredSecret.trim())) ||
      (bearerSecret !== null && secureCompare(bearerSecret, configuredSecret.trim()));

    if (!secretMatches) {
      return errorResponse("Unauthorized. Invalid or missing webhook secret.", 401);
    }

    // 2. Parse Payload
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON payload.", 400);
    }

    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be a JSON object.", 400);
    }

    // 3. Extract Meta / Make Data
    const fromFieldData = extractFromFieldData(body.field_data);

    const name = (
      body.name ||
      body.full_name ||
      (body.first_name ? `${body.first_name} ${body.last_name || ""}`.trim() : "") ||
      fromFieldData.name ||
      ""
    ).trim();

    const phone = (
      body.phone ||
      body.phone_number ||
      body.mobile ||
      body.contact_number ||
      fromFieldData.phone ||
      ""
    ).trim();

    const rawEmail = (
      body.email ||
      fromFieldData.email ||
      ""
    ).trim().toLowerCase();
    const email = rawEmail || null;

    if (!name) {
      return errorResponse("Lead name is required (checked fields: name, full_name, first_name/last_name, field_data).", 400);
    }

    if (!phone) {
      return errorResponse("Lead phone number is required (checked fields: phone, phone_number, mobile, field_data).", 400);
    }

    // Service & Source mapping
    const service = (
      body.service ||
      body.service_interest ||
      body.service_name ||
      body.package ||
      fromFieldData.service ||
      "Not specified"
    ).trim();

    const ALLOWED_SOURCES = ["Meta Ads", "Referral", "Phone Call", "Other"] as const;
    let source: "Meta Ads" | "Referral" | "Phone Call" | "Other" = "Meta Ads";
    if (body.source && ALLOWED_SOURCES.includes(body.source)) {
      source = body.source;
    }

    // Meta Lead ID
    const rawMetaId = body.meta_lead_id ?? body.leadgen_id ?? body.lead_id ?? body.id ?? null;
    const metaLeadId = rawMetaId !== null && rawMetaId !== undefined ? String(rawMetaId).trim() : null;

    // Received At timestamp
    let receivedAt: string;
    const rawReceivedAt = body.received_at || body.created_time || body.timestamp;
    if (rawReceivedAt) {
      const parsedDate = new Date(rawReceivedAt);
      receivedAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    } else {
      receivedAt = new Date().toISOString();
    }

    // 4. Require & Validate Page ID (Consistency pre-filter)
    const incomingPageId = (body.page_id ?? body.pageId ?? "").toString().trim();
    if (!incomingPageId || incomingPageId !== TAHA_PAGE_ID) {
      console.warn(`[meta-lead-webhook] Discarded lead: Invalid or missing page_id '${incomingPageId}'`);
      return json({
        success: true,
        ignored: true,
        reason: "invalid_or_missing_page_id",
        message: `Lead ignored: page_id is required and must match Taha Media Page ID (${TAHA_PAGE_ID}).`,
      }, 200);
    }

    // 5. Require & Validate Form ID (Strict numeric format, NEVER substitute leadgen_id)
    const rawFormId = (body.form_id ?? body.formId ?? "").toString().trim();
    if (!rawFormId || !FORM_ID_REGEX.test(rawFormId)) {
      console.warn(`[meta-lead-webhook] Discarded lead: Invalid or missing form_id '${rawFormId}'`);
      return json({
        success: true,
        ignored: true,
        reason: "invalid_or_missing_form_id",
        message: "Lead ignored: form_id is required and must be a valid 14-18 digit numeric ID.",
      }, 200);
    }
    const incomingFormId = rawFormId;

    const supabase = adminClient();

    // 6. Whitelist & Canonical HMAC Verification (Executed BEFORE duplicate check and salesperson assignment)
    const { data: settingsRow, error: settingsErr } = await supabase
      .from("agency_settings")
      .select("meta_lead_forms")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (settingsErr) {
      console.error("Warning: Error fetching agency_settings:", settingsErr);
    }

    const approvedForms: any[] = Array.isArray(settingsRow?.meta_lead_forms) ? settingsRow.meta_lead_forms : [];
    const matchedForm = approvedForms.find((f) => String(f.id).trim() === incomingFormId) || null;

    if (!matchedForm) {
      console.warn(`[meta-lead-webhook] Discarded lead from unapproved form ID '${incomingFormId}'`);
      return json({
        success: true,
        ignored: true,
        reason: "unapproved_form",
        message: `Lead ignored: Form ID '${incomingFormId}' is not an approved Meta lead form.`,
      }, 200);
    }

    // Check if form is explicitly deactivated
    if (matchedForm.status === "inactive") {
      console.warn(`[meta-lead-webhook] Discarded lead from deactivated form ID '${incomingFormId}' (${matchedForm.name})`);
      return json({
        success: true,
        ignored: true,
        reason: "inactive_form",
        message: `Lead ignored: Form '${matchedForm.name}' (${incomingFormId}) is currently deactivated.`,
      }, 200);
    }

    // Defense-in-depth: Verify Page ID attribution stored in registry
    if (matchedForm.verified_page_id && matchedForm.verified_page_id !== TAHA_PAGE_ID) {
      console.warn(`[meta-lead-webhook] Discarded lead: Form '${incomingFormId}' attributed to foreign Page '${matchedForm.verified_page_id}'`);
      return json({
        success: true,
        ignored: true,
        reason: "invalid_form_page_attribution",
        message: `Lead ignored: Form '${incomingFormId}' belongs to an unapproved Page.`,
      }, 200);
    }

    // Verify HMAC signature if record has verification_sig or if HMAC secret is configured
    const hmacSecret = Deno.env.get("META_FORM_REGISTRY_HMAC_SECRET");
    if (hmacSecret && matchedForm.verification_sig) {
      const canonicalPayload = canonicalizeFormPayload({
        id: matchedForm.id,
        meta_form_name: matchedForm.meta_form_name || matchedForm.name,
        status: matchedForm.status,
        verified_at: matchedForm.verified_at,
        verified_by: matchedForm.verified_by,
        verified_page_id: matchedForm.verified_page_id || TAHA_PAGE_ID,
      });
      const expectedSig = await computeFormRegistryHmac(canonicalPayload, hmacSecret);
      if (!secureCompare(matchedForm.verification_sig, expectedSig)) {
        console.error(`[meta-lead-webhook] SECURITY ALERT: Form '${incomingFormId}' failed canonical HMAC verification. Possible database tampering or unauthorized status modification.`);
        return json({
          success: true,
          ignored: true,
          reason: "tampered_or_unverified_form_record",
          message: `Lead ignored: Form '${incomingFormId}' failed cryptographic verification check.`,
        }, 200);
      }
    }

    if (matchedForm.status !== "active") {
      return json({
        success: true,
        ignored: true,
        reason: "inactive_form",
        message: `Lead ignored: Form '${matchedForm.name}' (${incomingFormId}) is not active.`,
      }, 200);
    }

    // 7. Duplicate Check by meta_lead_id (Executed AFTER whitelist verification)
    if (metaLeadId) {
      const { data: existingLead, error: lookupErr } = await supabase
        .from("leads")
        .select("id, name, phone, email, source, service, status, assigned_to, meta_lead_id, created_at")
        .eq("meta_lead_id", metaLeadId)
        .maybeSingle();

      if (lookupErr) {
        console.error("Error checking duplicate lead:", lookupErr);
      } else if (existingLead) {
        return json({
          success: true,
          duplicate: true,
          message: `Lead with meta_lead_id '${metaLeadId}' already exists. No duplicate created.`,
          lead: existingLead,
        }, 200);
      }
    }

    // 6. Compile Notes with Meta form & campaign metadata
    const notesParts: string[] = [];
    if (body.notes && typeof body.notes === "string" && body.notes.trim()) {
      notesParts.push(body.notes.trim());
    }

    const metaContext: string[] = [];
    const formDisplayName = matchedForm?.name || body.form_name;
    if (formDisplayName) metaContext.push(`Form: ${formDisplayName}`);
    if (incomingFormId) metaContext.push(`Form ID: ${incomingFormId}`);
    const pageIdentifier = body.page_id || matchedForm?.page_id;
    if (pageIdentifier) metaContext.push(`Page ID: ${pageIdentifier}`);
    if (body.campaign_name) metaContext.push(`Campaign: ${body.campaign_name}`);
    if (body.campaign_id) metaContext.push(`Campaign ID: ${body.campaign_id}`);
    if (body.ad_name) metaContext.push(`Ad: ${body.ad_name}`);
    if (body.adset_name) metaContext.push(`Adset: ${body.adset_name}`);
    if (fromFieldData.unmapped.length > 0) {
      metaContext.push(...fromFieldData.unmapped);
    }

    if (metaContext.length > 0) {
      if (notesParts.length > 0) notesParts.push("");
      notesParts.push("--- Meta Form Data ---");
      notesParts.push(...metaContext);
    }
    const compiledNotes = notesParts.join("\n");

    // 5. Salesperson Round-Robin Assignment
    let assignedTo: string | null = null;
    if (body.assigned_to && typeof body.assigned_to === "string") {
      // Validate provided assigned_to
      const { data: assignedProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", body.assigned_to)
        .eq("is_active", true)
        .maybeSingle();
      if (assignedProfile) {
        assignedTo = assignedProfile.id;
      }
    }

    if (!assignedTo) {
      const { data: nextSalesId, error: rpcError } = await supabase.rpc("assign_next_salesperson");
      if (rpcError) {
        console.error("Warning: assign_next_salesperson failed:", rpcError.message);
      } else if (nextSalesId) {
        assignedTo = nextSalesId;
      }
    }

    // 6. Creator Profile Resolution
    let createdBy: string | null = null;
    if (body.created_by && typeof body.created_by === "string") {
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", body.created_by)
        .maybeSingle();
      if (creatorProfile) {
        createdBy = creatorProfile.id;
      }
    }

    if (!createdBy) {
      // Fallback: designated active admin profile
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (adminProfile) {
        createdBy = adminProfile.id;
      }
    }

    if (!createdBy) {
      return errorResponse("Configuration error: No active admin profile found to assign as lead creator.", 500);
    }

    // 7. Insert Lead
    const insertPayload = {
      name,
      phone,
      email,
      source,
      service,
      status: "new",
      notes: compiledNotes,
      received_at: receivedAt,
      meta_lead_id: metaLeadId,
      assigned_to: assignedTo,
      created_by: createdBy,
    };

    const { data: newLead, error: insertError } = await supabase
      .from("leads")
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (insertError) {
      // Handle race condition duplicate error (code 23505)
      if (insertError.code === "23505" && metaLeadId) {
        const { data: duplicateLead } = await supabase
          .from("leads")
          .select("id, name, phone, email, source, service, status, assigned_to, meta_lead_id, created_at")
          .eq("meta_lead_id", metaLeadId)
          .maybeSingle();
        return json({
          success: true,
          duplicate: true,
          message: `Lead with meta_lead_id '${metaLeadId}' was created by a concurrent request.`,
          lead: duplicateLead,
        }, 200);
      }

      console.error("Error creating lead:", insertError);
      return errorResponse(`Could not create lead: ${insertError.message}`, 500);
    }

    return json({
      success: true,
      duplicate: false,
      message: "Lead created and assigned successfully.",
      lead: newLead,
    }, 201);

  } catch (err) {
    console.error("Unhandled webhook exception:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
});

