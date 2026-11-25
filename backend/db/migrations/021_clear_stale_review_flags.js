// Migration 021: clear stale needs_review flags on records that were clocked out.
// Under the new rule, a record is only flagged for admin review when the employee
// never clocked out 9 hours after closing time. Old-system rows that have a
// clock_out but still carry needs_review = 1 are stale and show wrongly as
// "awaiting admin approval".

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
  const hasNeedsReview = await columnExists(db, 'attendance', 'needs_review');
  const hasAdminResolved = await columnExists(db, 'attendance', 'admin_resolved');
  if (!hasNeedsReview || !hasAdminResolved) {
    console.log('[migration 021] needs_review/admin_resolved missing, nothing to clean');
    return;
  }

  const hasReviewNote = await columnExists(db, 'attendance', 'review_note');

  const [result] = await db.query(`
    UPDATE attendance
    SET needs_review = 0
        ${hasReviewNote ? ', review_note = NULL' : ''}
    WHERE clock_out IS NOT NULL
      AND admin_resolved = 0
      AND needs_review = 1
  `);

  console.log(`[migration 021] cleared stale review flags on ${result.affectedRows} record(s)`);
};

exports.down = async function () {
  // Data cleanup only. The original flags were stale and cannot be restored.
};