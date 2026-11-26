// backend/jobs/scheduler.js
const pool = require('../config/db');
const { notifyAdmins } = require('../helpers/notifications');

// A record with no clock-out is sent to admin review this many hours after closing time.
const REVIEW_AFTER_HOURS = 9;

// Days of the week the office works (0 = Sunday ... 6 = Saturday). Adjust if you work Saturdays.
const WORKING_DAYS = [1, 2, 3, 4, 5];

// Admin accounts are not tracked for attendance. Set to false if admins also clock in.
const EXCLUDE_ADMINS = true;

function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDateTimeString(d) {
  const time = [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join(':');
  return `${localDateString(d)} ${time}`;
}

function todayAt(timeString, fallback) {
  const src = String(timeString || fallback || '00:00:00');
  const [h, m] = src.split(':');
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d;
}

let lastRetentionDate = null;
let lastAbsenteeDate = null;

// ------------------------------------------------------------
//  1. Never clocked out: flag for admin review 9h after closing
// ------------------------------------------------------------
async function flagMissedClockOuts() {
  const nowStr = localDateTimeString(new Date());

  const [rows] = await pool.query(
    `SELECT a.id, a.attendance_date, e.full_name
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     JOIN settings s ON s.id = 1
     WHERE a.clock_in IS NOT NULL
       AND a.clock_out IS NULL
       AND a.status <> 'leave'
       AND a.needs_review = 0
       AND a.admin_resolved = 0
       AND TIMESTAMP(a.attendance_date, s.work_end) + INTERVAL ${REVIEW_AFTER_HOURS} HOUR <= ?`,
    [nowStr]
  );

  for (const r of rows) {
    const note = `No clock-out recorded ${REVIEW_AFTER_HOURS} hours after closing time`;
    const [result] = await pool.query(
      `UPDATE attendance
       SET needs_review = 1, review_note = ?
       WHERE id = ? AND clock_out IS NULL AND needs_review = 0 AND admin_resolved = 0`,
      [note, r.id]
    );
    if (result.affectedRows === 0) continue; // clocked out in the meantime

    try {
      await notifyAdmins({
        type: 'attendance_needs_review',
        title: 'Attendance needs review',
        message: `${r.full_name} did not clock out within ${REVIEW_AFTER_HOURS} hours after closing.`,
        targetPath: '/needs-review',
      });
    } catch (e) {
      console.warn('[scheduler] review notification failed:', e.message);
    }
  }
}

// ------------------------------------------------------------
//  2. Never clocked in: mark absent once closing time has passed
//  Employees on approved leave already have a 'leave' row for the
//  day, so the NOT EXISTS check below skips them automatically.
// ------------------------------------------------------------
async function markAbsentees() {
  const now = new Date();
  const today = localDateString(now);

  if (lastAbsenteeDate === today) return;           // already done today
  if (!WORKING_DAYS.includes(now.getDay())) return; // not a working day

  const [settingsRows] = await pool.query('SELECT work_end FROM settings WHERE id = 1');
  const workEnd = todayAt(settingsRows[0]?.work_end, '17:00:00');

  // Clock-in stays open until workEnd inclusive, so only act strictly after it.
  if (now <= workEnd) return;

  const [result] = await pool.query(
    `INSERT INTO attendance (employee_id, attendance_date, status, presence_state)
     SELECT e.id, ?, 'absent', 'unknown'
     FROM employees e
     WHERE e.is_active = 1
       AND e.is_approved = 1
       ${EXCLUDE_ADMINS ? "AND COALESCE(e.system_role, '') <> 'admin'" : ''}
       AND DATE(e.created_at) < ?
       AND NOT EXISTS (
         SELECT 1 FROM attendance a
         WHERE a.employee_id = e.id AND a.attendance_date = ?
       )`,
    [today, today, today]
  );

  lastAbsenteeDate = today;

  if (result.affectedRows > 0) {
    console.log(`[scheduler] marked ${result.affectedRows} employee(s) absent for ${today}`);
    try {
      await notifyAdmins({
        type: 'attendance_absent_marked',
        title: 'Absentees recorded',
        message: `${result.affectedRows} employee(s) did not clock in today and were marked absent.`,
        targetPath: '/reports',
      });
    } catch (e) {
      console.warn('[scheduler] absentee notification failed:', e.message);
    }
  }
}

async function tick() {
  try {
    const today = localDateString();
    if (lastRetentionDate !== today) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      await pool.query(
        'DELETE FROM attendance_presence_events WHERE event_at < ?',
        [localDateTimeString(cutoff)]
      );
      lastRetentionDate = today;
    }
  } catch (err) {
    console.error('[scheduler] retention failed:', err.message);
  }

  // Independent jobs: one failing must not stop the other.
  try { await markAbsentees(); } catch (err) {
    console.error('[scheduler] markAbsentees failed:', err.message);
  }
  try { await flagMissedClockOuts(); } catch (err) {
    console.error('[scheduler] flagMissedClockOuts failed:', err.message);
  }
}

function startScheduler() {
  setInterval(tick, 60 * 1000);
  setTimeout(tick, 5000);
  console.log('[scheduler] started');
}

module.exports = { startScheduler };