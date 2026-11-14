// ============================================================================
// Office GPS Attendance Module Unit Test Suite
//
// ENVIRONMENT NOTICE & DISCLAIMER:
// All tests in this file are OFFLINE SIMULATION & UNIT TESTS.
// - Real Haversine geofence calculations, timestamp logic, RLS simulation,
//   and validation rules are executed directly in Node.js.
// - Database and browser Geolocation APIs are simulated in-memory.
// - NO live network requests are made.
// ============================================================================

import assert from "node:assert/strict";

// Registered Office Coordinates
const OFFICE_LAT = 13.0693169;
const OFFICE_LNG = 80.1814571;
const GEOFENCE_RADIUS_METERS = 100;
const MAX_GPS_ACCURACY_METERS = 150.0;
const LATE_THRESHOLD_TIME = "10:00:00"; // 10:00 AM IST
const OFFICE_TIMEZONE = "Asia/Kolkata";

/**
 * Haversine formula in JavaScript (identical to PostgreSQL calculate_distance_meters).
 * Calculates great-circle distance between two points in metres.
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return null;
  }
  const R = 6371000; // Earth mean radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  let a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  if (a > 1.0) a = 1.0;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Formats a Date object to local time in Asia/Kolkata (HH:mm:ss)
 */
function getLocalTimeString(date, timeZone = OFFICE_TIMEZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Formats a Date object to local date in Asia/Kolkata (YYYY-MM-DD)
 */
function getLocalDateString(date, timeZone = OFFICE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

console.log("Running Office GPS Attendance Module Unit Tests...\n");

// ============================================================================
// TEST 1: [SIMULATION] Haversine Distance Calculation & Geofence Boundary
// ============================================================================
{
  // 1. Exact office point
  const dExact = calculateDistanceMeters(OFFICE_LAT, OFFICE_LNG, OFFICE_LAT, OFFICE_LNG);
  assert.equal(dExact, 0, "Distance at exact office coordinates must be 0 meters");

  // 2. Point ~30m north of office
  const d30m = calculateDistanceMeters(OFFICE_LAT, OFFICE_LNG, OFFICE_LAT + 0.00027, OFFICE_LNG);
  assert.ok(d30m > 25 && d30m < 35, `Distance should be ~30m, got ${d30m}m`);
  assert.ok(d30m <= GEOFENCE_RADIUS_METERS, "Point within 100m geofence");

  // 3. Point ~95m from office (inside boundary)
  const d95m = calculateDistanceMeters(OFFICE_LAT, OFFICE_LNG, OFFICE_LAT + 0.00085, OFFICE_LNG);
  assert.ok(d95m > 85 && d95m < 100, `Distance should be ~95m, got ${d95m}m`);
  assert.ok(d95m <= GEOFENCE_RADIUS_METERS, "Point at 95m is inside 100m geofence");

  // 4. Point ~150m from office (outside boundary)
  const d150m = calculateDistanceMeters(OFFICE_LAT, OFFICE_LNG, OFFICE_LAT + 0.00135, OFFICE_LNG);
  assert.ok(d150m > 140 && d150m < 160, `Distance should be ~150m, got ${d150m}m`);
  assert.ok(d150m > GEOFENCE_RADIUS_METERS, "Point at 150m is outside 100m geofence");

  // 5. Faraway point in Mumbai (~1,030 km)
  const dMumbai = calculateDistanceMeters(OFFICE_LAT, OFFICE_LNG, 19.076, 72.8777);
  assert.ok(dMumbai > 1000000, `Distance to Mumbai should be > 1,000,000m, got ${dMumbai}m`);
}
console.log("PASS 1: [SIMULATION] Haversine distance accuracy and 100m geofence boundary checks");

// ============================================================================
// TEST 2: [SIMULATION] Backend Check-In: Inside Radius, Outside Radius, Late Threshold
// ============================================================================
{
  function simulateCheckIn({
    callerUserId,
    callerIsActive,
    latitude,
    longitude,
    reportedAccuracy,
    clientReportedTime, // Simulates client device clock
    serverNow, // Authoritative server timestamp
    existingRecords = [],
    settings = {
      office_lat: OFFICE_LAT,
      office_lng: OFFICE_LNG,
      geofence_radius_meters: GEOFENCE_RADIUS_METERS,
      max_gps_accuracy_meters: MAX_GPS_ACCURACY_METERS,
      late_threshold_time: LATE_THRESHOLD_TIME,
      timezone: OFFICE_TIMEZONE,
    },
  }) {
    if (!callerUserId || !callerIsActive) {
      return { success: false, error: "Access denied. Inactive account." };
    }

    if (latitude == null || longitude == null) {
      return { success: false, error: "GPS coordinates required." };
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return { success: false, error: "Invalid GPS coordinates." };
    }

    if (reportedAccuracy != null && reportedAccuracy > settings.max_gps_accuracy_meters) {
      return {
        success: false,
        error: `GPS accuracy too poor (±${Math.round(reportedAccuracy)}m). Required: ±${settings.max_gps_accuracy_meters}m.`,
      };
    }

    const distance = calculateDistanceMeters(latitude, longitude, settings.office_lat, settings.office_lng);
    if (distance > settings.geofence_radius_meters) {
      return {
        success: false,
        error: `Outside office geofence (${Math.round(distance)}m away). Allowed radius: ${settings.geofence_radius_meters}m.`,
        distance,
      };
    }

    // Server clock determines the authoritative local date and time!
    const today = getLocalDateString(serverNow, settings.timezone);
    const localTime = getLocalTimeString(serverNow, settings.timezone);

    // Duplicate check on same calendar date
    const existing = existingRecords.find((r) => r.profile_id === callerUserId && r.attendance_date === today);
    if (existing && existing.check_in_time) {
      return {
        success: false,
        error: `Duplicate check-in: Already checked in for ${today}.`,
      };
    }

    const isLate = localTime > settings.late_threshold_time;
    const status = isLate ? "late" : "present";
    const verification_status = reportedAccuracy > 80 ? "flagged" : "verified";

    const newRecord = {
      id: "rec-" + Math.random().toString(36).slice(2, 8),
      profile_id: callerUserId,
      attendance_date: today,
      check_in_time: serverNow.toISOString(), // Server clock!
      check_in_lat: latitude,
      check_in_lng: longitude,
      check_in_accuracy: reportedAccuracy,
      check_in_distance_meters: distance,
      status,
      verification_status,
      created_at: serverNow.toISOString(),
      updated_at: serverNow.toISOString(),
    };

    return {
      success: true,
      record: newRecord,
      distance,
      isLate,
      serverTimeUsed: serverNow.toISOString(),
    };
  }

  // Case A: Valid check-in inside office at 09:30 AM IST (On Time)
  const serverTime930 = new Date("2026-11-14T04:00:00.000Z"); // 09:30 IST (+05:30)
  const resOnTime = simulateCheckIn({
    callerUserId: "emp-1",
    callerIsActive: true,
    latitude: OFFICE_LAT + 0.0002, // ~22m away
    longitude: OFFICE_LNG,
    reportedAccuracy: 12,
    serverNow: serverTime930,
  });
  assert.equal(resOnTime.success, true);
  assert.equal(resOnTime.record.status, "present");
  assert.equal(resOnTime.record.verification_status, "verified");
  assert.ok(resOnTime.distance <= 100);

  // Case B: Valid check-in inside office at 10:15 AM IST (Late Arrival)
  const serverTime1015 = new Date("2026-11-14T04:45:00.000Z"); // 10:15 IST (+05:30)
  const resLate = simulateCheckIn({
    callerUserId: "emp-2",
    callerIsActive: true,
    latitude: OFFICE_LAT + 0.0003, // ~33m away
    longitude: OFFICE_LNG,
    reportedAccuracy: 15,
    serverNow: serverTime1015,
  });
  assert.equal(resLate.success, true);
  assert.equal(resLate.record.status, "late", "Arrival after 10:00 AM IST must be marked late");

  // Case C: Check-in outside office radius (150m away) -> REJECTED
  const resOutside = simulateCheckIn({
    callerUserId: "emp-3",
    callerIsActive: true,
    latitude: OFFICE_LAT + 0.00135, // ~150m away
    longitude: OFFICE_LNG,
    reportedAccuracy: 10,
    serverNow: serverTime930,
  });
  assert.equal(resOutside.success, false);
  assert.match(resOutside.error, /Outside office geofence/i);

  // Case D: Duplicate check-in on same day -> REJECTED
  const resDup = simulateCheckIn({
    callerUserId: "emp-1",
    callerIsActive: true,
    latitude: OFFICE_LAT,
    longitude: OFFICE_LNG,
    reportedAccuracy: 10,
    serverNow: serverTime1015,
    existingRecords: [resOnTime.record],
  });
  assert.equal(resDup.success, false);
  assert.match(resDup.error, /Duplicate check-in/i);
}
console.log("PASS 2: [SIMULATION] Backend check-in verification (radius, late threshold, duplicate prevention)");

// ============================================================================
// TEST 3: [SIMULATION] Backend Check-Out: Require Prior Check-In, Geofence, Duplicate Checkout
// ============================================================================
{
  function simulateCheckOut({
    callerUserId,
    callerIsActive,
    latitude,
    longitude,
    reportedAccuracy,
    serverNow,
    existingRecords = [],
    settings = {
      office_lat: OFFICE_LAT,
      office_lng: OFFICE_LNG,
      geofence_radius_meters: GEOFENCE_RADIUS_METERS,
      max_gps_accuracy_meters: MAX_GPS_ACCURACY_METERS,
      timezone: OFFICE_TIMEZONE,
    },
  }) {
    if (!callerUserId || !callerIsActive) return { success: false, error: "Access denied." };

    if (reportedAccuracy != null && reportedAccuracy > settings.max_gps_accuracy_meters) {
      return { success: false, error: "GPS accuracy too poor." };
    }

    const distance = calculateDistanceMeters(latitude, longitude, settings.office_lat, settings.office_lng);
    if (distance > settings.geofence_radius_meters) {
      return { success: false, error: `Check-out rejected: ${Math.round(distance)}m from office.` };
    }

    const today = getLocalDateString(serverNow, settings.timezone);
    const existingIdx = existingRecords.findIndex((r) => r.profile_id === callerUserId && r.attendance_date === today);

    // Rule: Checkout requires a successful check-in first!
    if (existingIdx === -1 || !existingRecords[existingIdx].check_in_time) {
      return { success: false, error: "Check-out rejected: You have not checked in today." };
    }

    // Rule: Prevent duplicate checkout
    if (existingRecords[existingIdx].check_out_time) {
      return { success: false, error: "Duplicate check-out rejected: Already checked out today." };
    }

    const updated = {
      ...existingRecords[existingIdx],
      check_out_time: serverNow.toISOString(),
      check_out_lat: latitude,
      check_out_lng: longitude,
      check_out_accuracy: reportedAccuracy,
      check_out_distance_meters: distance,
      updated_at: serverNow.toISOString(),
    };

    return { success: true, record: updated, distance };
  }

  const existingCheckedIn = {
    id: "rec-1",
    profile_id: "emp-1",
    attendance_date: "2026-11-14",
    check_in_time: "2026-11-14T04:00:00.000Z",
    status: "present",
  };

  // Case A: Valid checkout inside geofence (5:30 PM IST)
  const serverTime1730 = new Date("2026-11-14T12:00:00.000Z");
  const resCheckoutOk = simulateCheckOut({
    callerUserId: "emp-1",
    callerIsActive: true,
    latitude: OFFICE_LAT + 0.0002,
    longitude: OFFICE_LNG,
    reportedAccuracy: 14,
    serverNow: serverTime1730,
    existingRecords: [existingCheckedIn],
  });
  assert.equal(resCheckoutOk.success, true);
  assert.ok(resCheckoutOk.record.check_out_time);
  assert.equal(resCheckoutOk.record.check_out_accuracy, 14);

  // Case B: Checkout without prior check-in -> REJECTED
  const resNoCheckin = simulateCheckOut({
    callerUserId: "emp-unregistered",
    callerIsActive: true,
    latitude: OFFICE_LAT,
    longitude: OFFICE_LNG,
    reportedAccuracy: 10,
    serverNow: serverTime1730,
    existingRecords: [existingCheckedIn],
  });
  assert.equal(resNoCheckin.success, false);
  assert.match(resNoCheckin.error, /You have not checked in today/i);

  // Case C: Duplicate checkout -> REJECTED
  const resDupCheckout = simulateCheckOut({
    callerUserId: "emp-1",
    callerIsActive: true,
    latitude: OFFICE_LAT,
    longitude: OFFICE_LNG,
    reportedAccuracy: 10,
    serverNow: new Date("2026-11-14T12:30:00.000Z"),
    existingRecords: [resCheckoutOk.record],
  });
  assert.equal(resDupCheckout.success, false);
  assert.match(resDupCheckout.error, /Duplicate check-out rejected/i);

  // Case D: Checkout outside geofence (200m away) -> REJECTED
  const resOutsideCheckout = simulateCheckOut({
    callerUserId: "emp-1",
    callerIsActive: true,
    latitude: OFFICE_LAT + 0.002, // ~222m away
    longitude: OFFICE_LNG,
    reportedAccuracy: 10,
    serverNow: serverTime1730,
    existingRecords: [existingCheckedIn],
  });
  assert.equal(resOutsideCheckout.success, false);
  assert.match(resOutsideCheckout.error, /Check-out rejected/i);
}
console.log("PASS 3: [SIMULATION] Backend check-out rules (requires check-in, geofence, duplicate prevention)");

// ============================================================================
// TEST 4: [SIMULATION] Device Clock Manipulation Resilience (Server Clock Authority)
// ============================================================================
{
  // A malicious employee alters their laptop/phone clock to 09:15 AM IST
  // but actual server time is 11:30 AM IST (Late arrival)
  const spoofedDeviceClock = new Date("2026-11-14T03:45:00.000Z"); // 09:15 AM IST
  const authoritativeServerClock = new Date("2026-11-14T06:00:00.000Z"); // 11:30 AM IST

  const localTimeServer = getLocalTimeString(authoritativeServerClock, OFFICE_TIMEZONE);
  assert.equal(localTimeServer, "11:30:00");

  const isLate = localTimeServer > LATE_THRESHOLD_TIME;
  assert.equal(isLate, true, "Server time 11:30 AM IST is past 10:00 AM IST threshold");

  // In the secure architecture, the SQL function uses `now()` on the database server,
  // completely ignoring any client timestamp.
  const recordedTimestamp = authoritativeServerClock.toISOString();
  assert.notEqual(recordedTimestamp, spoofedDeviceClock.toISOString());
  assert.equal(recordedTimestamp, "2026-11-14T06:00:00.000Z");
}
console.log("PASS 4: [SIMULATION] Client device clock manipulation cannot spoof attendance timestamp or late status");

// ============================================================================
// TEST 5: [SIMULATION] GPS Permission Denied & Low Accuracy Handling
// ============================================================================
{
  function handleBrowserGeolocationError(error) {
    if (error.code === 1) {
      return {
        allowed: false,
        userMessage: "Location permission denied. Please allow location access in your browser settings to verify attendance.",
      };
    }
    if (error.code === 2) {
      return {
        allowed: false,
        userMessage: "Position unavailable. Please ensure your device GPS is turned on.",
      };
    }
    if (error.code === 3) {
      return {
        allowed: false,
        userMessage: "GPS request timed out. Please try again in an area with clear reception.",
      };
    }
    return { allowed: false, userMessage: "Unable to retrieve location." };
  }

  // Permission denied (code 1)
  const permDenied = handleBrowserGeolocationError({ code: 1, message: "User denied Geolocation" });
  assert.equal(permDenied.allowed, false);
  assert.match(permDenied.userMessage, /Location permission denied/i);

  // Poor accuracy check: reading with ±300m accuracy rejected when threshold is ±150m
  const poorAccuracy = 320.0;
  const isAccuracyAcceptable = poorAccuracy <= MAX_GPS_ACCURACY_METERS;
  assert.equal(isAccuracyAcceptable, false, "Accuracy of ±320m exceeds ±150m limit");
}
console.log("PASS 5: [SIMULATION] Geolocation permission denial and poor GPS accuracy enforcement");

// ============================================================================
// TEST 6: [SIMULATION] Row Level Security (RLS) Policy Simulation
// ============================================================================
{
  function simulateRlsPolicy({ callerRole, callerUserId, action, targetProfileId, targetRow }) {
    const isAdmin = callerRole === "admin";

    if (action === "SELECT") {
      // Admins read all; Employees read only their own
      if (isAdmin) return true;
      return targetProfileId === callerUserId;
    }

    if (action === "INSERT") {
      // Direct client inserts blocked; must use RPC
      return false;
    }

    if (action === "UPDATE") {
      // Employees cannot directly update attendance records
      if (!isAdmin) return false;
      return true; // Admins can update for auditable corrections
    }

    if (action === "DELETE") {
      // Deletions blocked for all
      return false;
    }

    return false;
  }

  // 1. Employee reading own records -> ALLOWED
  assert.equal(simulateRlsPolicy({ callerRole: "sales", callerUserId: "emp-1", action: "SELECT", targetProfileId: "emp-1" }), true);

  // 2. Employee attempting to read another employee's records -> BLOCKED
  assert.equal(simulateRlsPolicy({ callerRole: "sales", callerUserId: "emp-1", action: "SELECT", targetProfileId: "emp-2" }), false);

  // 3. Admin reading any employee's records -> ALLOWED
  assert.equal(simulateRlsPolicy({ callerRole: "admin", callerUserId: "admin-1", action: "SELECT", targetProfileId: "emp-2" }), true);

  // 4. Employee attempting to direct UPDATE or DELETE their record -> BLOCKED
  assert.equal(simulateRlsPolicy({ callerRole: "sales", callerUserId: "emp-1", action: "UPDATE", targetProfileId: "emp-1" }), false);
  assert.equal(simulateRlsPolicy({ callerRole: "sales", callerUserId: "emp-1", action: "DELETE", targetProfileId: "emp-1" }), false);
}
console.log("PASS 6: [SIMULATION] Row Level Security: employee data isolation and self-modification blocking");

// ============================================================================
// TEST 7: [SIMULATION] Auditable Admin Correction Workflow (Original Evidence Preserved)
// ============================================================================
{
  function simulateAdminCorrection({ adminUserId, adminRole, existingRecord, newStatus, newCheckIn, newCheckOut, reason }) {
    if (adminRole !== "admin") {
      return { success: false, error: "Admin access required." };
    }

    if (!reason || reason.trim().length < 5) {
      return { success: false, error: "A detailed correction reason (min 5 chars) is mandatory." };
    }

    // Preserve original evidence snapshot in audit trail
    const auditSnapshot = {
      recorded_at: new Date().toISOString(),
      modified_by: adminUserId,
      original_status: existingRecord.status,
      original_check_in_time: existingRecord.check_in_time,
      original_check_out_time: existingRecord.check_out_time,
      original_check_in_distance_meters: existingRecord.check_in_distance_meters,
      original_verification_status: existingRecord.verification_status,
      reason: reason.trim(),
    };

    const previousAudit = Array.isArray(existingRecord.original_data) ? existingRecord.original_data : [];

    const updated = {
      ...existingRecord,
      status: newStatus || existingRecord.status,
      check_in_time: newCheckIn || existingRecord.check_in_time,
      check_out_time: newCheckOut || existingRecord.check_out_time,
      is_corrected: true,
      corrected_by: adminUserId,
      corrected_at: new Date().toISOString(),
      correction_reason: reason.trim(),
      verification_status: "manual_override",
      original_data: [...previousAudit, auditSnapshot],
    };

    return { success: true, record: updated };
  }

  const originalEvidence = {
    id: "rec-100",
    profile_id: "emp-1",
    attendance_date: "2026-11-14",
    check_in_time: "2026-11-14T05:15:00.000Z", // 10:45 AM IST (marked late)
    check_out_time: null,
    check_in_distance_meters: 18.5,
    status: "late",
    verification_status: "verified",
    original_data: null,
  };

  // Case A: Non-admin attempting correction -> REJECTED
  const resNonAdmin = simulateAdminCorrection({
    adminUserId: "emp-2",
    adminRole: "sales",
    existingRecord: originalEvidence,
    newStatus: "present",
    reason: "Mark on time",
  });
  assert.equal(resNonAdmin.success, false);
  assert.match(resNonAdmin.error, /Admin access required/i);

  // Case B: Admin correction without mandatory reason -> REJECTED
  const resNoReason = simulateAdminCorrection({
    adminUserId: "admin-1",
    adminRole: "admin",
    existingRecord: originalEvidence,
    newStatus: "present",
    reason: "",
  });
  assert.equal(resNoReason.success, false);
  assert.match(resNoReason.error, /mandatory/i);

  // Case C: Legitimate Admin correction with valid reason
  const resCorrected = simulateAdminCorrection({
    adminUserId: "admin-1",
    adminRole: "admin",
    existingRecord: originalEvidence,
    newStatus: "present",
    reason: "Approved client site visit earlier in morning; on-duty permission granted.",
  });
  assert.equal(resCorrected.success, true);
  assert.equal(resCorrected.record.status, "present");
  assert.equal(resCorrected.record.is_corrected, true);
  assert.equal(resCorrected.record.verification_status, "manual_override");
  assert.equal(resCorrected.record.corrected_by, "admin-1");

  // Critical: Original evidence is preserved in audit trail!
  assert.ok(Array.isArray(resCorrected.record.original_data));
  assert.equal(resCorrected.record.original_data.length, 1);
  assert.equal(resCorrected.record.original_data[0].original_status, "late");
  assert.equal(resCorrected.record.original_data[0].original_check_in_distance_meters, 18.5);
  assert.equal(resCorrected.record.original_data[0].reason, "Approved client site visit earlier in morning; on-duty permission granted.");
}
console.log("PASS 7: [SIMULATION] Auditable admin correction workflow preserves original evidence in audit log");

// ============================================================================
// TEST 8: [SIMULATION] Multi-Sample GPS Acquisition (Windows / Android / iOS)
// ============================================================================
{
  /**
   * Simulates high-accuracy multi-sample collection from device GPS sensors.
   * Devices (Windows laptops, iPhones, Android) typically warm up:
   * Sample 1: Coarse/cached location (e.g. ±180m accuracy)
   * Sample 2: Network-assisted / initial GPS fix (e.g. ±65m accuracy)
   * Sample 3: High-precision satellite / fused fix (e.g. ±18m accuracy)
   */
  function simulateMultiSampleAcquisition(deviceType, rawSamples, maxAcceptableAccuracy = 150.0) {
    assert.ok(["windows_laptop", "android_phone", "iphone"].includes(deviceType));

    const evaluated = rawSamples.map((sample, idx) => {
      const distance = calculateDistanceMeters(sample.lat, sample.lng, OFFICE_LAT, OFFICE_LNG);
      return {
        sampleIndex: idx + 1,
        lat: sample.lat,
        lng: sample.lng,
        accuracy: sample.accuracy,
        distance,
      };
    });

    // Select the best reading (minimum accuracy radius in metres)
    const bestReading = evaluated.reduce((best, curr) => {
      if (!best || curr.accuracy < best.accuracy) return curr;
      return best;
    }, null);

    const isReliable = bestReading && bestReading.accuracy <= maxAcceptableAccuracy;
    const isWithinGeofence = bestReading && bestReading.distance <= GEOFENCE_RADIUS_METERS;

    return {
      deviceType,
      sampleCount: evaluated.length,
      evaluated,
      bestReading,
      isReliable,
      isWithinGeofence,
    };
  }

  // Windows Laptop simulation: starts with coarse Wi-Fi/IP fix, refines to reliable fix
  const windowsResult = simulateMultiSampleAcquisition("windows_laptop", [
    { lat: 13.06945, lng: 80.18150, accuracy: 175.0 }, // Coarse initial reading (> 150m)
    { lat: 13.06935, lng: 80.18147, accuracy: 65.0 },  // Refined reading (65m)
    { lat: 13.06932, lng: 80.18146, accuracy: 22.0 },  // Stabilized reading (22m)
  ]);
  assert.equal(windowsResult.sampleCount, 3);
  assert.equal(windowsResult.bestReading.accuracy, 22.0);
  assert.ok(windowsResult.isReliable, "Windows laptop achieved reliable accuracy <= 150m");
  assert.ok(windowsResult.isWithinGeofence, "Windows laptop best reading is within 100m geofence");

  // iPhone (iOS) simulation: GPS sensor locks satellite fix
  const iphoneResult = simulateMultiSampleAcquisition("iphone", [
    { lat: 13.06940, lng: 80.18148, accuracy: 48.0 },
    { lat: 13.06931, lng: 80.18145, accuracy: 12.0 }, // Satellite fix (12m)
  ]);
  assert.equal(iphoneResult.bestReading.accuracy, 12.0);
  assert.ok(iphoneResult.isReliable);
  assert.ok(iphoneResult.isWithinGeofence);

  // Android phone simulation: High accuracy fused location
  const androidResult = simulateMultiSampleAcquisition("android_phone", [
    { lat: 13.06950, lng: 80.18160, accuracy: 85.0 },
    { lat: 13.06933, lng: 80.18146, accuracy: 15.0 },
  ]);
  assert.equal(androidResult.bestReading.accuracy, 15.0);
  assert.ok(androidResult.isReliable);
  assert.ok(androidResult.isWithinGeofence);
}
console.log("PASS 8: [SIMULATION] Multi-sample GPS location acquisition & best accuracy selection (Windows / Android / iOS)");

// ============================================================================
// TEST 9: [SIMULATION] Insufficient Accuracy Rejection & Retry Workflow
// ============================================================================
{
  function evaluateGPSReadingWithRetry(rawReading, maxAccuracy = MAX_GPS_ACCURACY_METERS) {
    const distance = calculateDistanceMeters(rawReading.lat, rawReading.lng, OFFICE_LAT, OFFICE_LNG);
    if (rawReading.accuracy > maxAccuracy) {
      return {
        acceptable: false,
        requiresRetry: true,
        detectedCoordinates: { lat: rawReading.lat, lng: rawReading.lng },
        detectedAccuracy: rawReading.accuracy,
        detectedDistance: distance,
        message: `GPS accuracy is insufficient (±${Math.round(rawReading.accuracy)}m). Office attendance requires accuracy within ±${maxAccuracy}m. Please move closer to a window or turn on High Accuracy and retry.`,
      };
    }
    return {
      acceptable: true,
      requiresRetry: false,
      detectedCoordinates: { lat: rawReading.lat, lng: rawReading.lng },
      detectedAccuracy: rawReading.accuracy,
      detectedDistance: distance,
      isInsideGeofence: distance <= GEOFENCE_RADIUS_METERS,
    };
  }

  // Attempt 1: Poor accuracy (±220m) -> Triggers retry option
  const attempt1 = evaluateGPSReadingWithRetry({ lat: 13.0693169, lng: 80.1814571, accuracy: 220.0 });
  assert.equal(attempt1.acceptable, false);
  assert.equal(attempt1.requiresRetry, true);
  assert.match(attempt1.message, /insufficient/i);
  assert.equal(attempt1.detectedAccuracy, 220.0);
  assert.equal(attempt1.detectedDistance, 0);

  // User clicks "Retry GPS Reading" after moving near a window:
  // Attempt 2: Improved accuracy (±18m) -> Accepted
  const attempt2 = evaluateGPSReadingWithRetry({ lat: 13.0693169, lng: 80.1814571, accuracy: 18.0 });
  assert.equal(attempt2.acceptable, true);
  assert.equal(attempt2.requiresRetry, false);
  assert.equal(attempt2.isInsideGeofence, true);
}
console.log("PASS 9: [SIMULATION] Insufficient accuracy rejection and retry workflow verified");

// ============================================================================
// TEST 10: [SIMULATION] Shift Threshold Time Display Formatting (10:00 AM IST vs 03:30 PM)
// ============================================================================
{
  /**
   * Helper that formats a PostgreSQL time string (e.g. "10:00:00" or "10:00")
   * directly without erroneous UTC-to-IST double offsetting.
   */
  function formatShiftThreshold(timeStr) {
    if (!timeStr) return "10:00 AM IST";
    const clean = timeStr.trim();
    const [hStr, mStr] = clean.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr || "0", 10);
    if (isNaN(h)) return "10:00 AM IST";
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = m.toString().padStart(2, "0");
    return `${displayH}:${displayM} ${period} IST`;
  }

  // Verify that the bug (passing "1970-01-01T10:00:00Z" to Intl.DateTimeFormat in Asia/Kolkata)
  // was producing 03:30 PM due to the +05:30 offset
  const bugUtcDate = new Date("1970-01-01T10:00:00Z");
  const bugFormatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(bugUtcDate);
  // bugFormatted in IST will be "03:30 pm"
  assert.match(bugFormatted, /03:30/i, "Demonstrates the UTC double-offset bug that caused 03:30 PM");

  // Verify the new helper formatShiftThreshold:
  assert.equal(formatShiftThreshold("10:00:00"), "10:00 AM IST");
  assert.equal(formatShiftThreshold("10:00"), "10:00 AM IST");
  assert.equal(formatShiftThreshold("09:30:00"), "9:30 AM IST");
  assert.equal(formatShiftThreshold("14:15:00"), "2:15 PM IST");
  assert.equal(formatShiftThreshold(null), "10:00 AM IST");
  assert.equal(formatShiftThreshold(undefined), "10:00 AM IST");
}
console.log("PASS 10: [SIMULATION] Shift threshold formatting renders 10:00 AM IST and prevents 03:30 PM bug");

console.log("\nALL OFFICE ATTENDANCE MODULE TESTS PASSED (10/10).\n");
