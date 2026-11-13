require('dotenv').config();
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

  // Aiven: connect directly to the existing database with SSL.
  // Skip CREATE DATABASE (avnadmin can't create DBs on free tier).
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });

  await db.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      UNIQUE KEY unique_role_per_dept (department_id, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_code VARCHAR(50) UNIQUE NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      gender ENUM('male','female','other') NULL,
      profile_picture VARCHAR(255) NULL,
      department_id INT NULL,
      role_id INT NULL,
      system_role ENUM('admin','employee') DEFAULT 'employee',
      is_active BOOLEAN DEFAULT TRUE,
      is_approved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Migration: add is_approved column if an older DB is missing it
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'is_approved'`,
    [process.env.DB_NAME]
  );
  if (cols.length === 0) {
    console.log('[seed] migrating: adding is_approved column');
    await db.query(
      'ALTER TABLE employees ADD COLUMN is_approved BOOLEAN DEFAULT FALSE AFTER is_active'
    );
    await db.query('UPDATE employees SET is_approved = TRUE');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      attendance_date DATE NOT NULL,
      clock_in TIME,
      clock_out TIME,
      status ENUM('present','late','absent','half-day','leave') DEFAULT 'present',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE KEY unique_attendance (employee_id, attendance_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1,
      work_start TIME DEFAULT '08:00:00',
      work_end TIME DEFAULT '17:00:00',
      late_threshold_minutes INT DEFAULT 15,
      company_name VARCHAR(100) DEFAULT 'ASK Agrobusiness Limited'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query('INSERT IGNORE INTO settings (id) VALUES (1);');
  console.log('[seed] tables ensured');

  await db.beginTransaction();
  try {
    for (const name of Object.keys(DEPARTMENTS)) {
      await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name]);
    }

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
          (employee_code, full_name, email, password_hash, gender, department_id, role_id, system_role, is_approved)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', TRUE)`,
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
        'UPDATE employees SET is_approved = TRUE WHERE id = ?',
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