async function getSenderColumns(db) {
  const [rows] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'notification_email_settings'
      AND COLUMN_NAME IN ('auth_type', 'encrypted_refresh_token')
  `);
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

exports.up = async function (db) {
  const columns = await getSenderColumns(db);
  const drops = ['encrypted_refresh_token', 'auth_type']
    .filter((column) => columns.has(column))
    .map((column) => `DROP COLUMN ${column}`);

  if (drops.length) {
    await db.query(`ALTER TABLE notification_email_settings ${drops.join(', ')}`);
  }
};

exports.down = async function (db) {
  const columns = await getSenderColumns(db);
  if (!columns.has('auth_type')) {
    await db.query(`
      ALTER TABLE notification_email_settings
      ADD COLUMN auth_type
        ENUM('smtp_password', 'outlook_oauth2')
        NOT NULL DEFAULT 'smtp_password'
        AFTER secure
    `);
  }
  if (!columns.has('encrypted_refresh_token')) {
    await db.query(`
      ALTER TABLE notification_email_settings
      ADD COLUMN encrypted_refresh_token TEXT NULL
      AFTER encrypted_password
    `);
  }
};
