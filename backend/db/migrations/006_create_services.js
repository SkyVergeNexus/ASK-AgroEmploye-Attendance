// Migration 006: services catalog + guest service_id linkage
// Allows admins to define a list of visitor services, and guests to
// pick from that list instead of typing free-text purposes.
//
// Seeds default services the same way db/seed.js seeds departments & roles:
//   - INSERT IGNORE so re-running never duplicates
//   - each row is independently idempotent
//   - matches the shape of the seed script for consistency

exports.up = async function (db) {
  // ---- 1. services table ----
  await db.query(`
    CREATE TABLE IF NOT EXISTS services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_service_name (name),
      INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // ---- 2. seed default services ----
  // Same pattern as db/seed.js: INSERT IGNORE for each entry so that
  // re-running the migration on an existing DB does not duplicate or error.
  const DEFAULT_SERVICES = [
    {
      name: 'Meeting with HR',
      description: 'Interviews, appointments, HR consultations',
    },
    {
      name: 'Delivery',
      description: 'Packages, mail, or supplies drop-off',
    },
    {
      name: 'Interview',
      description: 'Scheduled job interview',
    },
    {
      name: 'Site Visit',
      description: 'Tour or inspection of premises',
    },
    {
      name: 'Other',
      description: 'Anything not listed — we will ask you to describe',
    },
  ];

  for (const svc of DEFAULT_SERVICES) {
    await db.query(
      `INSERT IGNORE INTO services (name, description, is_active)
       VALUES (?, ?, 1)`,
      [svc.name, svc.description]
    );
  }

  // ---- 3. add service_id column to guests (nullable) ----
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guests'
      AND COLUMN_NAME = 'service_id'
  `);
  if (!cols.length) {
    await db.query(`
      ALTER TABLE guests
      ADD COLUMN service_id INT NULL AFTER gender,
      ADD CONSTRAINT fk_guest_service
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE SET NULL
    `);
  }
};

exports.down = async function (db) {
  // Drop FK first, then column, then table
  try {
    await db.query('ALTER TABLE guests DROP FOREIGN KEY fk_guest_service');
  } catch {
    /* ignore if FK doesn't exist */
  }
  try {
    await db.query('ALTER TABLE guests DROP COLUMN service_id');
  } catch {
    /* ignore if column doesn't exist */
  }
  await db.query('DROP TABLE IF EXISTS services');
};