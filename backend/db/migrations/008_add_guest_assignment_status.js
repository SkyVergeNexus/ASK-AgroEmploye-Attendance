// Migration 008: persist the employee workflow state for guest assignments.
exports.up = async function (db) {
  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guests'
      AND COLUMN_NAME = 'assignment_status'
  `);

  if (!columns.length) {
    await db.query(`
      ALTER TABLE guests
      ADD COLUMN assignment_status
        ENUM('pending','accepted','completed','cancelled') NULL DEFAULT NULL
        AFTER assigned_by
    `);
  }

  await db.query(`
    UPDATE guests
    SET assignment_status = 'pending'
    WHERE assigned_employee_id IS NOT NULL
      AND assignment_status IS NULL
  `);
};

exports.down = async function (db) {
  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guests'
      AND COLUMN_NAME = 'assignment_status'
  `);

  if (columns.length) {
    await db.query('ALTER TABLE guests DROP COLUMN assignment_status');
  }
};
