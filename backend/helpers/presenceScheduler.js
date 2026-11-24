const pool = require('../config/db');
const { notifyAdmins } = require('./notifications');

const TICK_MS = 15 * 60 * 1000; // every 15 minutes

function log(...args) {
  console.log('[presence-scheduler]', ...args);
}

/**
 * Flag any open on-site attendance whose clock_in was more than 24h ago.
 * Sets needs_review = 1 and notifies admins.
 */
async function flagStaleRecords() {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.employee_id, a.attendance_date, a.clock_in,
              e.full_name, e.employee_code
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.clock_out IS NULL
         AND a.needs_review = 0
         AND a.admin_resolved = 0
         AND a.clock_in IS NOT NULL
         AND COALESCE(a.clock_in_mode, 'onsite') = 'onsite'
         AND TIMESTAMP(a.attendance_date, a.clock_in) < (NOW() - INTERVAL 24 HOUR)`
    );
    if (!rows.length) return;

    const ids = rows.map((r) => r.id);
    await pool.query(
      `UPDATE attendance
       SET needs_review = 1,
           presence_state = 'stale',
           after_close_tracking = 0
       WHERE id IN (?)`,
      [ids]
    );

    for (const r of rows) {
      const name = r.full_name || `Employee #${r.employee_id}`;
      log(`flagged attendance id=${r.id} employee=${r.employee_id} (no clock-out in 24h)`);
      try {
        await notifyAdmins({
          type: 'attendance_missing_clock_out',
          title: 'Missed clock-out needs review',
          message: `${name} did not clock out within 24 hours on ${String(r.attendance_date).slice(0, 10)}. Please review.`,
          targetPath: '/needs-review',
        });
      } catch (err) {
        console.error('[presence-scheduler] notify failed:', err.message);
      }
    }
  } catch (err) {
    console.error('[presence-scheduler] flagStaleRecords failed:', err.message);
  }
}

function startScheduler() {
  log(`started (tick every ${TICK_MS / 60000} min)`);
  // Run once shortly after boot, then on interval.
  setTimeout(flagStaleRecords, 30 * 1000);
  setInterval(flagStaleRecords, TICK_MS);
}

module.exports = { startScheduler, flagStaleRecords };