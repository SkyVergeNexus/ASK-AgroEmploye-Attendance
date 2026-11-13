const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// ---------- PUBLIC (no auth) — for register form ----------
router.get('/public', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/roles/public', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name FROM roles WHERE department_id = ? ORDER BY name',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- AUTHENTICATED ----------
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/roles', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM roles WHERE department_id = ? ORDER BY name',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- ADMIN ----------
router.post('/', verifyToken, isAdmin, async (req, res) => {
  const { name } = req.body;
  try {
    const [r] = await pool.query('INSERT INTO departments (name) VALUES (?)', [name]);
    res.status(201).json({ id: r.insertId, name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE departments SET name=? WHERE id=?', [req.body.name, req.params.id]);
    res.json({ message: 'Department updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM departments WHERE id=?', [req.params.id]);
    res.json({ message: 'Department deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;