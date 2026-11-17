
const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function validateServiceStaff(departmentValue, roleValue, employeeValue) {
  const departmentId = positiveId(departmentValue);
  const roleId = roleValue === undefined || roleValue === null || roleValue === ''
    ? null
    : positiveId(roleValue);
  const employeeId = positiveId(employeeValue);

  if (!departmentId) return { error: 'Select a department for this service' };
  if (roleValue && !roleId) return { error: 'Select a valid role' };
  if (!employeeId) return { error: 'Assign an active employee to this service' };

  const [departments] = await pool.query(
    'SELECT id FROM departments WHERE id = ?',
    [departmentId]
  );
  if (!departments.length) return { error: 'Selected department was not found' };

  if (roleId) {
    const [roles] = await pool.query(
      'SELECT id FROM roles WHERE id = ? AND department_id = ?',
      [roleId, departmentId]
    );
    if (!roles.length) {
      return { error: 'Selected role must belong to the selected department' };
    }
  }

  const [employees] = await pool.query(
    `SELECT id, department_id, role_id
     FROM employees
     WHERE id = ? AND system_role = 'employee'
       AND is_active = 1 AND is_approved = 1`,
    [employeeId]
  );
  if (!employees.length) {
    return { error: 'Selected employee must be active and approved' };
  }
  if (
    Number(employees[0].department_id) !== departmentId ||
    (roleId && Number(employees[0].role_id) !== roleId)
  ) {
    return { error: 'Selected employee must match the service department and role' };
  }

  return { departmentId, roleId, employeeId };
}

// ============ PUBLIC: LIST ACTIVE SERVICES ============
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description
       FROM services
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[services] public list:', err.message);
    res.status(500).json({ message: 'Failed to load services' });
  }
});

// ============ ADMIN: LIST ALL SERVICES ============
router.get('/all', verifyToken, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*,
              d.name AS department_name,
              r.name AS role_name,
              e.full_name AS assigned_employee_name,
              e.employee_code AS assigned_employee_code
       FROM services s
       LEFT JOIN departments d ON s.department_id = d.id
       LEFT JOIN roles r ON s.role_id = r.id
       LEFT JOIN employees e ON s.assigned_employee_id = e.id
       ORDER BY s.is_active DESC, s.name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[services] admin list:', err.message);
    res.status(500).json({ message: 'Failed to load services' });
  }
});

// ============ ADMIN: CREATE ============
router.post('/', verifyToken, isAdmin, async (req, res) => {
  const {
    name, description, is_active, department_id, role_id, assigned_employee_id,
  } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Service name is required' });
  }
  if (name.length > 120) {
    return res.status(400).json({ message: 'Service name must be 120 characters or fewer' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ message: 'Description must be 255 characters or fewer' });
  }

  try {
    const staff = await validateServiceStaff(
      department_id,
      role_id,
      assigned_employee_id
    );
    if (staff.error) return res.status(400).json({ message: staff.error });

    const [result] = await pool.query(
      `INSERT INTO services
         (name, description, is_active, department_id, role_id, assigned_employee_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description?.trim() || null,
        is_active === false ? 0 : 1,
        staff.departmentId,
        staff.roleId,
        staff.employeeId,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM services WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A service with this name already exists' });
    }
    console.error('[services] create:', err.message);
    res.status(500).json({ message: 'Failed to create service' });
  }
});

// ============ ADMIN: UPDATE ============
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const {
    name, description, is_active, department_id, role_id, assigned_employee_id,
  } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Service name is required' });
  }
  if (name.length > 120) {
    return res.status(400).json({ message: 'Service name must be 120 characters or fewer' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ message: 'Description must be 255 characters or fewer' });
  }

  try {
    const staff = await validateServiceStaff(
      department_id,
      role_id,
      assigned_employee_id
    );
    if (staff.error) return res.status(400).json({ message: staff.error });

    const [existing] = await pool.query(
      'SELECT id FROM services WHERE id = ?',
      [req.params.id]
    );
    if (!existing.length) {
      return res.status(404).json({ message: 'Service not found' });
    }

    await pool.query(
      `UPDATE services
       SET name = ?, description = ?, is_active = ?,
           department_id = ?, role_id = ?, assigned_employee_id = ?
       WHERE id = ?`,
      [
        name.trim(),
        description?.trim() || null,
        is_active === false ? 0 : 1,
        staff.departmentId,
        staff.roleId,
        staff.employeeId,
        req.params.id,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A service with this name already exists' });
    }
    console.error('[services] update:', err.message);
    res.status(500).json({ message: 'Failed to update service' });
  }
});

// ============ ADMIN: DELETE ============
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const [used] = await pool.query(
      'SELECT COUNT(*) n FROM guests WHERE service_id = ?',
      [req.params.id]
    );
    if (used[0].n > 0) {
      return res.status(400).json({
        message: `This service has been used by ${used[0].n} guest${used[0].n === 1 ? '' : 's'}. Deactivate it instead of deleting.`,
      });
    }

    const [result] = await pool.query('DELETE FROM services WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json({ message: 'Service deleted' });
  } catch (err) {
    console.error('[services] delete:', err.message);
    res.status(500).json({ message: 'Failed to delete service' });
  }
});

module.exports = router;