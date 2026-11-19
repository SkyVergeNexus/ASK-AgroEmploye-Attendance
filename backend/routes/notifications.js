const express = require('express');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

function handleStorageError(res, error, action) {
  if (error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({
      message: 'Notification storage is not initialized. Restart the backend with the migration command.',
    });
  }
  console.error(`[notifications] ${action}:`, error.message);
  return res.status(500).json({ message: 'Unable to load notifications' });
}

router.get('/', verifyToken, async (req, res) => {
  const requestedLimit = Number(req.query.limit) || 20;
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 50);
  const requestedOffset = Number(req.query.offset);
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0
    ? requestedOffset
    : 0;
  const unreadOnly = req.query.unread === 'true';
  const unreadCondition = unreadOnly ? ' AND read_at IS NULL' : '';

  try {
    const [items] = await pool.query(
      `SELECT id, event_type, title, message, target_path, created_at, read_at
       FROM notifications
       WHERE employee_id = ?${unreadCondition}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );
    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS total_count,
              COALESCE(SUM(read_at IS NULL), 0) AS unread_count
       FROM notifications
       WHERE employee_id = ?`,
      [req.user.id]
    );
    const totalCount = Number(counts.total_count) || 0;
    const unreadCount = Number(counts.unread_count) || 0;
    res.json({
      items,
      total_count: totalCount,
      unread_count: unreadCount,
      filtered_count: unreadOnly ? unreadCount : totalCount,
    });
  } catch (error) {
    handleStorageError(res, error, 'list');
  }
});

router.put('/read-all', verifyToken, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE employee_id = ? AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ updated: result.affectedRows });
  } catch (error) {
    handleStorageError(res, error, 'mark all read');
  }
});

router.put('/:id/read', verifyToken, async (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    return res.status(400).json({ message: 'Invalid notification id' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND employee_id = ?`,
      [notificationId, req.user.id]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query(
        'SELECT id FROM notifications WHERE id = ? AND employee_id = ?',
        [notificationId, req.user.id]
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'Notification not found' });
      }
    }
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    handleStorageError(res, error, 'mark read');
  }
});

module.exports = router;
