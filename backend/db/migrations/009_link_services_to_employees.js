// Migration 009: store the primary staff member responsible for each service.
exports.up = async function (db) {
  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'services'
      AND COLUMN_NAME = 'assigned_employee_id'
  `);

  if (!columns.length) {
    await db.query(`
      ALTER TABLE services
      ADD COLUMN assigned_employee_id INT NULL AFTER role_id
    `);
  }

  const [constraints] = await db.query(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'services'
      AND COLUMN_NAME = 'assigned_employee_id'
      AND REFERENCED_TABLE_NAME = 'employees'
  `);

  if (!constraints.length) {
    await db.query(`
      ALTER TABLE services
      ADD CONSTRAINT fk_service_assigned_employee
        FOREIGN KEY (assigned_employee_id) REFERENCES employees(id)
        ON DELETE SET NULL
    `);
  }
};

exports.down = async function (db) {
  const [constraints] = await db.query(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'services'
      AND CONSTRAINT_NAME = 'fk_service_assigned_employee'
  `);
  if (constraints.length) {
    await db.query('ALTER TABLE services DROP FOREIGN KEY fk_service_assigned_employee');
  }

  const [columns] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'services'
      AND COLUMN_NAME = 'assigned_employee_id'
  `);
  if (columns.length) {
    await db.query('ALTER TABLE services DROP COLUMN assigned_employee_id');
  }
};
