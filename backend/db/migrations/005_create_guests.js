// Migration 005: guest/customer visit log
// Stores walk-in visitors who register on the login page.
// No auth — anyone can submit. Only admins can view.

exports.up = async function (db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS guests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      gender ENUM('male','female','other') NULL,
      purpose VARCHAR(255) NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

exports.down = async function (db) {
  await db.query('DROP TABLE IF EXISTS guests');
};