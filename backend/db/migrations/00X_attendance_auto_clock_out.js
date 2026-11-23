// Migration 00X: auto clock-out + admin review
//
// Adds columns so the daily scheduler can auto-close open records when
// the employee was verifiably at work, and flag records for admin review
// when they weren't. Admin decisions close the day with a proper clock_out.

exports.up = async function (db) {
  const wanted = [
    {
      name: 'auto_clocked_out',
      ddl: 'TINYINT(1) NOT NULL DEFAULT 0',
    },
    {
      name: 'auto_clock_out_reason',
      ddl: 'VARCHAR(255) NULL',
    },
    {
      name: 'needs_review',
      ddl: 'TINYINT(1) NOT NULL DEFAULT 0',
    },
    {
      name: 'review_note',
      ddl: 'VARCHAR(500) NULL',
    },
    {
      name: 'admin_resolved',
      ddl: 'TINYINT(1) NOT NULL DEFAULT 0',
    },
    {
      name: 'admin_resolved_by',
      ddl: 'INT NULL',
    },
    {
      name: 'admin_resolved_at',
      ddl: 'TIMESTAMP NULL',
    },
    {
      name: 'auto_close_time',
      ddl: 'TIME NULL',
    },
  ];

  for (const col of wanted) {
    const [existing] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'attendance'
         AND COLUMN_NAME = ?`,
      [col.name]
    );
    if (!existing.length) {
      await db.query(`ALTER TABLE attendance ADD COLUMN ${col.name} ${col.ddl}`);
      console.log(`  + attendance.${col.name}`);
    } else {
      console.log(`  = attendance.${col.name} already exists`);
    }
  }

  // Index for the scheduler's daily scan
  const [idx] = await db.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance'
       AND INDEX_NAME = 'idx_attendance_open'`
  );
  if (!idx.length) {
    await db.query(
      'ALTER TABLE attendance ADD INDEX idx_attendance_open (attendance_date, clock_out)'
    );
    console.log('  + idx_attendance_open');
  }
};

exports.down = async function (db) {
  try { await db.query('ALTER TABLE attendance DROP INDEX idx_attendance_open'); } catch {}
  const cols = [
    'auto_clocked_out', 'auto_clock_out_reason',
    'needs_review', 'review_note',
    'admin_resolved', 'admin_resolved_by', 'admin_resolved_at',
    'auto_close_time',
  ];
  for (const c of cols) {
    try { await db.query(`ALTER TABLE attendance DROP COLUMN ${c}`); } catch {}
  }
};