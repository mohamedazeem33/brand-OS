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

console.log("\nALL WEBHOOK AUTHENTICATION AND PROCESSING TESTS PASSED SUCCESSFULLY (6/6).");

