// ============================================================================
// Meta Lead Form Manager & Webhook Pipeline Unit Test Suite
//
// ENVIRONMENT NOTICE & DISCLAIMER:
// All tests in this file are OFFLINE SIMULATION & UNIT TESTS.
// - Real cryptographic functions (crypto.createHmac, secureCompare, TextEncoder)
//   and real JSON serialization/parsing logic are executed locally.
// - External dependencies (Meta Graph API, Supabase Database, Auth Sessions)
//   are entirely MOCKED using in-memory state.
// - NO live network requests are made to Meta Graph API or Supabase.
// ============================================================================

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
 * Computes HMAC-SHA256 hex signature using Node.js crypto.
 */
function computeFormRegistryHmac(canonicalPayload, secretKey) {
  return crypto.createHmac("sha256", secretKey).update(canonicalPayload, "utf8").digest("hex");
}

console.log("Running Meta Lead Form Manager unit tests (Offline / In-Memory Simulations)...\n");

// ============================================================================
// TEST 1: [SIMULATION] Canonical JSON Determinism & Delimiter / Unicode Safety
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

  // Same data in reversed / randomized property order
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
console.log("PASS 1: [SIMULATION] Canonical JSON deterministic key order & Delimiter / Unicode safety");

// ============================================================================
// TEST 2: [SIMULATION] Cryptographic HMAC-SHA256 Signing & Tamper Detection
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

  // Genuine record matches
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
console.log("PASS 2: [SIMULATION] HMAC-SHA256 signing, verification, and tamper detection (status, page_id, form_id)");

// ============================================================================
// TEST 3: [MOCK] Meta Graph API Verification Logic (Mocked API Responses)
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

  // Mocked valid Taha Media active form
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

  // Mocked form belonging to foreign page
  const foreignMetaRes = {
    id: "1650833669757581",
    name: "Unrelated Business Form",
    status: "ACTIVE",
    page: { id: "987654321012345", name: "Other Business" },
  };
  const evalB = evaluateMetaFormResponse("1650833669757581", foreignMetaRes);
  assert.equal(evalB.verified, false);
  assert.match(evalB.error, /Form ownership check failed/i);

  // Mocked archived form in Meta
  const archivedMetaRes = {
    id: "1650833669757581",
    name: "Taha Media - Archived Form",
    status: "ARCHIVED",
    page: { id: TAHA_PAGE_ID, name: "Taha Media" },
  };
  const evalC = evaluateMetaFormResponse("1650833669757581", archivedMetaRes);
  assert.equal(evalC.verified, false);
  assert.match(evalC.error, /Meta form status is 'ARCHIVED'/i);

  // Token unconfigured fail-closed behavior
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
console.log("PASS 3: [MOCK] Meta Graph API verification (endpoint formatting, ownership check, active status, token check)");

// ============================================================================
// TEST 4: [SIMULATION] Strict Webhook Payload Validation & Zero Fallback Substitution
// ============================================================================
{
  function validateWebhookPayload(body) {
    const incomingPageId = (body.page_id ?? body.pageId ?? "").toString().trim();
    if (!incomingPageId || incomingPageId !== TAHA_PAGE_ID) {
      return {
        accepted: false,
        reason: "invalid_or_missing_page_id",
        message: `Lead ignored: page_id is required and must match Taha Media Page ID (${TAHA_PAGE_ID}).`,
      };
    }

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
console.log("PASS 4: [SIMULATION] Zero fallback substitution for form_id and strict page_id verification");

// ============================================================================
// TEST 5: [SIMULATION] Mandatory HMAC Verification, Missing Secret, Missing Signature,
//                      Tamper Detection & Salesperson Call Zero Guarantee
// ============================================================================
{
  const validSecret = "test-hmac-secret-pipeline-test-key-32b!";

  const validRecordActive = {
    id: "1650833669757581",
    name: "Client Enquiry",
    meta_form_name: "Taha Media - Client Enquiry Form",
    status: "active",
    verified_at: "2026-11-10T12:00:00.000Z",
    verified_by: "admin-uuid",
    verified_page_id: TAHA_PAGE_ID,
  };
  validRecordActive.verification_sig = computeFormRegistryHmac(canonicalizeFormPayload(validRecordActive), validSecret);

  // Unsigned record (e.g. legacy or unverified form ID 1650833669757581)
  const unsignedRecord = {
    id: "1650833669757581",
    name: "Unsigned Legacy Form",
    meta_form_name: "Taha Media - Client Enquiry Form",
    status: "active",
    verified_at: "2026-11-10T12:00:00.000Z",
    verified_by: "admin-uuid",
    verified_page_id: TAHA_PAGE_ID,
    verification_sig: "", // EMPTY SIGNATURE
  };

  // Tampered record (signature does not match current state)
  const tamperedRecord = {
    id: "1650833669757581",
    name: "Client Enquiry",
    meta_form_name: "Taha Media - Client Enquiry Form",
    status: "active",
    verified_at: "2026-11-10T12:00:00.000Z",
    verified_by: "admin-uuid",
    verified_page_id: TAHA_PAGE_ID,
    verification_sig: "deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb",
  };

  const existingLeads = [{ id: "lead-existing", meta_lead_id: "leadgen-100", name: "Existing Lead" }];

  let salespersonCallCount = 0;
  function mockAssignSalesperson() {
    salespersonCallCount++;
    return "salesperson-uuid-1";
  }

  async function processLeadPipeline(incoming, activeSecret, activeRegistry) {
    const base = {
      page_id: (incoming.page_id ?? "").toString().trim(),
      form_id: (incoming.form_id ?? "").toString().trim(),
    };
    if (base.page_id !== TAHA_PAGE_ID) return { status: "ignored", reason: "invalid_or_missing_page_id" };
    if (!FORM_ID_REGEX.test(base.form_id)) return { status: "ignored", reason: "invalid_or_missing_form_id" };

    const matched = activeRegistry.find((f) => f.id === base.form_id);
    if (!matched) return { status: "ignored", reason: "unapproved_form" };

    if (matched.verified_page_id && matched.verified_page_id !== TAHA_PAGE_ID) {
      return { status: "ignored", reason: "invalid_form_page_attribution" };
    }

    // MANDATORY HMAC SECRET CHECK (Fail closed)
    if (!activeSecret || !activeSecret.trim()) {
      return { status: "ignored", reason: "registry_verification_unavailable" };
    }

    // MANDATORY SIGNATURE CHECK (Never accept unsigned form)
    if (!matched.verification_sig || !matched.verification_sig.trim()) {
      return { status: "ignored", reason: "tampered_or_unverified_form_record" };
    }

    // HMAC SIGNATURE VERIFICATION
    const canonical = canonicalizeFormPayload({
      id: matched.id,
      meta_form_name: matched.meta_form_name || matched.name,
      status: matched.status,
      verified_at: matched.verified_at,
      verified_by: matched.verified_by,
      verified_page_id: matched.verified_page_id || TAHA_PAGE_ID,
    });
    const expectedSig = computeFormRegistryHmac(canonical, activeSecret);
    if (!secureCompare(matched.verification_sig.trim(), expectedSig)) {
      return { status: "ignored", reason: "tampered_or_unverified_form_record" };
    }

    if (matched.status !== "active") return { status: "ignored", reason: "inactive_form" };

    // Duplicate check
    if (incoming.meta_lead_id) {
      const dup = existingLeads.find((l) => l.meta_lead_id === incoming.meta_lead_id);
      if (dup) return { status: "duplicate", message: "Duplicate lead" };
    }

    // Salesperson assignment
    const assignedTo = mockAssignSalesperson();
    return { status: "created", assignedTo, leadName: incoming.name };
  }

  // Case 1: Missing HMAC Secret in environment -> Rejected, 0 salesperson calls
  salespersonCallCount = 0;
  const resNoSecret = await processLeadPipeline(
    { page_id: TAHA_PAGE_ID, form_id: "1650833669757581", name: "Lead 1" },
    "", // Missing secret
    [validRecordActive]
  );
  assert.equal(resNoSecret.status, "ignored");
  assert.equal(resNoSecret.reason, "registry_verification_unavailable");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment when HMAC secret is missing");

  // Case 2: Unsigned registry record -> Rejected, 0 salesperson calls
  salespersonCallCount = 0;
  const resUnsigned = await processLeadPipeline(
    { page_id: TAHA_PAGE_ID, form_id: "1650833669757581", name: "Lead 2" },
    validSecret,
    [unsignedRecord]
  );
  assert.equal(resUnsigned.status, "ignored");
  assert.equal(resUnsigned.reason, "tampered_or_unverified_form_record");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment for unsigned form");

  // Case 3: Invalid / Tampered signature -> Rejected, 0 salesperson calls
  salespersonCallCount = 0;
  const resTampered = await processLeadPipeline(
    { page_id: TAHA_PAGE_ID, form_id: "1650833669757581", name: "Lead 3" },
    validSecret,
    [tamperedRecord]
  );
  assert.equal(resTampered.status, "ignored");
  assert.equal(resTampered.reason, "tampered_or_unverified_form_record");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment for tampered signature");

  // Case 4: Unapproved form -> Rejected, 0 salesperson calls
  salespersonCallCount = 0;
  const resUnapproved = await processLeadPipeline(
    { page_id: TAHA_PAGE_ID, form_id: "9999888877776666", name: "Lead 4" },
    validSecret,
    [validRecordActive]
  );
  assert.equal(resUnapproved.status, "ignored");
  assert.equal(resUnapproved.reason, "unapproved_form");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment for unapproved form");

  // Case 5: Deactivated form with valid signature -> Rejected, 0 salesperson calls
  const validInactive = { ...validRecordActive, status: "inactive" };
  validInactive.verification_sig = computeFormRegistryHmac(canonicalizeFormPayload(validInactive), validSecret);
  salespersonCallCount = 0;
  const resInactive = await processLeadPipeline(
    { page_id: TAHA_PAGE_ID, form_id: "1650833669757581", name: "Lead 5" },
    validSecret,
    [validInactive]
  );
  assert.equal(resInactive.status, "ignored");
  assert.equal(resInactive.reason, "inactive_form");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment for deactivated form");

  // Case 6: Duplicate lead on active approved form -> Detected, 0 salesperson calls
  salespersonCallCount = 0;
  const resDuplicate = await processLeadPipeline(
    { page_id: TAHA_PAGE_ID, form_id: "1650833669757581", meta_lead_id: "leadgen-100", name: "Repeat" },
    validSecret,
    [validRecordActive]
  );
  assert.equal(resDuplicate.status, "duplicate");
  assert.equal(salespersonCallCount, 0, "No salesperson assignment for duplicate lead");

  // Case 7: Valid new lead on approved active form -> Processed and assigned
  salespersonCallCount = 0;
  const resSuccess = await processLeadPipeline(
    { page_id: TAHA_PAGE_ID, form_id: "1650833669757581", meta_lead_id: "leadgen-200", name: "Valid Client" },
    validSecret,
    [validRecordActive]
  );
  assert.equal(resSuccess.status, "created");
  assert.equal(salespersonCallCount, 1, "Salesperson assigned for valid new lead");
}
console.log("PASS 5: [SIMULATION] Mandatory HMAC check, unsigned rejection, tamper detection & zero salesperson calls on rejection");

// ============================================================================
// TEST 6: [SIMULATION] Admin Registration Fail-Closed, Status Tamper Guard & Deactivation Removal
// ============================================================================
{
  function simulateAdminAction(callerProfile, action, params, currentForms = [], hmacSecret = "") {
    if (!callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
      return { status: 403, error: "Admin access required." };
    }

    if (action === "verify_and_register_meta_form") {
      // Fail closed if HMAC secret is unconfigured
      if (!hmacSecret || !hmacSecret.trim()) {
        return { status: 500, error: "Cryptographic signing key is not configured. Cannot register form without cryptographic sealing." };
      }

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
      // Fail closed if HMAC secret is unconfigured
      if (!hmacSecret || !hmacSecret.trim()) {
        return { status: 500, error: "Cryptographic signing key is not configured. Cannot update form status." };
      }

      const formId = String(params.form_id || "").trim();
      const status = params.status;
      if (!["active", "inactive"].includes(status)) return { status: 400, error: "Invalid status" };
      const idx = currentForms.findIndex((f) => f.id === formId);
      if (idx === -1) return { status: 404, error: "Form not found" };

      const target = currentForms[idx];

      // Anti-tamper check: existing record must have valid signature before status change
      if (!target.verification_sig || !target.verification_sig.trim()) {
        return { status: 403, error: "Cannot update status: Form record is unsigned. It must be re-verified through Meta Graph API." };
      }

      const existingCanonical = canonicalizeFormPayload({
        id: target.id,
        meta_form_name: target.meta_form_name || target.name,
        status: target.status,
        verified_at: target.verified_at,
        verified_by: target.verified_by,
        verified_page_id: target.verified_page_id || TAHA_PAGE_ID,
      });
      const expectedExistingSig = computeFormRegistryHmac(existingCanonical, hmacSecret);
      if (!secureCompare(target.verification_sig.trim(), expectedExistingSig)) {
        return { status: 403, error: "Cannot update status: Form record failed cryptographic integrity check. Possible database tampering detected." };
      }

      const updated = { ...target, status };
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

      const target = currentForms[idx];
      if (hmacSecret && target.verification_sig) {
        const existingCanonical = canonicalizeFormPayload({
          id: target.id,
          meta_form_name: target.meta_form_name || target.name,
          status: target.status,
          verified_at: target.verified_at,
          verified_by: target.verified_by,
          verified_page_id: target.verified_page_id || TAHA_PAGE_ID,
        });
        const expectedExistingSig = computeFormRegistryHmac(existingCanonical, hmacSecret);
        if (!secureCompare(target.verification_sig.trim(), expectedExistingSig)) {
          return { status: 403, error: "Cannot rename form: Form record failed cryptographic integrity check." };
        }
      }

      const updated = { ...target, name };
      const updatedForms = [...currentForms];
      updatedForms[idx] = updated;
      return { status: 200, form: updated, updatedForms };
    }

    if (action === "remove_meta_form") {
      if (!hmacSecret || !hmacSecret.trim()) {
        return { status: 500, error: "Cryptographic signing key is not configured." };
      }
      const formId = String(params.form_id || "").trim();
      const idx = currentForms.findIndex((f) => f.id === formId);
      if (idx === -1) return { status: 404, error: "Form not found" };

      // Deactivates and re-seals (does NOT hard delete, preserving audit trail and attribution)
      const target = currentForms[idx];
      const updated = { ...target, status: "inactive" };
      const canonical = canonicalizeFormPayload(updated);
      updated.verification_sig = computeFormRegistryHmac(canonical, hmacSecret);

      const updatedForms = [...currentForms];
      updatedForms[idx] = updated;
      return { status: 200, success: true, updatedForms, deactivatedForm: updated };
    }

    return { status: 400, error: "Unknown action" };
  }

  const adminCaller = { id: "admin-1", role: "admin", is_active: true };
  const hmacKey = "admin-test-secret-key-32-bytes-len!";

  // 1. Admin registration FAILS if HMAC secret is missing (Fail-Closed)
  const regNoSecret = simulateAdminAction(
    adminCaller,
    "verify_and_register_meta_form",
    { form_id: "1650833669757581", name: "Form" },
    [],
    "" // No secret
  );
  assert.equal(regNoSecret.status, 500);
  assert.match(regNoSecret.error, /Cryptographic signing key is not configured/i);

  // 2. Admin registration SUCCEEDS with HMAC secret
  const regOk = simulateAdminAction(
    adminCaller,
    "verify_and_register_meta_form",
    { form_id: "1650833669757581", name: "Client Enquiry", meta_form_name: "Taha Media Form" },
    [],
    hmacKey
  );
  assert.equal(regOk.status, 200);
  assert.equal(regOk.form.status, "active");
  assert.ok(regOk.form.verification_sig);

  // 3. Status changes FAIL if HMAC secret is missing
  const statusNoSecret = simulateAdminAction(
    adminCaller,
    "set_meta_form_status",
    { form_id: "1650833669757581", status: "inactive" },
    regOk.updatedForms,
    "" // Missing secret
  );
  assert.equal(statusNoSecret.status, 500);
  assert.match(statusNoSecret.error, /Cryptographic signing key is not configured/i);

  // 4. Status changes CANNOT legitimize an unsigned record
  const unsignedRecordInDb = [{ ...regOk.form, verification_sig: "" }];
  const statusUnsigned = simulateAdminAction(
    adminCaller,
    "set_meta_form_status",
    { form_id: "1650833669757581", status: "inactive" },
    unsignedRecordInDb,
    hmacKey
  );
  assert.equal(statusUnsigned.status, 403);
  assert.match(statusUnsigned.error, /Form record is unsigned/i);

  // 5. Status changes CANNOT legitimize a tampered record
  const tamperedRecordInDb = [{ ...regOk.form, meta_form_name: "Tampered Name" }]; // Sig doesn't match Tampered Name
  const statusTampered = simulateAdminAction(
    adminCaller,
    "set_meta_form_status",
    { form_id: "1650833669757581", status: "active" },
    tamperedRecordInDb,
    hmacKey
  );
  assert.equal(statusTampered.status, 403);
  assert.match(statusTampered.error, /cryptographic integrity check/i);

  // 6. Legitimate status change succeeds and re-signs
  const statusOk = simulateAdminAction(
    adminCaller,
    "set_meta_form_status",
    { form_id: "1650833669757581", status: "inactive" },
    regOk.updatedForms,
    hmacKey
  );
  assert.equal(statusOk.status, 200);
  assert.equal(statusOk.form.status, "inactive");
  assert.notEqual(statusOk.form.verification_sig, regOk.form.verification_sig);

  // 7. Remove action matches backend behavior (DEACTIVATES, does not hard delete)
  const removeRes = simulateAdminAction(
    adminCaller,
    "remove_meta_form",
    { form_id: "1650833669757581" },
    regOk.updatedForms,
    hmacKey
  );
  assert.equal(removeRes.status, 200);
  assert.equal(removeRes.updatedForms.length, 1, "Form is NOT hard deleted; preserved in registry");
  assert.equal(removeRes.deactivatedForm.status, "inactive", "Form is archived to inactive status");
  assert.ok(removeRes.deactivatedForm.verification_sig, "Deactivated form has re-sealed signature");
}
console.log("PASS 6: [SIMULATION] Admin registration fail-closed, status tamper guard, and deactivation removal");

// ============================================================================
// TEST 7: [SIMULATION] Database Trigger Column-Level Protection
// ============================================================================
{
  function simulateDatabaseTrigger(sessionRole, oldRow, newRow) {
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
    id: "default",
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
console.log("PASS 7: [SIMULATION] Database trigger column protection (direct client writes blocked, backend service allowed)");

console.log("\nALL META LEAD FORM MANAGER SECURITY & VALIDATION TESTS PASSED (7/7).\n");
