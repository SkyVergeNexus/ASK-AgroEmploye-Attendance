// Migration 010: make the assignment state reflect the admin action.
exports.up = async function (db) {
  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guests'
      AND COLUMN_NAME = 'assignment_status'
  `);
  if (!columns.length) return;

  await db.query(`
    ALTER TABLE guests
    MODIFY COLUMN assignment_status
      ENUM('pending','assigned','accepted','completed','cancelled') NULL DEFAULT NULL
  `);
  await db.query(`
    UPDATE guests
    SET assignment_status = 'assigned'
    WHERE assignment_status = 'pending'
  `);
  await db.query(`
    ALTER TABLE guests
    MODIFY COLUMN assignment_status
      ENUM('assigned','accepted','completed','cancelled') NULL DEFAULT NULL
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
  if (!columns.length) return;

  await db.query(`
    ALTER TABLE guests
    MODIFY COLUMN assignment_status
      ENUM('pending','assigned','accepted','completed','cancelled') NULL DEFAULT NULL
  `);
  await db.query(`
    UPDATE guests
    SET assignment_status = 'pending'
    WHERE assignment_status = 'assigned'
  `);
  await db.query(`
    ALTER TABLE guests
    MODIFY COLUMN assignment_status
      ENUM('pending','accepted','completed','cancelled') NULL DEFAULT NULL
  `);
};
