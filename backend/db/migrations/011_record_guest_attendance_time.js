// Migration 011: record when an assigned employee completes a guest visit.
exports.up = async function (db) {
  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guests'
      AND COLUMN_NAME = 'completed_at'
  `);

  if (!columns.length) {
    await db.query(`
      ALTER TABLE guests
      ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER assigned_at
    `);
  }
};

exports.down = async function (db) {
  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guests'
      AND COLUMN_NAME = 'completed_at'
  `);

  if (columns.length) {
    await db.query('ALTER TABLE guests DROP COLUMN completed_at');
  }
};
