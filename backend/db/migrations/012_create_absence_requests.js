// Migration 012: employee requests for approved days away from work.
exports.up = async function (db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS absence_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT NOT NULL,
      status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
      admin_note TEXT NULL,
      decided_by INT NULL,
      decided_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_absence_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT fk_absence_decided_by
        FOREIGN KEY (decided_by) REFERENCES employees(id) ON DELETE SET NULL,
      INDEX idx_absence_status (status),
      INDEX idx_absence_employee_dates (employee_id, start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

exports.down = async function (db) {
  await db.query('DROP TABLE IF EXISTS absence_requests');
};
