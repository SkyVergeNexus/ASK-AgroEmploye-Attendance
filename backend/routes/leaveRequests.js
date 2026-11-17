const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function employeeOnly(req, res, next) {
  if (req.user.system_role !== 'employee') {
    return res.status(403).json({ message: 'Employee access required' });
  }
  next();
}

function reportError(res, err, context, message) {
  console.error(`[leave-requests] ${context}:`, err.message);
  if (err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({
      message: 'Absence request storage is not initialized. Run npm run db:migrate on the backend, then restart it.',
    });
  }
  return res.status(500).json({ message });
}

router.post('/', verifyToken, employeeOnly, async (req, res) => {
  const { start_date, end_date, reason } = req.body || {};
  const reasonText = typeof reason === 'string' ? reason.trim() : '';

  if (!isValidDate(start_date) || !isValidDate(end_date)) {
    return res.status(400).json({ message: 'Select a valid start and end date' });
  }
  if (end_date < start_date) {
    return res.status(400).json({ message: 'End date cannot be before start date' });
  }
  const requestedDays =
    (Date.parse(`${end_date}T00:00:00.000Z`) -
      Date.parse(`${start_date}T00:00:00.000Z`)) /
      86400000 +
    1;
  if (requestedDays > 366) {
    return res.status(400).json({ message: 'A request cannot exceed 366 days' });
  }
  if (!reasonText) {
    return res.status(400).json({ message: 'A reason is required' });
  }
  if (reasonText.length > 2000) {
    return res.status(400).json({ message: 'Reason must be 2000 characters or fewer' });
  }

  try {
    const [[{ today }]] = await pool.query(
      "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today"
    );
    if (start_date < today) {
      return res.status(400).json({ message: 'Requests must start today or on a future date' });
    }

    const [overlaps] = await pool.query(
      `SELECT id FROM absence_requests
       WHERE employee_id = ?
         AND status IN ('pending','approved')
         AND start_date <= ? AND end_date >= ?
       LIMIT 1`,
      [req.user.id, end_date, start_date]
    );
    if (overlaps.length) {
      return res.status(409).json({
        message: 'You already have a pending or approved request covering those dates',
      });
    }

    const [result] = await pool.query(
      `INSERT INTO absence_requests (employee_id, start_date, end_date, reason)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, start_date, end_date, reasonText]
    );
    res.status(201).json({
      message: 'Absence request submitted for admin approval',
      request_id: result.insertId,
    });
  } catch (err) {
    reportError(res, err, 'create', 'Failed to submit absence request');
  }
});

router.get('/mine', verifyToken, employeeOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.employee_id,
              DATE_FORMAT(r.start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(r.end_date, '%Y-%m-%d') AS end_date,
              r.reason, r.status, r.admin_note, r.decided_by, r.decided_at,
              r.created_at, r.updated_at, a.full_name AS decided_by_name
       FROM absence_requests r
       LEFT JOIN employees a ON a.id = r.decided_by
       WHERE r.employee_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    reportError(res, err, 'mine', 'Failed to load your absence requests');
  }
});

router.delete('/:id', verifyToken, employeeOnly, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE absence_requests
       SET status = 'cancelled'
       WHERE id = ? AND employee_id = ? AND status = 'pending'`,
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) {
      return res.status(400).json({
        message: 'Request not found or it has already been reviewed',
      });
    }
    res.json({ message: 'Request cancelled' });
  } catch (err) {
    reportError(res, err, 'cancel', 'Failed to cancel request');
  }
});

router.get('/admin', verifyToken, isAdmin, async (req, res) => {
  try {
    const sql = `
      SELECT r.id, r.employee_id,
             DATE_FORMAT(r.start_date, '%Y-%m-%d') AS start_date,
             DATE_FORMAT(r.end_date, '%Y-%m-%d') AS end_date,
             r.reason, r.status, r.admin_note, r.decided_by, r.decided_at,
             r.created_at, r.updated_at,
             e.full_name, e.employee_code, e.email,
             d.name AS department_name,
             a.full_name AS decided_by_name
      FROM absence_requests r
      JOIN employees e ON e.id = r.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN employees a ON a.id = r.decided_by
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
    `;
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    reportError(res, err, 'admin list', 'Failed to load absence requests');
  }
});

router.put('/:id/decision', verifyToken, isAdmin, async (req, res) => {
  const { decision, admin_note } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'Decision must be approved or rejected' });
  }
  if (admin_note && (typeof admin_note !== 'string' || admin_note.length > 2000)) {
    return res.status(400).json({ message: 'Admin note must be 2000 characters or fewer' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [requests] = await connection.query(
      `SELECT id, employee_id,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              reason, status, admin_note, decided_by, decided_at,
              created_at, updated_at
       FROM absence_requests
       WHERE id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (!requests.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Request not found' });
    }
    const request = requests[0];
    if (request.status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ message: 'Request has already been reviewed' });
    }

    if (decision === 'approved') {
      const [attendanceRows] = await connection.query(
        `SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
                clock_in, clock_out, status
         FROM attendance
         WHERE employee_id = ?
           AND attendance_date BETWEEN ? AND ?
         FOR UPDATE`,
        [request.employee_id, request.start_date, request.end_date]
      );
      const conflict = attendanceRows.find(
        (row) =>
          row.clock_in ||
          row.clock_out ||
          !['absent', 'leave'].includes(row.status)
      );
      if (conflict) {
        await connection.rollback();
        return res.status(409).json({
          message: `Attendance already exists for ${String(conflict.attendance_date).slice(0, 10)}. Resolve that attendance record before approving this request.`,
        });
      }

      const [dates] = await connection.query(
        `WITH RECURSIVE requested_days AS (
           SELECT CAST(? AS DATE) AS leave_date
           UNION ALL
           SELECT DATE_ADD(leave_date, INTERVAL 1 DAY)
           FROM requested_days
           WHERE leave_date < CAST(? AS DATE)
         )
         SELECT DATE_FORMAT(leave_date, '%Y-%m-%d') AS leave_date
         FROM requested_days`,
        [request.start_date, request.end_date]
      );
      for (const { leave_date } of dates) {
        await connection.query(
          `INSERT INTO attendance (employee_id, attendance_date, status, notes)
           VALUES (?, ?, 'leave', ?)
           ON DUPLICATE KEY UPDATE status = 'leave', notes = VALUES(notes)`,
          [
            request.employee_id,
            leave_date,
              `Approved leave (request #${request.id})`,
          ]
        );
      }
    }

    await connection.query(
      `UPDATE absence_requests
       SET status = ?, admin_note = ?, decided_by = ?, decided_at = NOW()
       WHERE id = ?`,
      [
        decision,
        typeof admin_note === 'string' ? admin_note.trim() || null : null,
        req.user.id,
        req.params.id,
      ]
    );
    await connection.commit();
    res.json({
      message: decision === 'approved' ? 'Absence request approved' : 'Absence request rejected',
    });
  } catch (err) {
    if (connection) await connection.rollback();
    reportError(res, err, 'decision', 'Failed to process absence request');
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
