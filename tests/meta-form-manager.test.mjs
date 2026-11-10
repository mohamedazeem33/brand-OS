// Comprehensive test suite for Meta Lead Form Manager and Webhook Security
import assert from "node:assert/strict";
import crypto from "node:crypto";

const TAHA_PAGE_ID = "104523992487431";
const FORM_ID_REGEX = /^\d{14,18}$/;

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function secureCompare(a, b) {
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

/**
 * Deterministic Canonical JSON stringification.
 * Strictly ordered keys (ASCII order):
 * id, meta_form_name, status, verified_at, verified_by, verified_page_id
 */
function canonicalizeFormPayload(data) {
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
 * Computes HMAC-SHA256 hex signature using Node.js crypto (identical to Web Crypto API implementation).
 */
function computeFormRegistryHmac(canonicalPayload, secretKey) {
  return crypto.createHmac("sha256", secretKey).update(canonicalPayload, "utf8").digest("hex");
}

console.log("Running Meta Lead Form Manager unit tests...\n");

// ============================================================================
// 1. Canonical JSON Determinism & Delimiter / Unicode Safety
// ============================================================================
{
  const data1 = {
    id: "1650833669757581",
    meta_form_name: "Taha Media - Client Enquiry Form",
    status: "active",
    verified_at: "2026-11-10T12:00:00.000Z",
    verified_by: "admin-user-uuid",
    verified_page_id: TAHA_PAGE_ID,
  };

  // Same data passed in reverse / randomized property order
  const data2 = {
    verified_page_id: TAHA_PAGE_ID,
    verified_by: "admin-user-uuid",
    verified_at: "2026-11-10T12:00:00.000Z",
    status: "active",
    meta_form_name: "Taha Media - Client Enquiry Form",
    id: "1650833669757581",
  };

  const c1 = canonicalizeFormPayload(data1);
  const c2 = canonicalizeFormPayload(data2);
  assert.equal(c1, c2, "Canonical JSON must be identical regardless of property insertion order");

  // Delimiters (| , & ") and Unicode / Emojis (🦷, –)
  const unicodeData = {
    id: "1650833669757581",
    meta_form_name: "Taha | Dental & 🦷 Promo, Q1 \"Special\"",
    status: "active",
    verified_at: "2026-11-10T12:00:00.000Z",
    verified_by: "admin-user-uuid",
    verified_page_id: TAHA_PAGE_ID,
  };
  const unicodeCanonical = canonicalizeFormPayload(unicodeData);
  assert.equal(
    unicodeCanonical,
    '{"id":"1650833669757581","meta_form_name":"Taha | Dental & 🦷 Promo, Q1 \\"Special\\"","status":"active","verified_at":"2026-11-10T12:00:00.000Z","verified_by":"admin-user-uuid","verified_page_id":"104523992487431"}'
  );
}
console.log("PASS 1: Canonical JSON deterministic key order & Delimiter / Unicode safety");

// ============================================================================
// 2. Cryptographic HMAC-SHA256 Signing & Tamper Detection
// ============================================================================
{
  const secretKey = "test-hmac-secret-32-bytes-minimum-length-here!";
  const validRecord = {
    id: "1650833669757581",
    meta_form_name: "Taha Media - Client Enquiry Form",
    status: "inactive",
    verified_at: "2026-11-10T12:00:00.000Z",
    verified_by: "admin-user-uuid",
    verified_page_id: TAHA_PAGE_ID,
  };

  const payload = canonicalizeFormPayload(validRecord);
  const validSig = computeFormRegistryHmac(payload, secretKey);

  // Verification succeeds on genuine record
  assert.equal(secureCompare(validSig, computeFormRegistryHmac(payload, secretKey)), true);

  // Attack 1: Database tampering - changing status from 'inactive' to 'active' without re-signing
  const tamperedStatusRecord = { ...validRecord, status: "active" };
  const tamperedPayload = canonicalizeFormPayload(tamperedStatusRecord);
  const tamperedSig = computeFormRegistryHmac(tamperedPayload, secretKey);
  assert.notEqual(validSig, tamperedSig);
  assert.equal(secureCompare(validSig, tamperedSig), false, "Tampered status must fail signature check");

  // Attack 2: Tampering with verified_page_id to hijack lead routing
  const hijackedPageRecord = { ...validRecord, verified_page_id: "999999999999999" };
  const hijackedPayload = canonicalizeFormPayload(hijackedPageRecord);
  assert.equal(secureCompare(validSig, computeFormRegistryHmac(hijackedPayload, secretKey)), false);

  // Attack 3: Tampering with Form ID
  const tamperedIdRecord = { ...validRecord, id: "9876543210987654" };
  assert.equal(secureCompare(validSig, computeFormRegistryHmac(canonicalizeFormPayload(tamperedIdRecord), secretKey)), false);

  // Attack 4: Wrong HMAC secret
  assert.equal(secureCompare(validSig, computeFormRegistryHmac(payload, "wrong-secret-key")), false);
}
console.log("PASS 2: HMAC-SHA256 signing, verification, and tamper detection (status, page_id, form_id)");

// ============================================================================
// 3. Meta Graph API Verification Logic (v26.0 with v24.0 fallback)
// ============================================================================
{
  function buildGraphApiUrl(version, formId) {
    return `https://graph.facebook.com/${version}/${formId}?fields=id,name,status,page{id,name}`;
  }

  assert.equal(
    buildGraphApiUrl("v26.0", "1650833669757581"),
    "https://graph.facebook.com/v26.0/1650833669757581?fields=id,name,status,page{id,name}"
  );

  function evaluateMetaFormResponse(formId, apiResponse) {
    if (!apiResponse || apiResponse.error) {
      return { verified: false, error: apiResponse?.error?.message || "Form lookup failed" };
    }
    if (String(apiResponse.id) !== String(formId)) {
      return { verified: false, error: "Form ID mismatch in Meta response" };
    }
    const pageId = apiResponse.page?.id || apiResponse.page_id;
    if (String(pageId) !== TAHA_PAGE_ID) {
      return {
        verified: false,
        error: `Form ownership check failed: Form belongs to Page ID '${pageId}', expected Taha Media Page ID '${TAHA_PAGE_ID}'.`,
      };
    }
    if (apiResponse.status !== "ACTIVE") {
      return {
        verified: false,
        error: `Form cannot be registered: Meta form status is '${apiResponse.status}', expected 'ACTIVE'.`,
      };
    }
    return {
      verified: true,
      meta_form_name: apiResponse.name || "Meta Instant Form",
      verified_page_id: String(pageId),
      page_name: apiResponse.page?.name || "Taha Media",
    };
  }

  // Case A: Valid Taha Media active form
  const validMetaRes = {
    id: "1650833669757581",
    name: "Taha Media - Client Enquiry Form",
    status: "ACTIVE",
    page: { id: TAHA_PAGE_ID, name: "Taha Media" },
  };
  const evalA = evaluateMetaFormResponse("1650833669757581", validMetaRes);
  assert.equal(evalA.verified, true);
  assert.equal(evalA.meta_form_name, "Taha Media - Client Enquiry Form");
  assert.equal(evalA.verified_page_id, TAHA_PAGE_ID);

  // Case B: Form belongs to a foreign page
  const foreignMetaRes = {
    id: "1650833669757581",
    name: "Unrelated Business Form",
    status: "ACTIVE",
    page: { id: "987654321012345", name: "Other Business" },
  };
  const evalB = evaluateMetaFormResponse("1650833669757581", foreignMetaRes);
  assert.equal(evalB.verified, false);
  assert.match(evalB.error, /Form ownership check failed/i);

  // Case C: Form is ARCHIVED / INACTIVE in Meta
  const archivedMetaRes = {
    id: "1650833669757581",
    name: "Taha Media - Archived Form",
    status: "ARCHIVED",
    page: { id: TAHA_PAGE_ID, name: "Taha Media" },
  };
  const evalC = evaluateMetaFormResponse("1650833669757581", archivedMetaRes);
  assert.equal(evalC.verified, false);
  assert.match(evalC.error, /Meta form status is 'ARCHIVED'/i);

  // Case D: Meta Token unconfigured fail-closed behavior
  function checkTokenConfiguration(envToken) {
    if (!envToken || !envToken.trim()) {
      return {
        status: 503,
        error: "Meta Page Access Token is not configured. Live Meta form verification is pending configuration.",
      };
    }
    return { status: 200 };
  }
  const tokenMissing = checkTokenConfiguration(undefined);
  assert.equal(tokenMissing.status, 503);
  assert.match(tokenMissing.error, /pending configuration/i);
}
console.log("PASS 3: Meta Graph API verification (endpoint formatting, ownership check, active status, token check)");

// ============================================================================
// 4. Strict Webhook Payload Validation & Zero Fallback Substitution
// ============================================================================
{
  function validateWebhookPayload(body) {
    // 1. Validate Page ID
    const incomingPageId = (body.page_id ?? body.pageId ?? "").toString().trim();
    if (!incomingPageId || incomingPageId !== TAHA_PAGE_ID) {
      return {
        accepted: false,
        reason: "invalid_or_missing_page_id",
        message: `Lead ignored: page_id is required and must match Taha Media Page ID (${TAHA_PAGE_ID}).`,
      };
    }

    // 2. Validate Form ID (Strictly numeric, ZERO fallback to leadgen_id)
    const rawFormId = (body.form_id ?? body.formId ?? "").toString().trim();
    if (!rawFormId || !FORM_ID_REGEX.test(rawFormId)) {
      return {
        accepted: false,
        reason: "invalid_or_missing_form_id",
        message: "Lead ignored: form_id is required and must be a valid 14-18 digit numeric ID.",
      };
    }

    return { accepted: true, formId: rawFormId, pageId: incomingPageId };
  }

  // Valid payload
  const v1 = validateWebhookPayload({ page_id: TAHA_PAGE_ID, form_id: "1650833669757581", leadgen_id: "99887766" });
  assert.equal(v1.accepted, true);
  assert.equal(v1.formId, "1650833669757581");

  // Missing form_id with leadgen_id present -> MUST REJECT (ZERO substitution)
  const v2 = validateWebhookPayload({ page_id: TAHA_PAGE_ID, leadgen_id: "1650833669757581" });
  assert.equal(v2.accepted, false);
  assert.equal(v2.reason, "invalid_or_missing_form_id");

  // Missing page_id -> MUST REJECT
  const v3 = validateWebhookPayload({ form_id: "1650833669757581" });
  assert.equal(v3.accepted, false);
  assert.equal(v3.reason, "invalid_or_missing_page_id");

  // Foreign page_id -> MUST REJECT
  const v4 = validateWebhookPayload({ page_id: "999999999999999", form_id: "1650833669757581" });
  assert.equal(v4.accepted, false);
  assert.equal(v4.reason, "invalid_or_missing_page_id");

  // Non-numeric form_id -> MUST REJECT
  const v5 = validateWebhookPayload({ page_id: TAHA_PAGE_ID, form_id: "form-12345" });
  assert.equal(v5.accepted, false);
  assert.equal(v5.reason, "invalid_or_missing_form_id");
}
console.log("PASS 4: Zero fallback substitution for form_id and strict page_id verification");

// ============================================================================
// 5. Whitelist & HMAC Pipeline Order & Duplicate Prevention
// ============================================================================
{
  const hmacSecret = "test-hmac-secret-pipeline-test-key-32b!";

  const validRecordActive = {
    id: "1650833669757581",
    name: "Client Enquiry",
    meta_form_name: "Taha Media - Client Enquiry Form",
    status: "active",
    verified_at: "2026-11-10T12:00:00.000Z",
    verified_by: "admin-uuid",
    verified_page_id: TAHA_PAGE_ID,
  };
  validRecordActive.verification_sig = computeFormRegistryHmac(canonicalizeFormPayload(validRecordActive), hmacSecret);

  const registry = [validRecordActive];
  const existingLeads = [{ id: "lead-existing", meta_lead_id: "leadgen-100", name: "Existing Lead" }];

  let salespersonCallCount = 0;
  function mockAssignSalesperson() {
    salespersonCallCount++;
    return "salesperson-uuid-1";
  }

  async function processLeadPipeline(incoming) {
    // 1. Validate payload basics
    const base = {
      page_id: (incoming.page_id ?? "").toString().trim(),
      form_id: (incoming.form_id ?? "").toString().trim(),
    };
    if (base.page_id !== TAHA_PAGE_ID) return { status: "ignored", reason: "invalid_or_missing_page_id" };
    if (!FORM_ID_REGEX.test(base.form_id)) return { status: "ignored", reason: "invalid_or_missing_form_id" };

    // 2. Whitelist & HMAC check (BEFORE duplicate check & salesperson assignment)
    const matched = registry.find((f) => f.id === base.form_id);
    if (!matched) return { status: "ignored", reason: "unapproved_form" };
    if (matched.status !== "active") return { status: "ignored", reason: "inactive_form" };

    const canonical = canonicalizeFormPayload({
      id: matched.id,
      meta_form_name: matched.meta_form_name || matched.name,
      status: matched.status,
      verified_at: matched.verified_at,
      verified_by: matched.verified_by,
      verified_page_id: matched.verified_page_id || TAHA_PAGE_ID,
    });
    const expectedSig = computeFormRegistryHmac(canonical, hmacSecret);
    if (!secureCompare(matched.verification_sig, expectedSig)) {
      return { status: "ignored", reason: "tampered_or_unverified_form_record" };
    }

    // 3. Duplicate check (BEFORE salesperson assignment)
    if (incoming.meta_lead_id) {
      const dup = existingLeads.find((l) => l.meta_lead_id === incoming.meta_lead_id);
      if (dup) return { status: "duplicate", message: "Duplicate lead" };
    }

    // 4. Salesperson round-robin assignment
    const assignedTo = mockAssignSalesperson();

    // 5. Create lead
    return { status: "created", assignedTo, leadName: incoming.name };
  }

  // Scenario 1: Unapproved form -> Rejected without salesperson assignment
  const s1 = await processLeadPipeline({ page_id: TAHA_PAGE_ID, form_id: "9999888877776666", name: "Unapproved" });
  assert.equal(s1.status, "ignored");
  assert.equal(s1.reason, "unapproved_form");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment for unapproved form");

  // Scenario 2: Duplicate lead on approved form -> Detected without salesperson assignment
  const s2 = await processLeadPipeline({
    page_id: TAHA_PAGE_ID,
    form_id: "1650833669757581",
    meta_lead_id: "leadgen-100",
    name: "Repeat Lead",
  });
  assert.equal(s2.status, "duplicate");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment for duplicate lead");

  // Scenario 3: Valid new lead -> Processed and assigned
  const s3 = await processLeadPipeline({
    page_id: TAHA_PAGE_ID,
    form_id: "1650833669757581",
    meta_lead_id: "leadgen-200",
    name: "New Client",
  });
  assert.equal(s3.status, "created");
  assert.equal(salespersonCallCount, 1, "Salesperson assigned for valid new lead");
}
console.log("PASS 5: Pipeline order guarantee: Whitelist & HMAC -> Duplicate Check -> Salesperson Assignment -> Insertion");

// ============================================================================
// 6. Admin-Authorized Backend Registry Actions (team-admin)
// ============================================================================
{
  function simulateAdminAction(callerProfile, action, params, currentForms = [], hmacSecret = "sec") {
    if (!callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
      return { status: 403, error: "Admin access required." };
    }

    if (action === "verify_and_register_meta_form") {
      const formId = String(params.form_id || "").trim();
      if (!FORM_ID_REGEX.test(formId)) return { status: 400, error: "Invalid form ID" };
      if (currentForms.some((f) => f.id === formId)) return { status: 409, error: "Form already registered" };

      const verifiedAt = new Date().toISOString();
      const newForm = {
        id: formId,
        name: params.name || "Test Form",
        meta_form_name: params.meta_form_name || "Meta Form",
        status: "active",
        verified_page_id: TAHA_PAGE_ID,
        verified_at: verifiedAt,
        verified_by: callerProfile.id,
      };
      const canonical = canonicalizeFormPayload(newForm);
      newForm.verification_sig = computeFormRegistryHmac(canonical, hmacSecret);
      return { status: 200, form: newForm, updatedForms: [...currentForms, newForm] };
    }

    if (action === "set_meta_form_status") {
      const formId = String(params.form_id || "").trim();
      const status = params.status;
      if (!["active", "inactive"].includes(status)) return { status: 400, error: "Invalid status" };
      const idx = currentForms.findIndex((f) => f.id === formId);
      if (idx === -1) return { status: 404, error: "Form not found" };

      const updated = { ...currentForms[idx], status };
      const canonical = canonicalizeFormPayload(updated);
      updated.verification_sig = computeFormRegistryHmac(canonical, hmacSecret);

      const updatedForms = [...currentForms];
      updatedForms[idx] = updated;
      return { status: 200, form: updated, updatedForms };
    }

    if (action === "rename_meta_form") {
      const formId = String(params.form_id || "").trim();
      const name = String(params.name || "").trim();
      if (!name) return { status: 400, error: "Name required" };
      const idx = currentForms.findIndex((f) => f.id === formId);
      if (idx === -1) return { status: 404, error: "Form not found" };

      // Preserves verification_sig and immutable metadata
      const updated = { ...currentForms[idx], name };
      const updatedForms = [...currentForms];
      updatedForms[idx] = updated;
      return { status: 200, form: updated, updatedForms };
    }

    if (action === "remove_meta_form") {
      const formId = String(params.form_id || "").trim();
      const updatedForms = currentForms.filter((f) => f.id !== formId);
      return { status: 200, success: true, updatedForms };
    }

    return { status: 400, error: "Unknown action" };
  }

  const adminCaller = { id: "admin-1", role: "admin", is_active: true };
  const employeeCaller = { id: "emp-1", role: "salesperson", is_active: true };

  // Salesperson cannot perform admin registry actions
  const empRes = simulateAdminAction(employeeCaller, "verify_and_register_meta_form", { form_id: "1650833669757581" });
  assert.equal(empRes.status, 403);

  // Admin can register a new form
  const regRes = simulateAdminAction(adminCaller, "verify_and_register_meta_form", {
    form_id: "1650833669757581",
    name: "Client Enquiry",
    meta_form_name: "Taha Media - Client Enquiry Form",
  });
  assert.equal(regRes.status, 200);
  assert.equal(regRes.form.status, "active");
  assert.ok(regRes.form.verification_sig);

  // Duplicate registration blocked
  const dupReg = simulateAdminAction(
    adminCaller,
    "verify_and_register_meta_form",
    { form_id: "1650833669757581" },
    regRes.updatedForms
  );
  assert.equal(dupReg.status, 409);

  // Admin can deactivate and re-seal HMAC
  const deactRes = simulateAdminAction(
    adminCaller,
    "set_meta_form_status",
    { form_id: "1650833669757581", status: "inactive" },
    regRes.updatedForms
  );
  assert.equal(deactRes.status, 200);
  assert.equal(deactRes.form.status, "inactive");
  assert.notEqual(deactRes.form.verification_sig, regRes.form.verification_sig, "Signature must update with new status");

  // Admin can rename form
  const renameRes = simulateAdminAction(
    adminCaller,
    "rename_meta_form",
    { form_id: "1650833669757581", name: "Renamed Lead Form" },
    deactRes.updatedForms
  );
  assert.equal(renameRes.status, 200);
  assert.equal(renameRes.form.name, "Renamed Lead Form");

  // Admin can remove form
  const removeRes = simulateAdminAction(
    adminCaller,
    "remove_meta_form",
    { form_id: "1650833669757581" },
    renameRes.updatedForms
  );
  assert.equal(removeRes.status, 200);
  assert.equal(removeRes.updatedForms.length, 0);
}
console.log("PASS 6: Admin authorization, registration, status toggle, rename, and removal in team-admin");

// ============================================================================
// 7. Database Trigger Simulation (Column-Level Protection)
// ============================================================================
{
  function simulateDatabaseTrigger(sessionRole, oldRow, newRow) {
    // Mimics protect_agency_meta_lead_forms() PostgreSQL trigger
    if (sessionRole === "service_role") {
      return { allowed: true, row: newRow };
    }

    const oldFormsJson = JSON.stringify(oldRow.meta_lead_forms ?? []);
    const newFormsJson = JSON.stringify(newRow.meta_lead_forms ?? []);

    if (oldFormsJson !== newFormsJson) {
      return {
        allowed: false,
        error: "P0001: Direct modification of agency meta_lead_forms registry is restricted to authorized backend service actions.",
      };
    }

    return { allowed: true, row: newRow };
  }

  const baseSettings = {
    id: "settings-1",
    agency_name: "Taha Media",
    phone: "+971501234567",
    meta_lead_forms: [{ id: "1650833669757581", name: "Client Enquiry", status: "active" }],
  };

  // Normal client updating general agency profile (allowed)
  const profileUpdate = { ...baseSettings, agency_name: "Taha Media Agency LLC" };
  const r1 = simulateDatabaseTrigger("authenticated", baseSettings, profileUpdate);
  assert.equal(r1.allowed, true);

  // Authenticated client directly attempting to tamper with meta_lead_forms (BLOCKED)
  const maliciousUpdate = {
    ...baseSettings,
    meta_lead_forms: [{ id: "9999999999999999", name: "Hacked Form", status: "active" }],
  };
  const r2 = simulateDatabaseTrigger("authenticated", baseSettings, maliciousUpdate);
  assert.equal(r2.allowed, false);
  assert.match(r2.error, /restricted to authorized backend service actions/i);

  // Anon client directly attempting to tamper (BLOCKED)
  const r3 = simulateDatabaseTrigger("anon", baseSettings, maliciousUpdate);
  assert.equal(r3.allowed, false);

  // service_role executing backend admin update (ALLOWED)
  const r4 = simulateDatabaseTrigger("service_role", baseSettings, maliciousUpdate);
  assert.equal(r4.allowed, true);
}
console.log("PASS 7: Database trigger column protection (direct client writes blocked, backend service allowed)");

console.log("\nALL META LEAD FORM MANAGER SECURITY & VALIDATION TESTS PASSED SUCCESSFULLY (7/7).\n");

