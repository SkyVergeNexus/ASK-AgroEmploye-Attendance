const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { pickEmployeeForService } = require('../helpers/assignment');
const router = express.Router();

// ============ PUBLIC: GUEST REGISTRATION ============
router.post('/register', async (req, res) => {
  const { full_name, phone, gender, service_id, purpose, notes } = req.body || {};

  try {
    if (!full_name?.trim()) {
      return res.status(400).json({ message: 'Full name is required' });
    }
    if (!phone?.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    if (!service_id) {
      return res.status(400).json({ message: 'Please select a service' });
    }

    const [svcRows] = await pool.query(
      'SELECT id, name, is_active FROM services WHERE id = ?',
      [service_id]
    );
    if (!svcRows.length || !svcRows[0].is_active) {
      return res.status(400).json({ message: 'Invalid or inactive service' });
    }
    const svc = svcRows[0];

    let purposeText = purpose?.trim();
    if (svc.name === 'Other' && !purposeText) {
      return res.status(400).json({
        message: 'Please describe the purpose of your visit',
      });
    }
    if (purposeText && purposeText.length > 255) {
      return res.status(400).json({ message: 'Purpose must be 255 characters or fewer' });
    }
    if (notes && notes.length > 1000) {
      return res.status(400).json({ message: 'Notes must be 1000 characters or fewer' });
    }

    // Auto-assign based on service → department/role match
    const assignedEmployeeId = await pickEmployeeForService(pool, service_id);

    const [result] = await pool.query(
      `INSERT INTO guests
         (full_name, phone, gender, service_id, purpose, notes,
          assigned_employee_id, assigned_at, assignment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        phone.trim(),
        gender || null,
        service_id,
        purposeText || svc.name,
        notes?.trim() || null,
        assignedEmployeeId,
        assignedEmployeeId ? new Date() : null,
        assignedEmployeeId ? 'pending' : null,
      ]
    );

    res.status(201).json({
      message: 'Thank you for signing in. The team has been notified.',
      guest_id: result.insertId,
      assigned: Boolean(assignedEmployeeId),
    });
  } catch (err) {
    console.error('[guests] register:', err.message);
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// ============ EMPLOYEE: MY ASSIGNED GUESTS ============
router.get('/mine', verifyToken, async (req, res) => {
  const { status } = req.query;
  try {
    let sql = `
      SELECT g.id, g.full_name, g.phone, g.gender, g.purpose, g.notes,
             g.created_at, g.assigned_at, g.assignment_status,
             s.name AS service_name
      FROM guests g
      LEFT JOIN services s ON g.service_id = s.id
      WHERE g.assigned_employee_id = ?
    `;
    const params = [req.user.id];
    if (status) {
      sql += ' AND g.assignment_status = ?';
      params.push(status);
    }
    sql += ' ORDER BY g.assigned_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[guests] mine:', err.message);
    res.status(500).json({ message: 'Failed to load assigned guests' });
  }
});

// ============ EMPLOYEE: MARK STATUS ============
router.put('/:id/status', verifyToken, async (req, res) => {
  const { status } = req.body || {};
  const allowed = ['accepted', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT assigned_employee_id, assignment_status FROM guests WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Guest not found' });

    const isAdminUser = req.user.system_role === 'admin';
    if (rows[0].assigned_employee_id !== req.user.id && !isAdminUser) {
      return res.status(403).json({ message: 'Not your assignment' });
    }

    const from = rows[0].assignment_status;
    const legal =
      (from === 'pending' && status === 'accepted') ||
      (from === 'accepted' && status === 'completed') ||
      (from === 'pending' && status === 'cancelled') ||
      (from === 'accepted' && status === 'cancelled') ||
      isAdminUser;

    if (!legal) {
      return res.status(400).json({ message: `Cannot move from ${from} to ${status}` });
    }

    await pool.query(
      'UPDATE guests SET assignment_status = ? WHERE id = ?',
      [status, req.params.id]
    );
    res.json({ message: `Marked ${status}` });
  } catch (err) {
    console.error('[guests] status:', err.message);
    res.status(500).json({ message: 'Update failed' });
  }
});

// ============ ADMIN: REASSIGN ============
router.put('/:id/reassign', verifyToken, isAdmin, async (req, res) => {
  const { employee_id } = req.body || {};
  if (!employee_id) return res.status(400).json({ message: 'employee_id required' });
  try {
    const [emp] = await pool.query(
      'SELECT id FROM employees WHERE id = ? AND is_active = 1 AND is_approved = 1',
      [employee_id]
    );
    if (!emp.length) return res.status(400).json({ message: 'Invalid employee' });

    await pool.query(
      `UPDATE guests
       SET assigned_employee_id = ?, assigned_at = NOW(), assignment_status = 'pending'
       WHERE id = ?`,
      [employee_id, req.params.id]
    );
    res.json({ message: 'Reassigned' });
  } catch (err) {
    console.error('[guests] reassign:', err.message);
    res.status(500).json({ message: 'Reassign failed' });
  }
});

// ============ ADMIN: LIST GUESTS ============
router.get('/', verifyToken, isAdmin, async (req, res) => {
  const { from, to, search } = req.query;

  let sql = `
    SELECT g.*,
           s.name AS service_name,
           e.full_name AS assigned_employee_name,
           e.employee_code AS assigned_employee_code
    FROM guests g
    LEFT JOIN services s ON g.service_id = s.id
    LEFT JOIN employees e ON g.assigned_employee_id = e.id
    WHERE 1 = 1
  `;
  const params = [];

  if (from) {
    sql += ' AND DATE(g.created_at) >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND DATE(g.created_at) <= ?';
    params.push(to);
  }
  if (search) {
    sql +=
      ' AND (g.full_name LIKE ? OR g.phone LIKE ? OR g.purpose LIKE ? OR s.name LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY g.created_at DESC';

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[guests] list:', err.message);
    res.status(500).json({ message: 'Failed to load guests' });
  }
});

// ============ ADMIN: DELETE GUEST ============
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM guests WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Guest not found' });
    }
    res.json({ message: 'Guest record deleted' });
  } catch (err) {
    console.error('[guests] delete:', err.message);
    res.status(500).json({ message: 'Delete failed' });
  }
});

// ============ ADMIN: STATS ============
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) total FROM guests');
    const [[{ today }]] = await pool.query(
      'SELECT COUNT(*) today FROM guests WHERE DATE(created_at) = CURDATE()'
    );
    const [[{ week }]] = await pool.query(
      'SELECT COUNT(*) week FROM guests WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );
    const [[{ unassigned }]] = await pool.query(
      `SELECT COUNT(*) unassigned FROM guests
       WHERE assigned_employee_id IS NULL
         AND DATE(created_at) = CURDATE()`
    );
    res.json({ total, today, week, unassigned_today: unassigned });
  } catch (err) {
    console.error('[guests] stats:', err.message);
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

module.exports = router;