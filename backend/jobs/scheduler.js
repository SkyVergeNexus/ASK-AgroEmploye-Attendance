// backend/jobs/scheduler.js
const pool = require('../config/db');
const { runAutoClockOut } = require('../helpers/autoClockOut');

function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let lastRunDate = null;

async function tick() {
  try {
    const today = localDateString();
    if (lastRunDate === today) return;

    const [rows] = await pool.query(
      'SELECT work_end, auto_clock_out_grace_minutes FROM settings WHERE id = 1'
    );
    const workEnd = rows[0]?.work_end || '17:00:00';
    const configuredGrace = Number(rows[0]?.auto_clock_out_grace_minutes ?? 15);
    const graceMinutes =
      Number.isInteger(configuredGrace) && configuredGrace >= 0 && configuredGrace <= 1440
        ? configuredGrace
        : 15;
    const [h, m] = String(workEnd).split(':').map(Number);

    const now = new Date();
    const trigger = new Date();
    trigger.setHours(h, m, 0, 0);
    trigger.setMinutes(trigger.getMinutes() + graceMinutes);

    if (now >= trigger) {
      const r = await runAutoClockOut();
      console.log('[scheduler] auto clock-out:', r);
      lastRunDate = today;
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