exports.up = async function (db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_email_settings (
      id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
      host VARCHAR(255) NOT NULL,
      port SMALLINT UNSIGNED NOT NULL,
      secure TINYINT(1) NOT NULL DEFAULT 0,
      username VARCHAR(255) NOT NULL,
      encrypted_password TEXT NOT NULL,
      from_email VARCHAR(255) NOT NULL,
      updated_by INT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_notification_email_settings_updated_by
        FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

exports.down = async function (db) {
  await db.query('DROP TABLE IF EXISTS notification_email_settings');
};
