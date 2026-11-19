exports.up = async function (db) {
  await db.query(`
    ALTER TABLE employees
    ADD COLUMN approval_status
      ENUM('pending', 'approved', 'rejected', 'revoked')
      NOT NULL DEFAULT 'pending'
      AFTER is_approved
  `);
  await db.query(`
    UPDATE employees
    SET approval_status = CASE
      WHEN is_approved = 1 THEN 'approved'
      ELSE 'pending'
    END
  `);
};

exports.down = async function (db) {
  await db.query('ALTER TABLE employees DROP COLUMN approval_status');
};
