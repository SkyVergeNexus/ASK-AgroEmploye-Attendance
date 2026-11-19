require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const REQUIRED = [
  'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'SEED_ADMIN_CODE', 'SEED_ADMIN_NAME', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD',
];

for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`[seed] missing env var: ${k}`);
    process.exit(1);
  }
}

const DEPARTMENTS = {
  Operations: ['Field Officer', 'Supervisor', 'Operations Manager'],
  Finance: ['Accountant', 'Finance Officer'],
  HR: ['Recruiter', 'HR Officer'],
  Sales: ['Sales Rep', 'Sales Manager'],
};

async function main() {
  const started = Date.now();
  console.log('[seed] connecting to', process.env.DB_HOST, 'port', process.env.DB_PORT || 3306);

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });

  // Verify migrations have been applied. If not, abort.
  const [tables] = await db.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN
       ('departments','roles','employees','attendance','settings','early_leave_requests')`,
    [process.env.DB_NAME]
  );
  if (tables.length < 6) {
    console.error('[seed] Required tables missing. Run "npm run db:migrate" first.');
    await db.end();
    process.exit(1);
  }
  console.log('[seed] all required tables present');

  await db.beginTransaction();
  try {
    // --- Departments ---
    for (const name of Object.keys(DEPARTMENTS)) {
      await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name]);
    }

    // --- Roles ---
    const [deptRows] = await db.query('SELECT id, name FROM departments');
    const deptMap = Object.fromEntries(deptRows.map((d) => [d.name, d.id]));

    for (const [dept, roles] of Object.entries(DEPARTMENTS)) {
      const deptId = deptMap[dept];
      if (!deptId) continue;
      for (const role of roles) {
        await db.query(
          'INSERT IGNORE INTO roles (department_id, name) VALUES (?, ?)',
          [deptId, role]
        );
      }
    }
    console.log('[seed] departments + roles ensured');

    // --- Admin user ---
    const [existing] = await db.query(
      'SELECT id, is_approved FROM employees WHERE email = ?',
      [process.env.SEED_ADMIN_EMAIL]
    );

    let created = false;
    if (existing.length === 0) {
      const [deptRow] = await db.query(
        'SELECT id FROM departments WHERE name = ?',
        [process.env.SEED_ADMIN_DEPARTMENT]
      );
      const deptId = deptRow[0]?.id || null;

      let roleId = null;
      if (deptId) {
        const [roleRow] = await db.query(
          'SELECT id FROM roles WHERE department_id = ? AND name = ?',
          [deptId, process.env.SEED_ADMIN_ROLE]
        );
        roleId = roleRow[0]?.id || null;
      }

      const hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 10);
      await db.query(
        `INSERT INTO employees
          (employee_code, full_name, email, password_hash, gender, department_id, role_id, system_role, is_approved, approval_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', TRUE, 'approved')`,
        [
          process.env.SEED_ADMIN_CODE,
          process.env.SEED_ADMIN_NAME,
          process.env.SEED_ADMIN_EMAIL,
          hash,
          process.env.SEED_ADMIN_GENDER || null,
          deptId,
          roleId,
        ]
      );
      created = true;
    } else if (!existing[0].is_approved) {
      await db.query(
        "UPDATE employees SET is_approved = TRUE, approval_status = 'approved' WHERE id = ?",
        [existing[0].id]
      );
      console.log('[seed] existing admin force-approved');
    }

    await db.commit();

    console.log(`[seed] admin ${created ? 'created' : 'already exists'}`);

    if (process.env.SEED_SHOW_CREDENTIALS === 'true') {
      console.log('\n================ ADMIN LOGIN ================');
      console.log('  Email    :', process.env.SEED_ADMIN_EMAIL);
      console.log('  Password :', process.env.SEED_ADMIN_PASSWORD);
      console.log('=============================================\n');
    }

    console.log(`[seed] done in ${Date.now() - started}ms`);
  } catch (err) {
    await db.rollback();
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});