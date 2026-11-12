const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT r.*, d.name AS department_name FROM roles r JOIN departments d ON r.department_id = d.id ORDER BY d.name, r.name'
  );
  res.json(rows);
});

router.post('/', verifyToken, isAdmin, async (req, res) => {
  const { department_id, name } = req.body;
  try {
    const [r] = await pool.query(
      'INSERT INTO roles (department_id, name) VALUES (?, ?)',
      [department_id, name]
    );
    res.status(201).json({ id: r.insertId, department_id, name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  await pool.query('UPDATE roles SET name=?, department_id=? WHERE id=?', [req.body.name, req.body.department_id, req.params.id]);
  res.json({ message: 'Role updated' });
});

router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  await pool.query('DELETE FROM roles WHERE id=?', [req.params.id]);
  res.json({ message: 'Role deleted' });
});

module.exports = router;
