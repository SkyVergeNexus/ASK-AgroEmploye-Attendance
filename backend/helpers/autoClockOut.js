// At closing, keep active employees clocked in while they remain on-site.
// Departures after closing are closed by the presence heartbeat; stale or
// unverifiable records are sent to admin review.

const pool = require('../config/db');
const { notifyAdmins } = require('./notifications');
const { MAX_HEARTBEAT_AGE_MS } = require('./presenceTracking');

function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTimeString(d = new Date()) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  const normalized = String(value).replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clockTime(value) {
  if (value instanceof Date) return localTimeString(value);
  const text = String(value || '');
  return text.length >= 19 ? text.slice(11, 19) : text;
}

function evaluateRow(row, now = new Date(), scheduledCloseAt = null) {
  if (row.clock_in_mode === 'remote') {
    return { action: 'skip', reason: 'Remote attendance remains manually clocked out' };
  }

  const lastSeen = toDate(row.presence_last_seen_at);
  const isFresh =
    lastSeen &&
    now.getTime() >= lastSeen.getTime() &&
    now.getTime() - lastSeen.getTime() <= MAX_HEARTBEAT_AGE_MS;

  const outsideSince = toDate(row.presence_outside_since);
  const departureAfterClose =
    outsideSince &&
    scheduledCloseAt &&
    outsideSince.getTime() >= scheduledCloseAt.getTime();
  if (
    row.presence_state === 'outside' &&
    outsideSince &&
    isFresh &&
    departureAfterClose
  ) {
    return {
      action: 'auto_close',
      clockOut: clockTime(row.presence_outside_since),
      reason: 'Automatically clocked out after leaving the monitored work area',
    };
  }

  if (row.presence_state === 'inside' && isFresh) {
    return { action: 'continue_tracking', reason: null };
  }

  if (row.after_close_tracking) {
    return {
      action: 'review',
      reason: 'Location tracking stopped after closing; the departure time could not be verified',
    };
  }

  if (row.presence_state === 'outside') {
    return {
      action: 'review',
      reason: 'Employee left before closing and did not return or clock out',
    };
  }

  return {
    action: 'review',
    reason: 'Presence could not be verified at scheduled closing time',
  };
}

async function runAutoClockOut(attendanceDate = localDateString()) {
  const [settingsRows] = await pool.query('SELECT work_end FROM settings WHERE id = 1');
  const workEnd = settingsRows[0]?.work_end || '17:00:00';
  const scheduledCloseAt = toDate(`${attendanceDate} ${String(workEnd).slice(0, 8)}`);
  const now = new Date();
  const [openRows] = await pool.query(
    `SELECT a.id, a.employee_id, a.clock_in_mode,
            a.presence_state, a.presence_last_seen_at,
            a.presence_outside_since, a.after_close_tracking,
            e.full_name
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     WHERE a.attendance_date = ?
       AND a.clock_out IS NULL
       AND a.needs_review = 0
       AND COALESCE(a.clock_in_mode, 'onsite') <> 'remote'
       AND a.status IN ('present', 'late')`,
    [attendanceDate]
  );

  if (!openRows.length) {
    console.log(`[auto-clock-out] ${attendanceDate}: no open records`);
    return { scanned: 0, autoClosed: 0, flagged: 0, stillTracking: 0 };
  }

  let autoClosed = 0;
  let flagged = 0;
  let stillTracking = 0;

  for (const row of openRows) {
    const verdict = evaluateRow(row, now, scheduledCloseAt);

    if (verdict.action === 'auto_close') {
      const [result] = await pool.query(
        `UPDATE attendance
         SET clock_out = ?, auto_clocked_out = 1,
             auto_clock_out_reason = ?, auto_close_time = ?
         WHERE id = ? AND clock_out IS NULL AND needs_review = 0`,
        [verdict.clockOut, verdict.reason, verdict.clockOut, row.id]
      );
      if (result.affectedRows) autoClosed++;
    } else if (verdict.action === 'continue_tracking') {
      const [result] = await pool.query(
        `UPDATE attendance
         SET after_close_tracking = 1
         WHERE id = ? AND clock_out IS NULL AND needs_review = 0`,
        [row.id]
      );
      if (result.affectedRows) stillTracking++;
    } else if (verdict.action === 'review') {
      const [result] = await pool.query(
        `UPDATE attendance
         SET needs_review = 1, review_note = ?
         WHERE id = ? AND clock_out IS NULL AND needs_review = 0`,
        [verdict.reason, row.id]
      );
      if (result.affectedRows) {
        flagged++;
        console.log(`[auto-clock-out] flagged user=${row.employee_id} id=${row.id}: ${verdict.reason}`);
      }
    }
  }

  if (autoClosed > 0) {
    await notifyAdmins({
      type: 'attendance_auto_clock_out',
      title: 'Auto clock-out ran',
      message: `${autoClosed} employee${autoClosed === 1 ? '' : 's'} who left after closing were clocked out at their detected departure time.`,
      targetPath: '/reports',
    });
  }
  if (flagged > 0) {
    await notifyAdmins({
      type: 'attendance_needs_review',
      title: `${flagged} record${flagged === 1 ? '' : 's'} need review`,
      message: 'Employees who were outside the monitored work area or could not be verified at closing need an admin decision.',
      targetPath: '/needs-review',
    });
  }

  const result = { scanned: openRows.length, autoClosed, flagged, stillTracking, workEnd };
  console.log(`[auto-clock-out] ${attendanceDate}:`, result);
  return result;
}

module.exports = { runAutoClockOut, evaluateRow };
