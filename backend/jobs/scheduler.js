// backend/jobs/scheduler.js
const pool = require('../config/db');

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

let lastRetentionDate = null;

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
    console.error('[scheduler] tick failed:', err.message);
  }
}

function startScheduler() {
  setInterval(tick, 60 * 1000);
  setTimeout(tick, 5000);
  console.log('[scheduler] started');
}

module.exports = { startScheduler };