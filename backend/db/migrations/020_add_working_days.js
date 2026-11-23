// Migration 020: configure which weekdays employees may clock in.

exports.up = async function (db) {
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'settings'
      AND COLUMN_NAME = 'working_days'
  `);
  if (cols.length) {
    console.log('  working_days already exists — skipping');
    return;
  }
  await db.query(`
    ALTER TABLE settings
    ADD COLUMN working_days VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5'
    AFTER work_end
  `);
};

exports.down = async function (db) {
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'settings'
      AND COLUMN_NAME = 'working_days'
  `);
  if (cols.length) {
    await db.query('ALTER TABLE settings DROP COLUMN working_days');
  }
};
