const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT e.id, e.employee_code, e.full_name, e.email, e.phone, e.gender, e.profile_picture, e.department_id, e.role_id, e.system_role, e.is_active, e.created_at, d.name AS department_name, r.name AS role_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN roles r ON e.role_id = r.id WHERE e.id = ?',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  res.json(rows[0]);
});

router.put('/', verifyToken, async (req, res) => {
  const { full_name, phone, gender } = req.body;
  await pool.query(
    'UPDATE employees SET full_name=?, phone=?, gender=? WHERE id=?',
    [full_name, phone, gender, req.user.id]
  );
  res.json({ message: 'Profile updated' });
});

router.post('/picture', verifyToken, upload.single('picture'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = '/uploads/' + req.file.filename;
  await pool.query('UPDATE employees SET profile_picture=? WHERE id=?', [url, req.user.id]);
  res.json({ message: 'Picture uploaded', profile_picture: url });
});

router.put('/password', verifyToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  const [rows] = await pool.query('SELECT password_hash FROM employees WHERE id=?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  const ok = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!ok) return res.status(400).json({ message: 'Current password wrong' });
  const hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE employees SET password_hash=? WHERE id=?', [hash, req.user.id]);
  res.json({ message: 'Password updated' });
});

module.exports = router;
