// Migration 003: widen clock_in_method ENUM to include 'gps' and 'ip'
//
// The clock-in route now sets method independently based on which checks
// are enabled:
//   - GPS on + Network on  → 'ip+gps'
//   - GPS on only          → 'gps'       ← was missing
//   - Network on only      → 'ip'        ← was missing
//   - neither              → 'manual'
//
// Widen the ENUM so all four values are accepted.

exports.up = async function (db) {
  await db.query(`
    ALTER TABLE attendance
    MODIFY COLUMN clock_in_method
      ENUM('gps','ip','manual','ip+gps') NULL
  `);
};

exports.down = async function (db) {
  // Reverting could orphan rows with 'gps'/'ip' — leave as-is for safety.
  console.log('  down() is a no-op for 003 — ENUM widening is not reversed');
};