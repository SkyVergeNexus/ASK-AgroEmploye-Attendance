exports.up = async function (db) {
  await db.query(`
    ALTER TABLE notification_email_settings
      ADD COLUMN provider
        ENUM('smtp', 'gmail_api')
        NOT NULL DEFAULT 'smtp'
        AFTER secure,
      ADD COLUMN encrypted_google_refresh_token TEXT NULL
        AFTER encrypted_password
  `);
};

exports.down = async function (db) {
  await db.query(`
    ALTER TABLE notification_email_settings
      DROP COLUMN encrypted_google_refresh_token,
      DROP COLUMN provider
  `);
};
