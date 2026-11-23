// Migration 020: store live-presence state and boundary events for attendance.

async function columnExists(db, table, column) {
  const [rows] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
  `, [table, column]);
  return rows.length > 0;
}

exports.up = async function (db) {
  const columns = [
    ['presence_state', "ENUM('unknown','inside','outside') NOT NULL DEFAULT 'unknown'"],
    ['presence_gps_inside', 'TINYINT(1) NULL'],
    ['presence_network_inside', 'TINYINT(1) NULL'],
    ['presence_last_seen_at', 'DATETIME NULL'],
    ['presence_outside_count', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
    ['presence_outside_since', 'DATETIME NULL'],
    ['after_close_tracking', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['admin_resolved_reason', 'TEXT NULL'],
  ];

  for (const [name, definition] of columns) {
    if (!(await columnExists(db, 'attendance', name))) {
      await db.query(`ALTER TABLE attendance ADD COLUMN ${name} ${definition}`);
    }
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS attendance_presence_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      attendance_id INT NOT NULL,
      event_type ENUM('arrival','departure','return') NOT NULL,
      event_at DATETIME NOT NULL,
      gps_inside TINYINT(1) NULL,
      network_inside TINYINT(1) NULL,
      latitude DECIMAL(10,7) NULL,
      longitude DECIMAL(10,7) NULL,
      client_ip VARCHAR(64) NULL,
      INDEX idx_presence_attendance_time (attendance_id, event_at),
      CONSTRAINT fk_presence_event_attendance
        FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};

exports.down = async function (db) {
  await db.query('DROP TABLE IF EXISTS attendance_presence_events');
  for (const name of [
    'presence_state',
    'presence_gps_inside',
    'presence_network_inside',
    'presence_last_seen_at',
    'presence_outside_count',
    'presence_outside_since',
    'after_close_tracking',
    'admin_resolved_reason',
  ]) {
    if (await columnExists(db, 'attendance', name)) {
      await db.query(`ALTER TABLE attendance DROP COLUMN ${name}`);
    }
  }
};
