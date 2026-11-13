const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT e.id, e.employee_code, e.full_name, e.email, e.phone, e.gender, e.profile_picture, e.system_role, e.is_active, e.is_approved, d.name AS department_name, r.name AS role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id ORDER BY e.full_name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', verifyToken, isAdmin, async (req, res) => {
  const {
    employee_code, full_name, email, password, phone,
    gender, department_id, role_id, system_role,
  } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO employees (employee_code, full_name, email, password_hash, phone, gender, department_id, role_id, system_role, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)',
      [employee_code, full_name, email, hash, phone, gender, department_id, role_id, system_role || 'employee']
    );
    res.status(201).json({ message: 'Employee added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/approve', verifyToken, isAdmin, async (req, res) => {
  const { approve } = req.body;
  try {
    await pool.query(
      'UPDATE employees SET is_approved = ? WHERE id = ?',
      [approve ? 1 : 0, req.params.id]
    );
    res.json({ message: approve ? 'Employee approved' : 'Approval revoked' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const {
    full_name, email, phone, gender,
    department_id, role_id, system_role, is_active,
  } = req.body;
  try {
    await pool.query(
      'UPDATE employees SET full_name=?, email=?, phone=?, gender=?, department_id=?, role_id=?, system_role=?, is_active=? WHERE id=?',
      [full_name, email, phone, gender, department_id, role_id, system_role, is_active, req.params.id]
    );
    res.json({ message: 'Employee updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;