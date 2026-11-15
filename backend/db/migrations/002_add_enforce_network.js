// Migration 002: add enforce_network toggle to settings
// Allows the admin to independently enable/disable the office-network (IP) check
// without affecting the GPS geofence toggle.
//
// Idempotent — safe to re-run if a previous attempt added the column but
// failed to record it in _migrations (MySQL DDL is not transactional).

exports.up = async function (db) {
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'settings'
      AND COLUMN_NAME = 'enforce_network'
  `);
  if (cols.length) {
    console.log('  enforce_network already exists — skipping');
    return;
  }
  await db.query(`
    ALTER TABLE settings
    ADD COLUMN enforce_network TINYINT(1) NOT NULL DEFAULT 1
    AFTER enforce_location
  `);
};

exports.down = async function (db) {
  await db.query(`
    ALTER TABLE settings
    DROP COLUMN enforce_network
  `);
};