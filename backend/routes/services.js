
const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

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
              r.name AS role_name
       FROM services s
       LEFT JOIN departments d ON s.department_id = d.id
       LEFT JOIN roles r ON s.role_id = r.id
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
  const { name, description, is_active, department_id, role_id } = req.body || {};

  if (!name?.trim()) {
    return res.status(400).json({ message: 'Service name is required' });
  }
  if (name.length > 120) {
    return res.status(400).json({ message: 'Service name must be 120 characters or fewer' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ message: 'Description must be 255 characters or fewer' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO services (name, description, is_active, department_id, role_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description?.trim() || null,
        is_active === false ? 0 : 1,
        department_id || null,
        role_id || null,
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
  const { name, description, is_active, department_id, role_id } = req.body || {};

  if (!name?.trim()) {
    return res.status(400).json({ message: 'Service name is required' });
  }
  if (name.length > 120) {
    return res.status(400).json({ message: 'Service name must be 120 characters or fewer' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ message: 'Description must be 255 characters or fewer' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE services
       SET name = ?, description = ?, is_active = ?,
           department_id = ?, role_id = ?
       WHERE id = ?`,
      [
        name.trim(),
        description?.trim() || null,
        is_active ? 1 : 0,
        department_id || null,
        role_id || null,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
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