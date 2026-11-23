// Migration 019: make the auto clock-out grace period configurable.

exports.up = async function (db) {
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'settings'
      AND COLUMN_NAME = 'auto_clock_out_grace_minutes'
  `);
  if (cols.length) {
    console.log('  auto_clock_out_grace_minutes already exists — skipping');
    return;
  }
  await db.query(`
    ALTER TABLE settings
    ADD COLUMN auto_clock_out_grace_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15
    AFTER work_end
  `);
};

exports.down = async function (db) {
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'settings'
      AND COLUMN_NAME = 'auto_clock_out_grace_minutes'
  `);
  if (cols.length) {
    await db.query('ALTER TABLE settings DROP COLUMN auto_clock_out_grace_minutes');
  }
};
