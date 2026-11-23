const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { notifyAdmins, notifyUser } = require('../helpers/notifications');
const { normalizeCompanyEmail } = require('../helpers/companyEmail');
const router = express.Router();

router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT e.id, e.employee_code, e.full_name, e.email, e.phone, e.gender, e.profile_picture, e.department_id, e.role_id, e.system_role, e.is_active, e.is_approved, e.approval_status, d.name AS department_name, r.name AS role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id ORDER BY e.full_name'
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
  const mail = normalizeCompanyEmail(email);
  if (!mail) {
    return res.status(400).json({
      message: 'Use an employee email ending in @angelcommoditiesltd.org',
    });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO employees (employee_code, full_name, email, password_hash, phone, gender, department_id, role_id, system_role, is_approved, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)',
      [employee_code, full_name, mail, hash, phone, gender, department_id, role_id, system_role || 'employee', 'approved']
    );
    await notifyUser(result.insertId, {
      type: 'employee_created',
      title: 'Your employee account is ready',
      message: 'An administrator created your employee account.',
      targetPath: system_role === 'admin' ? '/admin' : '/dashboard',
    });
    await notifyAdmins({
      type: 'employee_created',
      title: 'Employee account created',
      message: `${full_name} was added as an employee.`,
      targetPath: '/employees',
    });
    res.status(201).json({ message: 'Employee added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/approve', verifyToken, isAdmin, async (req, res) => {
  const requestedDecision = req.body?.decision;
  const legacyApprove = req.body?.approve;
  if (
    (requestedDecision != null && !['approve', 'reject', 'revoke'].includes(requestedDecision)) ||
    (requestedDecision == null && typeof legacyApprove !== 'boolean')
  ) {
    return res.status(400).json({ message: 'Choose approve, reject, or revoke.' });
  }

  try {
    const [employees] = await pool.query(
      'SELECT id, full_name, approval_status FROM employees WHERE id = ?',
      [req.params.id]
    );
    if (!employees.length) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const employee = employees[0];
    const decision = requestedDecision || (
      legacyApprove
        ? 'approve'
        : employee.approval_status === 'approved'
          ? 'revoke'
          : 'reject'
    );

    if (decision === 'reject' && employee.approval_status !== 'pending') {
      return res.status(400).json({ message: 'Only pending registrations can be rejected.' });
    }
    if (decision === 'revoke' && employee.approval_status !== 'approved') {
      return res.status(400).json({ message: 'Only approved accounts can be revoked.' });
    }
    if (decision === 'approve' && employee.approval_status === 'approved') {
      return res.status(400).json({ message: 'This employee is already approved.' });
    }

    const approvalStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'revoked';
    await pool.query(
      'UPDATE employees SET is_approved = ?, approval_status = ? WHERE id = ?',
      [decision === 'approve' ? 1 : 0, approvalStatus, req.params.id]
    );
    await notifyUser(req.params.id, {
      type: `employee_${approvalStatus}`,
      title: approvalStatus === 'approved'
        ? 'Your account was approved'
        : approvalStatus === 'rejected'
          ? 'Your registration was not approved'
          : 'Your account approval was revoked',
      message: approvalStatus === 'approved'
        ? 'An administrator approved your account. You can now sign in.'
        : approvalStatus === 'rejected'
          ? 'An administrator did not approve your registration. Contact the office if you need more information.'
          : 'An administrator revoked your account approval. You can no longer sign in. Contact the office if you believe this is an error.',
      targetPath: '/dashboard',
    });
    await notifyAdmins({
      type: `employee_${approvalStatus}`,
      title: approvalStatus === 'approved'
        ? 'Employee approved'
        : approvalStatus === 'rejected'
          ? 'Employee registration rejected'
          : 'Employee approval revoked',
      message: `${employee.full_name}'s account status was changed to ${approvalStatus}.`,
      targetPath: '/employees',
    });
    const responseMessage = approvalStatus === 'approved'
      ? 'Employee approved'
      : approvalStatus === 'rejected'
        ? 'Employee registration rejected'
        : 'Employee approval revoked';
    res.json({ message: responseMessage, approval_status: approvalStatus });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const {
    full_name, email, phone, gender,
    department_id, role_id, system_role, is_active,
  } = req.body;
  const mail = normalizeCompanyEmail(email);
  if (!mail) {
    return res.status(400).json({
      message: 'Use an employee email ending in @angelcommoditiesltd.org',
    });
  }
  try {
    await pool.query(
      'UPDATE employees SET full_name=?, email=?, phone=?, gender=?, department_id=?, role_id=?, system_role=?, is_active=? WHERE id=?',
      [full_name, mail, phone, gender, department_id, role_id, system_role, is_active, req.params.id]
    );
    await notifyUser(req.params.id, {
      type: 'employee_profile_updated',
      title: 'Your employee details were updated',
      message: 'An administrator updated your employee profile or work assignment details.',
      targetPath: '/profile',
    });
    await notifyAdmins({
      type: 'employee_profile_updated',
      title: 'Employee details updated',
      message: `${full_name || `Employee #${req.params.id}`} had their employee details updated.`,
      targetPath: '/employees',
    });
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

// ── GET /employees/preview-assignment/:serviceId ──
router.get('/preview-assignment/:serviceId', verifyToken, isAdmin, async (req, res) => {
  try {
    const { pickEmployeeForService } = require('../helpers/assignment');
    const id = await pickEmployeeForService(pool, req.params.serviceId);
    if (!id) {
      return res.json({ employee_id: null, reason: 'No matching active employee' });
    }
    const [rows] = await pool.query(
      'SELECT id, full_name, employee_code FROM employees WHERE id = ?',
      [id]
    );
    res.json({ employee_id: id, employee: rows[0] });
  } catch (err) {
    console.error('[employees] preview:', err.message);
    res.status(500).json({ message: 'Preview failed' });
  }
});

module.exports = router;