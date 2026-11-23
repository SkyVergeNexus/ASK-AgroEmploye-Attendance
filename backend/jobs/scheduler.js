// backend/jobs/scheduler.js
const pool = require('../config/db');
const { runAutoClockOut } = require('../helpers/autoClockOut');

function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDateTimeString(d) {
  const date = localDateString(d);
  const time = [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join(':');
  return `${date} ${time}`;
}

let lastRunDate = null;
let lastRetentionDate = null;

async function checkOpenPriorDates(today) {
  const [rows] = await pool.query(
    `SELECT DISTINCT DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date
     FROM attendance
     WHERE attendance_date < ?
       AND clock_out IS NULL
       AND needs_review = 0
       AND COALESCE(clock_in_mode, 'onsite') <> 'remote'
       AND status IN ('present', 'late')`,
    [today]
  );
  for (const row of rows) {
    await runAutoClockOut(row.attendance_date);
  }
}

async function tick() {
  try {
    const today = localDateString();
    await checkOpenPriorDates(today);
    if (lastRetentionDate !== today) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      await pool.query(
        'DELETE FROM attendance_presence_events WHERE event_at < ?',
        [localDateTimeString(cutoff)]
      );
      lastRetentionDate = today;
    }
    if (lastRunDate === today) return;

    const [rows] = await pool.query('SELECT work_end FROM settings WHERE id = 1');
    const workEnd = rows[0]?.work_end || '17:00:00';
    const [h, m, s = 0] = String(workEnd).split(':').map(Number);

    const now = new Date();
    const trigger = new Date();
    trigger.setHours(h, m, s, 0);

    if (now >= trigger) {
      const r = await runAutoClockOut();
      if (r.scanned === 0) lastRunDate = today;
    }
  } catch (err) {
    console.error('[scheduler] tick failed:', err.message);
  }
}

async function catchUpYesterday() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    console.log(`[scheduler] catch-up: checking ${localDateString(yesterday)}`);
    await runAutoClockOut(localDateString(yesterday));
  } catch (err) {
    console.error('[scheduler] catch-up failed:', err.message);
  }
}

function startScheduler() {
  setInterval(tick, 60 * 1000);
  setTimeout(tick, 5000);
  setTimeout(catchUpYesterday, 15000);
  console.log('[scheduler] started');
}

module.exports = { startScheduler };