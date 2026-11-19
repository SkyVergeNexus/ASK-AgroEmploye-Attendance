exports.up = async function (db) {
  await db.query(`
    ALTER TABLE notification_email_settings
      ADD COLUMN auth_type
        ENUM('smtp_password', 'outlook_oauth2')
        NOT NULL DEFAULT 'smtp_password'
        AFTER secure,
      ADD COLUMN encrypted_refresh_token TEXT NULL
        AFTER encrypted_password
  `);
};

exports.down = async function (db) {
  await db.query(`
    ALTER TABLE notification_email_settings
      DROP COLUMN encrypted_refresh_token,
      DROP COLUMN auth_type
  `);
};
