// Migration 004: persist remote clock-in and completed-task details.
// Idempotent because MySQL DDL is not transactional.

exports.up = async function (db) {
  const columns = [
    ['clock_in_mode', "VARCHAR(16) NOT NULL DEFAULT 'onsite'"],
    ['remote_location', 'VARCHAR(255) NULL'],
    ['remote_selfie', 'VARCHAR(255) NULL'],
    ['tasks_completed', 'TEXT NULL'],
  ];

  for (const [name, definition] of columns) {
    const [rows] = await db.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'attendance'
        AND COLUMN_NAME = ?
    `, [name]);
    if (!rows.length) {
      await db.query(`ALTER TABLE attendance ADD COLUMN \`${name}\` ${definition}`);
    }
  }

  await db.query(`
    ALTER TABLE attendance
    MODIFY COLUMN clock_in_method
      ENUM('gps','ip','manual','ip+gps','remote') NULL
  `);
};

exports.down = async function (db) {
  await db.query(`
    ALTER TABLE attendance
    MODIFY COLUMN clock_in_method
      ENUM('gps','ip','manual','ip+gps') NULL
  `);
  await db.query(`
    ALTER TABLE attendance
    DROP COLUMN tasks_completed,
    DROP COLUMN remote_selfie,
    DROP COLUMN remote_location,
    DROP COLUMN clock_in_mode
  `);
};
