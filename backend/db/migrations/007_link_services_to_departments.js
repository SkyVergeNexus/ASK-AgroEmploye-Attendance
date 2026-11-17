// Migration 007: link services to departments/roles, and guests to assigned employees
//
// Each service can now be associated with a department (and optionally a role).
// When a guest picks a service, the system can suggest employees from that
// department/role. The admin then assigns a specific employee to the guest.

exports.up = async function (db) {
  // ---- 1. services: add department_id + role_id ----
  const serviceCols = ['department_id', 'role_id'];
  for (const col of serviceCols) {
    const [rows] = await db.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'services'
        AND COLUMN_NAME = ?
    `, [col]);
    if (!rows.length) {
      const definition =
        col === 'department_id' ? 'INT NULL' : 'INT NULL';
      await db.query(`
        ALTER TABLE services
        ADD COLUMN ${col} ${definition}
        AFTER description
      `);
    }
  }

  // Foreign keys (added separately so they can be skipped if they exist)
  try {
    await db.query(`
      ALTER TABLE services
      ADD CONSTRAINT fk_service_department
        FOREIGN KEY (department_id) REFERENCES departments(id)
        ON DELETE SET NULL
    `);
  } catch { /* already exists */ }

  try {
    await db.query(`
      ALTER TABLE services
      ADD CONSTRAINT fk_service_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE SET NULL
    `);
  } catch { /* already exists */ }

  // ---- 2. guests: add assigned_employee_id + assignment metadata ----
  const guestCols = ['assigned_employee_id', 'assigned_at', 'assigned_by'];
  for (const col of guestCols) {
    const [rows] = await db.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'guests'
        AND COLUMN_NAME = ?
    `, [col]);
    if (!rows.length) {
      const type =
        col === 'assigned_employee_id' ? 'INT NULL'
        : col === 'assigned_at' ? 'TIMESTAMP NULL'
        : 'INT NULL';
      await db.query(`
        ALTER TABLE guests
        ADD COLUMN ${col} ${type}
      `);
    }
  }

  try {
    await db.query(`
      ALTER TABLE guests
      ADD CONSTRAINT fk_guest_assigned
        FOREIGN KEY (assigned_employee_id) REFERENCES employees(id)
        ON DELETE SET NULL
    `);
  } catch { /* already exists */ }

  // ---- 3. seed department links for the default services ----
  // Match "Meeting with HR" and "Interview" to the HR department,
  // "Delivery" to Operations. Adjust if your departments differ.
  const defaultLinks = [
    { service: 'Meeting with HR', dept: 'HR' },
    { service: 'Interview',       dept: 'HR' },
    { service: 'Delivery',        dept: 'Operations' },
    { service: 'Site Visit',      dept: 'Operations' },
  ];

  for (const { service, dept } of defaultLinks) {
    await db.query(`
      UPDATE services s
      JOIN departments d ON d.name = ?
      SET s.department_id = d.id
      WHERE s.name = ? AND s.department_id IS NULL
    `, [dept, service]);
  }
};

exports.down = async function (db) {
  try {
    await db.query('ALTER TABLE guests DROP FOREIGN KEY fk_guest_assigned');
  } catch { /* ignore */ }
  try {
    await db.query('ALTER TABLE services DROP FOREIGN KEY fk_service_department');
  } catch { /* ignore */ }
  try {
    await db.query('ALTER TABLE services DROP FOREIGN KEY fk_service_role');
  } catch { /* ignore */ }

  for (const col of ['assigned_employee_id', 'assigned_at', 'assigned_by']) {
    try {
      await db.query(`ALTER TABLE guests DROP COLUMN ${col}`);
    } catch { /* ignore */ }
  }
  for (const col of ['department_id', 'role_id']) {
    try {
      await db.query(`ALTER TABLE services DROP COLUMN ${col}`);
    } catch { /* ignore */ }
  }
};