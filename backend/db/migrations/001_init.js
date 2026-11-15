// Migration 001: initial schema
// Creates all tables for the ASK Agrobusiness attendance system.

exports.up = async function (db) {
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      attendance_date DATE NOT NULL,
      clock_in TIME,
      clock_out TIME,
      early_leave_reason VARCHAR(255) NULL,
      clock_in_lat DECIMAL(10,7) NULL,
      clock_in_lng DECIMAL(10,7) NULL,
      clock_in_ip VARCHAR(64) NULL,
      clock_in_method ENUM('gps','ip','manual','ip+gps') NULL,
      clock_in_verified TINYINT(1) DEFAULT 0,
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
      company_name VARCHAR(100) DEFAULT 'ASK Agrobusiness Limited',
      login_cover_url VARCHAR(500) NULL,
      office_lat DECIMAL(10,7) NULL,
      office_lng DECIMAL(10,7) NULL,
      geofence_radius_m INT DEFAULT 200,
      enforce_location TINYINT(1) DEFAULT 0,
      allowed_ips TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`INSERT IGNORE INTO settings (id) VALUES (1);`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS early_leave_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      attendance_id INT NOT NULL,
      requested_out_time TIME NOT NULL,
      reason TEXT NOT NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      admin_note TEXT NULL,
      decided_by INT NULL,
      decided_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
      FOREIGN KEY (decided_by) REFERENCES employees(id) ON DELETE SET NULL,
      INDEX idx_status (status),
      INDEX idx_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

exports.down = async function (db) {
  // Rollback in reverse order
  await db.query('DROP TABLE IF EXISTS early_leave_requests;');
  await db.query('DROP TABLE IF EXISTS attendance;');
  await db.query('DROP TABLE IF EXISTS employees;');
  await db.query('DROP TABLE IF EXISTS roles;');
  await db.query('DROP TABLE IF EXISTS departments;');
  await db.query('DROP TABLE IF EXISTS settings;');
};