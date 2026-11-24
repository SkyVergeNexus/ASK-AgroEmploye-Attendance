exports.up = async function (db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      event_type VARCHAR(60) NOT NULL,
      title VARCHAR(180) NOT NULL,
      message TEXT NOT NULL,
      target_path VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP NULL DEFAULT NULL,
      CONSTRAINT fk_notifications_employee
        FOREIGN KEY (employee_id) REFERENCES employee0s(id) ON DELETE CASCADE,
      INDEX idx_notifications_employee_unread (employee_id, read_at, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

exports.down = async function (db) {
  await db.query('DROP TABLE IF EXISTS notifications');
};
