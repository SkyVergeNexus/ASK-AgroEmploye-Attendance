const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { getEmployeeSuggestions } = require('../helpers/assignment');
const { notifyAdmins, notifyUser } = require('../helpers/notifications');
const router = express.Router();

// ============ PUBLIC: GUEST REGISTRATION ============
router.post('/register', async (req, res) => {
  const { full_name, phone, gender, service_id, purpose, notes } = req.body || {};

  try {
    if (typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ message: 'Full name is required' });
    }
    if (full_name.trim().length > 120) {
      return res.status(400).json({ message: 'Full name must be 120 characters or fewer' });
    }
    if (typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    if (phone.trim().length > 30) {
      return res.status(400).json({ message: 'Phone number must be 30 characters or fewer' });
    }
    if (!service_id) {
      return res.status(400).json({ message: 'Please select a service' });
    }
    if (gender && !['male', 'female', 'other'].includes(gender)) {
      return res.status(400).json({ message: 'Invalid gender' });
    }
    if (typeof purpose !== 'string' || !purpose.trim()) {
      return res.status(400).json({ message: 'Please describe the purpose of your visit' });
    }

    const [svcRows] = await pool.query(
      'SELECT id, name, is_active FROM services WHERE id = ?',
      [service_id]
    );
    if (!svcRows.length || !svcRows[0].is_active) {
      return res.status(400).json({ message: 'Invalid or inactive service' });
    }
    const purposeText = purpose.trim();
    if (purposeText.length > 255) {
      return res.status(400).json({ message: 'Purpose must be 255 characters or fewer' });
    }
    if (notes && (typeof notes !== 'string' || notes.length > 1000)) {
      return res.status(400).json({ message: 'Notes must be 1000 characters or fewer' });
    }

    const [result] = await pool.query(
      `INSERT INTO guests (full_name, phone, gender, service_id, purpose, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        phone.trim(),
        gender || null,
        service_id,
        purposeText,
        typeof notes === 'string' ? notes.trim() || null : null,
      ]
    );

    await notifyAdmins({
      type: 'guest_checkin',
      title: 'New guest checked in',
      message: `${full_name.trim()} checked in for ${svcRows[0].name}.`,
      targetPath: '/guests',
    });

    res.status(201).json({
      message: 'Thank you for signing in. Your visit has been registered.',
      guest_id: result.insertId,
      assigned: false,
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
             g.created_at, g.assigned_at, g.completed_at, g.assignment_status,
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

// ============ ADMIN: STAFF SUGGESTIONS FOR A GUEST ============
router.get('/:id/suggestions', verifyToken, isAdmin, async (req, res) => {
  try {
    const [guestRows] = await pool.query(
      `SELECT g.id, g.service_id, g.purpose, s.name AS service_name
       FROM guests g
       LEFT JOIN services s ON s.id = g.service_id
       WHERE g.id = ?`,
      [req.params.id]
    );
    if (!guestRows.length) {
      return res.status(404).json({ message: 'Guest not found' });
    }

    const guest = guestRows[0];
    if (!guest.service_id) {
      return res.json({
        service: null,
        service_name: guest.service_name,
        employees: [],
        message: 'This guest has no recorded service, so staff cannot be matched. Assign a service to the guest before choosing an employee.',
      });
    }

    const suggestions = await getEmployeeSuggestions(
      pool,
      guest.service_id,
      guest.purpose
    );
    if (
      !suggestions.service?.department_id &&
      !suggestions.service?.role_id &&
      !suggestions.service?.assigned_employee_id
    ) {
      return res.json({
        service: suggestions.service,
        service_name: guest.service_name,
        employees: [],
        message: 'This service has no linked staff profile. Update it on the Services page before assigning a guest.',
      });
    }

    const hasProfileMatches = suggestions.employees.some(
      (employee) => employee.profile_match
    );
    res.json({
      service: suggestions.service,
      service_name: guest.service_name,
      employees: suggestions.employees,
      message: hasProfileMatches
        ? null
        : suggestions.employees.length
          ? 'No active, approved employees match this service. Update its department, role, or assigned employee on the Services page.'
          : 'No active, approved employees match this service. Update its department, role, or assigned employee on the Services page.',
    });
  } catch (err) {
    console.error('[guests] suggestions:', err.message);
    res.status(500).json({ message: 'Failed to load staff suggestions' });
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
      'SELECT assigned_employee_id, assignment_status, full_name FROM guests WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Guest not found' });

    const isAdminUser = req.user.system_role === 'admin';
    if (rows[0].assigned_employee_id !== req.user.id && !isAdminUser) {
      return res.status(403).json({ message: 'Not your assignment' });
    }

    const from = rows[0].assignment_status;
    const legal =
      (from === 'assigned' && status === 'accepted') ||
      (from === 'accepted' && status === 'completed') ||
      (from === 'assigned' && status === 'cancelled') ||
      (from === 'accepted' && status === 'cancelled') ||
      isAdminUser;

    if (!legal) {
      return res.status(400).json({ message: `Cannot move from ${from} to ${status}` });
    }

    if (status === 'completed') {
      await pool.query(
        'UPDATE guests SET assignment_status = ?, completed_at = NOW() WHERE id = ?',
        [status, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE guests SET assignment_status = ? WHERE id = ?',
        [status, req.params.id]
      );
    }

    if (req.user.system_role === 'employee') {
      await notifyAdmins({
        type: 'guest_status',
        title: `Guest ${status}`,
        message: `${rows[0].full_name} was marked ${status}.`,
        targetPath: '/guests',
      });
    }

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
    const [guestRows] = await pool.query(
      `SELECT id, service_id, assigned_employee_id, assignment_status, full_name
       FROM guests WHERE id = ?`,
      [req.params.id]
    );
    if (!guestRows.length) return res.status(404).json({ message: 'Guest not found' });

    const [emp] = await pool.query(
      `SELECT id, department_id, role_id FROM employees
       WHERE id = ? AND system_role = 'employee'
         AND is_active = 1 AND is_approved = 1`,
      [employee_id]
    );
    if (!emp.length) return res.status(400).json({ message: 'Invalid employee' });

    if (!guestRows[0].service_id) {
      return res.status(400).json({
        message: 'This guest has no recorded service. Staff cannot be matched yet.',
      });
    }

    const [serviceRows] = await pool.query(
      `SELECT department_id, role_id, assigned_employee_id
       FROM services
       WHERE id = ?`,
      [guestRows[0].service_id]
    );
    const service = serviceRows[0];
    if (!service) {
      return res.status(400).json({ message: 'The guest service is no longer available' });
    }
    if (!service.department_id && !service.role_id && !service.assigned_employee_id) {
      return res.status(400).json({
        message: 'This service has no linked staff profile. Update it on the Services page.',
      });
    }

    const isServiceContact =
      Number(service.assigned_employee_id) === Number(emp[0].id);
    const matchesDepartment = service.department_id &&
      Number(service.department_id) === Number(emp[0].department_id);
    const matchesRole = service.role_id &&
      Number(service.role_id) === Number(emp[0].role_id);
    const isEligible = isServiceContact ||
      (service.department_id && service.role_id
        ? matchesDepartment && matchesRole
        : service.department_id
          ? matchesDepartment
          : matchesRole);

    if (!isEligible) {
      return res.status(400).json({
        message: 'Choose an employee who matches this service profile',
      });
    }

    await pool.query(
      `UPDATE guests
       SET assigned_employee_id = ?, assigned_at = NOW(), assigned_by = ?,
           assignment_status = 'assigned', completed_at = NULL
       WHERE id = ?`,
      [employee_id, req.user.id, req.params.id]
    );
    const [assignedGuestRows] = await pool.query(
      `SELECT g.*,
              s.name AS service_name,
              e.full_name AS assigned_employee_name,
              e.employee_code AS assigned_employee_code,
              e.profile_picture AS assigned_employee_picture,
              e.email AS assigned_employee_email,
              e.phone AS assigned_employee_phone,
              d.name AS assigned_employee_department,
              r.name AS assigned_employee_role,
              a.full_name AS assigned_by_name
       FROM guests g
       LEFT JOIN services s ON g.service_id = s.id
       LEFT JOIN employees e ON g.assigned_employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN roles r ON e.role_id = r.id
       LEFT JOIN employees a ON g.assigned_by = a.id
       WHERE g.id = ?`,
      [req.params.id]
    );
    const assignedGuest = assignedGuestRows[0];

    await notifyUser(employee_id, {
      type: 'guest_assignment',
      title: 'Guest assigned to you',
      message: `${assignedGuest.full_name} has been assigned to you for ${assignedGuest.service_name || 'a guest service'}.`,
      targetPath: '/dashboard',
    });

    const previousEmployeeId = guestRows[0].assigned_employee_id;
    if (
      previousEmployeeId &&
      Number(previousEmployeeId) !== Number(employee_id)
    ) {
      await notifyUser(previousEmployeeId, {
        type: 'guest_reassigned',
        title: 'Guest assignment changed',
        message: `${guestRows[0].full_name} has been reassigned to another employee.`,
        targetPath: '/dashboard',
      });
    }

    await notifyAdmins({
      type: 'guest_assignment',
      title: 'Guest employee assigned',
      message: `${assignedGuest.full_name} was assigned to ${assignedGuest.assigned_employee_name}.`,
      targetPath: '/guests',
    });

    res.json({ message: 'Employee assigned', guest: assignedGuest });
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
           e.employee_code AS assigned_employee_code,
           e.profile_picture AS assigned_employee_picture,
           e.email AS assigned_employee_email,
           e.phone AS assigned_employee_phone,
           d.name AS assigned_employee_department,
           r.name AS assigned_employee_role,
           a.full_name AS assigned_by_name
    FROM guests g
    LEFT JOIN services s ON g.service_id = s.id
    LEFT JOIN employees e ON g.assigned_employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN roles r ON e.role_id = r.id
    LEFT JOIN employees a ON g.assigned_by = a.id
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