// Test suite for meta-lead-webhook authentication and payload logic
import assert from "node:assert/strict";

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

function authenticateRequest(envSecret, headers) {
  const configuredSecret = envSecret?.trim();
  if (!configuredSecret) {
    return { status: 500, error: "Server configuration error: Webhook authentication is unconfigured." };
  }

  const headerSecret = headers["x-webhook-secret"] ?? null;
  const authHeader = headers["authorization"] ?? null;
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const secretMatches =
    (headerSecret !== null && secureCompare(headerSecret.trim(), configuredSecret)) ||
    (bearerSecret !== null && secureCompare(bearerSecret, configuredSecret));

  if (!secretMatches) {
    return { status: 401, error: "Unauthorized. Invalid or missing webhook secret." };
  }

  return { status: 200, success: true };
}

function extractFromFieldData(fieldData) {
  if (!Array.isArray(fieldData)) return { name: "", phone: "", email: "", service: "", unmapped: [] };

  let name = "";
  let phone = "";
  let email = "";
  let service = "";
  const unmapped = [];

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

// ========================
// TEST EXECUTION
// ========================

console.log("Running meta-lead-webhook unit tests...\n");

// 1. Constant-time secureCompare
assert.equal(secureCompare("correct-secret-123", "correct-secret-123"), true, "Identical strings match");
assert.equal(secureCompare("correct-secret-123", "wrong-secret"), false, "Different lengths do not match");
assert.equal(secureCompare("secret-a", "secret-b"), false, "Same length different characters do not match");
assert.equal(secureCompare(null, "secret"), false, "Null first arg fails securely");
assert.equal(secureCompare("secret", undefined), false, "Undefined second arg fails securely");
console.log("PASS: secureCompare constant-time equality tests");

// 2. Missing configured secret in environment (Fail-Closed)
{
  const res1 = authenticateRequest(undefined, { "x-webhook-secret": "some-secret" });
  assert.equal(res1.status, 500);
  assert.match(res1.error, /configuration error/i);

  const res2 = authenticateRequest("", { "x-webhook-secret": "some-secret" });
  assert.equal(res2.status, 500);

  const res3 = authenticateRequest("   ", { "x-webhook-secret": "some-secret" });
  assert.equal(res3.status, 500);
}
console.log("PASS: Fail-closed on missing/empty configured secret (HTTP 500)");

// 3. Missing request secret
{
  const res = authenticateRequest("super-secret-key", {});
  assert.equal(res.status, 401);
  assert.match(res.error, /Unauthorized/i);
}
console.log("PASS: Reject missing request secret (HTTP 401)");

// 4. Incorrect request secret
{
  const res1 = authenticateRequest("super-secret-key", { "x-webhook-secret": "wrong-key" });
  assert.equal(res1.status, 401);

  const res2 = authenticateRequest("super-secret-key", { authorization: "Bearer wrong-bearer" });
  assert.equal(res2.status, 401);
}
console.log("PASS: Reject incorrect request secret via header and bearer (HTTP 401)");

// 5. Valid request secret
{
  const resHeader = authenticateRequest("super-secret-key", { "x-webhook-secret": "super-secret-key" });
  assert.equal(resHeader.status, 200);

  const resBearer = authenticateRequest("super-secret-key", { authorization: "Bearer super-secret-key" });
  assert.equal(resBearer.status, 200);
}
console.log("PASS: Accept valid secret via x-webhook-secret and Authorization: Bearer (HTTP 200)");

// 6. Meta field_data extraction & validation
{
  const metaSample = [
    { name: "full_name", values: ["Azeem Test"] },
    { name: "phone_number", values: ["+919876543210"] },
    { name: "email", values: ["test@example.com"] },
    { name: "service_interest", values: ["Performance Marketing"] },
    { name: "city", values: ["Mumbai"] }
  ];

  const extracted = extractFromFieldData(metaSample);
  assert.equal(extracted.name, "Azeem Test");
  assert.equal(extracted.phone, "+919876543210");
  assert.equal(extracted.email, "test@example.com");
  assert.equal(extracted.service, "Performance Marketing");
  assert.equal(extracted.unmapped.length, 1);
  assert.equal(extracted.unmapped[0], "city: Mumbai");
}
console.log("PASS: Meta field_data extraction, field mapping, and unmapped metadata");

// 7. Meta Instant Form URL Parsing
function parseMetaInstantFormUrl(input) {
  if (!input || !input.trim()) {
    return { isValid: false, formId: null, pageId: null, error: "Please enter a Meta Instant Form link or Form ID." };
  }

  const raw = input.trim();
  if (/^\d{14,18}$/.test(raw)) {
    return { isValid: true, formId: raw, pageId: null };
  }

  try {
    const urlString = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    const isMetaDomain =
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname === "meta.com" ||
      hostname.endsWith(".meta.com") ||
      hostname === "fb.me" ||
      hostname.endsWith(".fb.me") ||
      hostname === "fb.com" ||
      hostname.endsWith(".fb.com") ||
      hostname === "instagram.com" ||
      hostname.endsWith(".instagram.com");

    if (!isMetaDomain) {
      return { isValid: false, formId: null, pageId: null, error: "URL must belong to a Meta/Facebook domain." };
    }

    let formId = null;
    let pageId = null;

    const params = url.searchParams;
    for (const key of ["id", "form_id", "leadgen_id", "selected_form_id", "lead_gen_id", "form"]) {
      const val = params.get(key);
      if (val && /^\d{14,18}$/.test(val)) {
        formId = val;
        break;
      }
    }

    for (const key of ["page_id", "asset_id", "page", "business_id"]) {
      const val = params.get(key);
      if (val && /^\d{10,18}$/.test(val)) {
        pageId = val;
        break;
      }
    }

    if (!formId) {
      const segments = url.pathname.split("/").filter(Boolean);
      for (const seg of segments) {
        if (/^\d{14,18}$/.test(seg)) {
          formId = seg;
          break;
        }
      }
    }

    if (!formId) {
      return { isValid: false, formId: null, pageId: null, error: "Could not detect a valid 14-18 digit Meta Form ID." };
    }

    return { isValid: true, formId, pageId };
  } catch {
    return { isValid: false, formId: null, pageId: null, error: "Invalid URL format." };
  }
}

{
  // Standard Facebook Instant Form link
  const r1 = parseMetaInstantFormUrl("https://www.facebook.com/ads/leadgen/?id=1650833669757581");
  assert.equal(r1.isValid, true);
  assert.equal(r1.formId, "1650833669757581");
  assert.equal(r1.pageId, null);

  // Link with both form_id and page_id
  const r2 = parseMetaInstantFormUrl("https://facebook.com/ads/lead_gen/?id=1650833669757581&page_id=104523992487431");
  assert.equal(r2.isValid, true);
  assert.equal(r2.formId, "1650833669757581");
  assert.equal(r2.pageId, "104523992487431");

  // Meta Business Suite form URL
  const r3 = parseMetaInstantFormUrl("https://business.facebook.com/latest/instant_forms/forms/1650833669757581?asset_id=104523992487431");
  assert.equal(r3.isValid, true);
  assert.equal(r3.formId, "1650833669757581");
  assert.equal(r3.pageId, "104523992487431");

  // Direct numeric Form ID (16 digits)
  const r4 = parseMetaInstantFormUrl("1650833669757581");
  assert.equal(r4.isValid, true);
  assert.equal(r4.formId, "1650833669757581");

  // Instagram lead form URL
  const r5 = parseMetaInstantFormUrl("https://www.instagram.com/leadgen/?id=1650833669757581");
  assert.equal(r5.isValid, true);
  assert.equal(r5.formId, "1650833669757581");

  // Reject non-Meta domains
  const r6 = parseMetaInstantFormUrl("https://google.com/search?q=1650833669757581");
  assert.equal(r6.isValid, false);
  assert.match(r6.error, /Meta\/Facebook domain/i);

  // Reject Meta link with missing form ID
  const r7 = parseMetaInstantFormUrl("https://facebook.com/tahamedia/about");
  assert.equal(r7.isValid, false);
  assert.match(r7.error, /Could not detect/i);

  // Reject empty input
  const r8 = parseMetaInstantFormUrl("   ");
  assert.equal(r8.isValid, false);
}
console.log("PASS: Meta Instant Form URL validation and ID extraction (valid, invalid, query params, path)");

// 8. Strict Approved Forms Validation & Pipeline Protection
function validateApprovedLeadForm(incomingFormId, incomingPageId, approvedForms) {
  const TAHA_PAGE_ID = "104523992487431";
  const FORM_ID_REGEX = /^\d{14,18}$/;

  // Page ID is strictly mandatory and must match Taha Media Page ID
  const cleanPageId = (incomingPageId ?? "").toString().trim();
  if (!cleanPageId || cleanPageId !== TAHA_PAGE_ID) {
    return {
      allowed: false,
      reason: "invalid_or_missing_page_id",
      message: `Lead ignored: page_id is required and must match Taha Media Page ID (${TAHA_PAGE_ID}).`,
    };
  }

  // Form ID is strictly mandatory (no fallback to leadgen_id) and must be 14-18 digits
  const cleanFormId = (incomingFormId ?? "").toString().trim();
  if (!cleanFormId || !FORM_ID_REGEX.test(cleanFormId)) {
    return {
      allowed: false,
      reason: "invalid_or_missing_form_id",
      message: "Lead ignored: form_id is required and must be a valid 14-18 digit numeric ID.",
    };
  }

  const matched = approvedForms.find((f) => String(f.id).trim() === cleanFormId) || null;

  if (!matched) {
    return {
      allowed: false,
      reason: "unapproved_form",
      message: `Lead ignored: Form ID '${cleanFormId}' is not an approved Meta lead form.`,
    };
  }

  if (matched.status === "inactive") {
    return {
      allowed: false,
      reason: "inactive_form",
      message: `Lead ignored: Form '${matched.name}' (${cleanFormId}) is currently deactivated.`,
    };
  }

  if (matched.verified_page_id && matched.verified_page_id !== TAHA_PAGE_ID) {
    return {
      allowed: false,
      reason: "invalid_form_page_attribution",
      message: `Lead ignored: Form '${cleanFormId}' belongs to an unapproved Page.`,
    };
  }

  return { allowed: true, reason: null, matchedForm: matched };
}

{
  const mockApprovedForms = [
    { id: "1650833669757581", name: "Taha Media - Client Enquiry Form", status: "active", verified_page_id: "104523992487431" },
    { id: "2222333344445555", name: "Old Performance Campaign", status: "inactive", verified_page_id: "104523992487431" },
    { id: "3333444455556666", name: "Foreign Page Form", status: "active", verified_page_id: "999999999999999" },
  ];

  // Active approved form with correct page_id is accepted
  const checkActive = validateApprovedLeadForm("1650833669757581", "104523992487431", mockApprovedForms);
  assert.equal(checkActive.allowed, true);
  assert.equal(checkActive.matchedForm?.name, "Taha Media - Client Enquiry Form");

  // Deactivated form is ignored
  const checkInactive = validateApprovedLeadForm("2222333344445555", "104523992487431", mockApprovedForms);
  assert.equal(checkInactive.allowed, false);
  assert.equal(checkInactive.reason, "inactive_form");

  // Unapproved form (e.g. hiring/internship form) is rejected
  const checkUnapproved = validateApprovedLeadForm("9999888877776666", "104523992487431", mockApprovedForms);
  assert.equal(checkUnapproved.allowed, false);
  assert.equal(checkUnapproved.reason, "unapproved_form");

  // Missing form ID is rejected (NEVER bypasses validation)
  const checkMissingFormId = validateApprovedLeadForm(null, "104523992487431", mockApprovedForms);
  assert.equal(checkMissingFormId.allowed, false);
  assert.equal(checkMissingFormId.reason, "invalid_or_missing_form_id");

  // Malformed form ID is rejected
  const checkMalformedFormId = validateApprovedLeadForm("abc1234", "104523992487431", mockApprovedForms);
  assert.equal(checkMalformedFormId.allowed, false);
  assert.equal(checkMalformedFormId.reason, "invalid_or_missing_form_id");

  // Missing page ID is rejected
  const checkMissingPageId = validateApprovedLeadForm("1650833669757581", null, mockApprovedForms);
  assert.equal(checkMissingPageId.allowed, false);
  assert.equal(checkMissingPageId.reason, "invalid_or_missing_page_id");

  // Foreign page ID is rejected
  const checkForeignPageId = validateApprovedLeadForm("1650833669757581", "987654321012345", mockApprovedForms);
  assert.equal(checkForeignPageId.allowed, false);
  assert.equal(checkForeignPageId.reason, "invalid_or_missing_page_id");

  // Form record attributed to foreign page is rejected
  const checkForeignAttribution = validateApprovedLeadForm("3333444455556666", "104523992487431", mockApprovedForms);
  assert.equal(checkForeignAttribution.allowed, false);
  assert.equal(checkForeignAttribution.reason, "invalid_form_page_attribution");
}
console.log("PASS: Strict lead delivery filtering: accepts approved active forms, rejects missing/foreign page_id, missing form_id, unapproved and inactive forms");

// 9. Duplicate meta_lead_id detection
function checkLeadDuplicate(metaLeadId, existingLeads) {
  if (!metaLeadId) return { duplicate: false };
  const found = existingLeads.find((l) => l.meta_lead_id === metaLeadId);
  if (found) {
    return {
      duplicate: true,
      message: `Lead with meta_lead_id '${metaLeadId}' already exists. No duplicate created.`,
      lead: found,
    };
  }
  return { duplicate: false };
}

{
  const existing = [{ id: "lead-1", meta_lead_id: "meta-123456", name: "Existing Lead" }];

  const dupRes = checkLeadDuplicate("meta-123456", existing);
  assert.equal(dupRes.duplicate, true);
  assert.equal(dupRes.lead.id, "lead-1");

  const newRes = checkLeadDuplicate("meta-999999", existing);
  assert.equal(newRes.duplicate, false);
}
console.log("PASS: Duplicate lead prevention by meta_lead_id");

console.log("\nALL WEBHOOK AUTHENTICATION AND PROCESSING TESTS PASSED SUCCESSFULLY (9/9).");

