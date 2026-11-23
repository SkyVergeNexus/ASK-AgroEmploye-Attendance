// backend/helpers/autoClockOut.js
//
// Runs once per day after work_end + grace. For every open on-site
// attendance row from today:
//
//   - If GPS-inside OR IP-allowlisted → auto clock out at work_end
//   - Otherwise → flag needs_review=1, notify admins, DO NOT close the day
//
// Remote rows are skipped (remote workers clock out anytime).
// Leaves the day open for admin to resolve via the review endpoint.

const pool = require('../config/db');
const { notifyAdmins } = require('./notifications');

function ipv4ToInt(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4) return null;
  const n = p.map(Number);
  if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((n[0] << 24) >>> 0) + ((n[1] << 16) >>> 0) + ((n[2] << 8) >>> 0) + (n[3] >>> 0);
}

function ipv4InCidr(ip, entry) {
  if (!entry) return false;
  if (!entry.includes('/')) return ip === entry;
  const [base, bitsStr] = entry.split('/');
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip), b = ipv4ToInt(base);
  if (a == null || b == null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

function ipMatchesAllowList(ip, allowedIps) {
  if (!ip) return false;
  const entries = String(allowedIps || '').split(',').map((x) => x.trim()).filter(Boolean);
  return entries.length > 0 && entries.some((e) => ipv4InCidr(ip, e));
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function evaluateRow(row, settings) {
  // Remote workers are never auto-closed — they clock out whenever.
  if (row.clock_in_mode === 'remote') {
    return { action: 'skip', reason: 'Remote — manual clock-out required' };
  }

  const enforceLoc = Number(settings.enforce_location) === 1;
  const enforceNet = Number(settings.enforce_network) === 1;

  // Neither rule is enforced — can't verify anything. Flag for review.
  if (!enforceLoc && !enforceNet) {
    return {
      action: 'review',
      reason: 'Attendance rules are not enforced — cannot verify presence',
    };
  }

  let gpsOk = false;
  let distance = null;
  if (
    enforceLoc &&
    row.clock_in_lat != null &&
    row.clock_in_lng != null &&
    settings.office_lat != null &&
    settings.office_lng != null
  ) {
    distance = haversineMeters(
      Number(row.clock_in_lat),
      Number(row.clock_in_lng),
      Number(settings.office_lat),
      Number(settings.office_lng)
    );
    gpsOk = distance <= Number(settings.geofence_radius_m || 200);
  }

  let ipOk = false;
  if (enforceNet && row.clock_in_ip) {
    ipOk = ipMatchesAllowList(row.clock_in_ip, settings.allowed_ips);
  }

  if (gpsOk || ipOk) {
    const bits = [];
    if (gpsOk) bits.push(`within ${Math.round(distance)}m of office GPS`);
    if (ipOk) bits.push('on office Wi-Fi');
    return {
      action: 'auto_close',
      reason: `Auto clocked out — ${bits.join(' and ')}`,
    };
  }

  return {
    action: 'review',
    reason: 'Neither office GPS nor office Wi-Fi matched at close of day',
  };
}

async function runAutoClockOut(attendanceDate = localDateString()) {

  const [settingsRows] = await pool.query('SELECT * FROM settings WHERE id = 1');
  const settings = settingsRows[0] || {};
  const workEnd = settings.work_end || '17:00:00';

  const [openRows] = await pool.query(
    `SELECT a.id, a.employee_id, a.clock_in_mode,
            a.clock_in_lat, a.clock_in_lng, a.clock_in_ip,
            e.full_name
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     WHERE a.attendance_date = ?
       AND a.clock_out IS NULL
       AND a.needs_review = 0
       AND a.status IN ('present', 'late')`,
    [attendanceDate]
  );

  if (!openRows.length) {
    console.log(`[auto-clock-out] ${attendanceDate}: no open records`);
    return { scanned: 0, autoClosed: 0, flagged: 0 };
  }

  let autoClosed = 0;
  let flagged = 0;

  for (const row of openRows) {
    const verdict = evaluateRow(row, settings);

    if (verdict.action === 'auto_close') {
      const [result] = await pool.query(
        `UPDATE attendance
         SET clock_out = ?, auto_clocked_out = 1,
             auto_clock_out_reason = ?, auto_close_time = ?
         WHERE id = ? AND clock_out IS NULL`,
        [workEnd, verdict.reason, workEnd, row.id]
      );
      if (result.affectedRows) {
        autoClosed++;
        console.log(`[auto-clock-out] closed user=${row.employee_id} id=${row.id}: ${verdict.reason}`);
      }
    } else if (verdict.action === 'review') {
      const [result] = await pool.query(
        `UPDATE attendance SET needs_review = 1, review_note = ?
         WHERE id = ? AND clock_out IS NULL`,
        [verdict.reason, row.id]
      );
      if (result.affectedRows) {
        flagged++;
        console.log(`[auto-clock-out] flagged user=${row.employee_id} id=${row.id}: ${verdict.reason}`);
      }
    }
    // 'skip' → nothing
  }

  if (autoClosed > 0) {
    await notifyAdmins({
      type: 'attendance_auto_clock_out',
      title: 'Auto clock-out ran',
      message: `${autoClosed} employee${autoClosed === 1 ? '' : 's'} who did not clock out were auto-closed at ${workEnd} after on-site presence was verified.`,
      targetPath: '/reports',
    });
  }
  if (flagged > 0) {
    await notifyAdmins({
      type: 'attendance_needs_review',
      title: `${flagged} record${flagged === 1 ? '' : 's'} need review`,
      message:
        'These employees did not clock out and could not be verified. Contact them outside the system, then mark them Present or Absent.',
      targetPath: '/needs-review',
    });
  }

  return { scanned: openRows.length, autoClosed, flagged };
}

module.exports = { runAutoClockOut, evaluateRow };