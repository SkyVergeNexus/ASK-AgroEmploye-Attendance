// backend/jobs/scheduler.js
const pool = require('../config/db');
const { notifyAdmins } = require('../helpers/notifications');

const REVIEW_AFTER_HOURS = 9;

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

let lastRetentionDate = null;

// Flag records that were never clocked out, 9h after closing time.
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
    await flagMissedClockOuts();
  } catch (err) {
    console.error('[scheduler] tick failed:', err.message);
  }
}

function startScheduler() {
  setInterval(tick, 60 * 1000);
  setTimeout(tick, 5000);
  console.log('[scheduler] started');
}

module.exports = { startScheduler };