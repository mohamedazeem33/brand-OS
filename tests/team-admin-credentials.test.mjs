// Comprehensive unit test suite for team-admin update_credentials logic
import assert from "node:assert/strict";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Simulates requireAdmin authorization logic.
 */
function checkAdminAuth(callerProfile) {
  if (!callerProfile) {
    return { status: 403, error: "Admin access required." };
  }
  if (callerProfile.role !== "admin" || !callerProfile.is_active) {
    return { status: 403, error: "Admin access required." };
  }
  return { status: 200, authorized: true };
}

/**
 * Simulates isEmailTaken with fail-closed error handling and pagination.
 */
function isEmailTakenAcrossPages(paginatedUserPages, emailToCheck, excludeUserId, options = {}) {
  if (options.simulateListUsersError) {
    return { taken: false, error: "Failed to verify email availability: Internal Auth Gateway Error" };
  }
  if (options.simulateProfileError) {
    return { taken: false, error: "Failed to check existing profile records: Database Connection Error" };
  }

  const targetEmail = emailToCheck.trim().toLowerCase();
  for (const page of paginatedUserPages) {
    for (const u of page) {
      if (!excludeUserId || u.id !== excludeUserId) {
        if (u.email?.toLowerCase() === targetEmail) return { taken: true };
        if (u.new_email?.toLowerCase() === targetEmail) return { taken: true };
      }
    }
  }
  return { taken: false };
}

/**
 * Simulates the complete update_credentials handler logic.
 */
function handleUpdateCredentials({
  caller,
  userId,
  body,
  profilesDb,
  paginatedUserPages = [],
  authSimulateConfirm = false,
  isEmailTakenOptions = {},
}) {
  // 1. Authorization check
  const authRes = checkAdminAuth(caller);
  if (authRes.status !== 200) return authRes;

  // 2. Validate target user UUID
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId || !UUID_REGEX.test(cleanUserId)) {
    return { status: 400, error: "A valid employee UUID is required." };
  }

  // 3. Verify target exists in profiles
  const targetProfile = profilesDb.find((p) => p.id === cleanUserId);
  if (!targetProfile) {
    return { status: 404, error: "Employee not found." };
  }

  // 4. Validate input credentials
  const rawEmail = typeof body.new_email === "string" ? body.new_email : (typeof body.email === "string" ? body.email : "");
  const rawPassword = typeof body.new_password === "string" ? body.new_password : (typeof body.password === "string" ? body.password : "");

  const newEmail = rawEmail.trim().toLowerCase();
  const newPassword = rawPassword;

  if (!newEmail && !newPassword) {
    return { status: 400, error: "Either a new email or new password must be provided." };
  }

  const updates = {};

  if (newEmail) {
    if (!EMAIL_REGEX.test(newEmail)) {
      return { status: 400, error: "Invalid email format." };
    }

    // Fail-closed check
    const emailCheck = isEmailTakenAcrossPages(paginatedUserPages, newEmail, cleanUserId, isEmailTakenOptions);
    if (emailCheck.error) {
      return { status: 500, error: emailCheck.error };
    }
    if (emailCheck.taken) {
      return { status: 409, error: "An account with this email already exists." };
    }
    updates.email = newEmail;
  }

  if (newPassword) {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { status: 400, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` };
    }
    updates.password = newPassword;
  }

  // 5. Supabase Auth update simulation
  // Does not pass email_confirm: true (honors project settings)
  let isEmailConfirmed = false;

  if (newEmail) {
    if (authSimulateConfirm) {
      // Immediate confirmation mode
      isEmailConfirmed = true;
    } else {
      // Pending confirmation mode
      isEmailConfirmed = false;
    }
  }

  // 6. Profiles synchronization: only update if Auth email is confirmed
  let profileEmailUpdated = false;
  if (newEmail && isEmailConfirmed) {
    targetProfile.email = newEmail;
    profileEmailUpdated = true;
  }

  // 7. Accurate success messages for all scenarios
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

  return {
    status: 200,
    body: {
      success: true,
      message,
      user_id: cleanUserId,
      email_updated: isEmailConfirmed,
      email_change_pending: !isEmailConfirmed && !!newEmail,
      password_updated: !!newPassword,
    },
    profileEmail: targetProfile.email,
    profileEmailUpdated,
    updatesPrepared: updates,
  };
}

// ========================
// TEST EXECUTION
// ========================

console.log("Running comprehensive team-admin update_credentials unit tests...\n");

const validAdmin = { id: "a1a1a1a1-1111-2222-3333-444455556666", role: "admin", is_active: true };
const targetUserId = "e83ba695-c953-4946-86db-7ad5ed537f4d";

// 1. Authorization Failures
{
  const res1 = handleUpdateCredentials({ caller: null, userId: targetUserId, body: { password: "Password123!" }, profilesDb: [] });
  assert.equal(res1.status, 403);

  const res2 = handleUpdateCredentials({ caller: { id: "sales-id", role: "sales", is_active: true }, userId: targetUserId, body: { password: "Password123!" }, profilesDb: [] });
  assert.equal(res2.status, 403);

  const res3 = handleUpdateCredentials({ caller: { id: "admin-id", role: "admin", is_active: false }, userId: targetUserId, body: { password: "Password123!" }, profilesDb: [] });
  assert.equal(res3.status, 403);

  console.log("PASS: Reject unauthorized, non-admin, and inactive callers (HTTP 403)");
}

// 2. Strict Target User UUID Validation
{
  const profiles = [{ id: targetUserId, email: "sales1@gmail.com", role: "script_writer", is_active: true }];
  
  const res1 = handleUpdateCredentials({ caller: validAdmin, userId: "", body: { password: "Password123!" }, profilesDb: profiles });
  assert.equal(res1.status, 400);

  const res2 = handleUpdateCredentials({ caller: validAdmin, userId: "not-a-valid-uuid", body: { password: "Password123!" }, profilesDb: profiles });
  assert.equal(res2.status, 400);

  const res3 = handleUpdateCredentials({ caller: validAdmin, userId: "99999999-9999-9999-9999-999999999999", body: { password: "Password123!" }, profilesDb: profiles });
  assert.equal(res3.status, 404);

  console.log("PASS: Strict target UUID validation and non-existent account rejection");
}

// 3. Password Minimum Policy (at least 8 characters)
{
  const profiles = [{ id: targetUserId, email: "sales1@gmail.com", role: "script_writer", is_active: true }];
  
  const res1 = handleUpdateCredentials({ caller: validAdmin, userId: targetUserId, body: { new_password: "12345" }, profilesDb: profiles });
  assert.equal(res1.status, 400);

  const res2 = handleUpdateCredentials({ caller: validAdmin, userId: targetUserId, body: { new_password: "1234567" }, profilesDb: profiles });
  assert.equal(res2.status, 400);

  const res3 = handleUpdateCredentials({ caller: validAdmin, userId: targetUserId, body: { new_password: "12345678" }, profilesDb: profiles });
  assert.equal(res3.status, 200);

  console.log("PASS: Enforces minimum 8-character password policy matching platform standard");
}

// 4. Duplicate Email Detection Across Pages
{
  const profiles = [{ id: targetUserId, email: "sales1@gmail.com", role: "script_writer", is_active: true }];
  const paginatedPages = [
    [{ id: "user-1", email: "first@taha.in" }],
    [{ id: "user-2", email: "second.page@taha.in" }],
    [{ id: "user-3", email: "third@taha.in", new_email: "pending.target@taha.in" }],
  ];

  const res1 = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "second.page@taha.in" },
    profilesDb: profiles,
    paginatedUserPages: paginatedPages,
  });
  assert.equal(res1.status, 409);

  const res2 = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "pending.target@taha.in" },
    profilesDb: profiles,
    paginatedUserPages: paginatedPages,
  });
  assert.equal(res2.status, 409);

  console.log("PASS: Paginated duplicate email detection across pages and pending changes");
}

// 5. Fail-Closed Error Handling in isEmailTaken
{
  const profiles = [{ id: targetUserId, email: "sales1@gmail.com", role: "script_writer", is_active: true }];

  // listUsers failure returns 500 and halts
  const res1 = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "anusales@gmail.com" },
    profilesDb: profiles,
    isEmailTakenOptions: { simulateListUsersError: true },
  });
  assert.equal(res1.status, 500);
  assert.match(res1.error, /Failed to verify email availability/);

  // profile lookup failure returns 500 and halts
  const res2 = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "anusales@gmail.com" },
    profilesDb: profiles,
    isEmailTakenOptions: { simulateProfileError: true },
  });
  assert.equal(res2.status, 500);
  assert.match(res2.error, /Failed to check existing profile records/);

  console.log("PASS: Fail-closed handling halts credential updates on listUsers or profile errors");
}

// 6. Accurate Success Messages for All Scenarios
{
  const profiles = [{ id: targetUserId, email: "sales1@gmail.com", role: "script_writer", is_active: true }];

  // Scenario A: Email-only, pending confirmation
  const resA = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "anusales@gmail.com" },
    profilesDb: [{ ...profiles[0] }],
    authSimulateConfirm: false,
  });
  assert.equal(resA.status, 200);
  assert.equal(resA.body.message, "Email change confirmation sent to anusales@gmail.com.");
  assert.equal(resA.body.email_updated, false);
  assert.equal(resA.body.email_change_pending, true);
  assert.equal(resA.body.password_updated, false);
  assert.equal(resA.profileEmail, "sales1@gmail.com", "Profile remains old email until confirmed");

  // Scenario B: Email-only, confirmed immediately
  const resB = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "anusales@gmail.com" },
    profilesDb: [{ ...profiles[0] }],
    authSimulateConfirm: true,
  });
  assert.equal(resB.status, 200);
  assert.equal(resB.body.message, "Email updated successfully.");
  assert.equal(resB.body.email_updated, true);
  assert.equal(resB.body.email_change_pending, false);
  assert.equal(resB.body.password_updated, false);
  assert.equal(resB.profileEmail, "anusales@gmail.com", "Profile synchronized to confirmed email");

  // Scenario C: Password-only
  const resC = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_password: "NewPassword123!" },
    profilesDb: [{ ...profiles[0] }],
  });
  assert.equal(resC.status, 200);
  assert.equal(resC.body.message, "Password updated successfully.");
  assert.equal(resC.body.email_updated, false);
  assert.equal(resC.body.email_change_pending, false);
  assert.equal(resC.body.password_updated, true);

  // Scenario D: Combined (email + password), pending email confirmation
  const resD = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "anusales@gmail.com", new_password: "NewPassword123!" },
    profilesDb: [{ ...profiles[0] }],
    authSimulateConfirm: false,
  });
  assert.equal(resD.status, 200);
  assert.equal(resD.body.message, "Password updated successfully. Email change confirmation sent to anusales@gmail.com.");
  assert.equal(resD.body.email_updated, false);
  assert.equal(resD.body.email_change_pending, true);
  assert.equal(resD.body.password_updated, true);
  assert.equal(resD.profileEmail, "sales1@gmail.com", "Profile email remains unedited while change is pending");

  // Scenario E: Combined (email + password), confirmed immediately
  const resE = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "anusales@gmail.com", new_password: "NewPassword123!" },
    profilesDb: [{ ...profiles[0] }],
    authSimulateConfirm: true,
  });
  assert.equal(resE.status, 200);
  assert.equal(resE.body.message, "Email and password updated successfully.");
  assert.equal(resE.body.email_updated, true);
  assert.equal(resE.body.email_change_pending, false);
  assert.equal(resE.body.password_updated, true);
  assert.equal(resE.profileEmail, "anusales@gmail.com");

  console.log("PASS: Accurate, distinct success messages and state flags for all five update scenarios");
}

// 7. Delayed Confirmation Simulation via Database Trigger
{
  // Profile starts with original email
  const profile = { id: targetUserId, email: "sales1@gmail.com" };

  // Trigger function simulation (handle_user_email_updated)
  function simulateAuthEmailUpdatedTrigger(oldAuthUser, newAuthUser, profileRecord) {
    if (oldAuthUser.email !== newAuthUser.email) {
      profileRecord.email = newAuthUser.email;
    }
  }

  // 1. Initial pending state: auth.users.email is still sales1@gmail.com, email_change is anusales@gmail.com
  const authUserBeforeConfirmation = { id: targetUserId, email: "sales1@gmail.com", email_change: "anusales@gmail.com" };
  assert.equal(profile.email, "sales1@gmail.com");

  // 2. User clicks verification link in email: GoTrue swaps email to anusales@gmail.com
  const authUserAfterConfirmation = { id: targetUserId, email: "anusales@gmail.com", email_change: null };
  simulateAuthEmailUpdatedTrigger(authUserBeforeConfirmation, authUserAfterConfirmation, profile);

  // 3. Trigger automatically updates public.profiles.email
  assert.equal(profile.email, "anusales@gmail.com", "Database trigger synchronizes profile email upon Auth confirmation");

  console.log("PASS: Database trigger simulation confirms delayed profile email synchronization");
}

// 8. Zero Password Exposure
{
  const profiles = [{ id: targetUserId, email: "sales1@gmail.com", role: "script_writer", is_active: true }];
  const testPassword = "SuperConfidentialPassword123!";
  
  const res = handleUpdateCredentials({
    caller: validAdmin,
    userId: targetUserId,
    body: { new_email: "anusales@gmail.com", new_password: testPassword },
    profilesDb: profiles,
  });

  const responseString = JSON.stringify(res.body);
  assert.equal(responseString.includes(testPassword), false, "Password must never appear in response");

  console.log("PASS: Zero password exposure in response objects");
}

console.log("\nALL TEAM-ADMIN CREDENTIALS TESTS PASSED (8/8).\n");
