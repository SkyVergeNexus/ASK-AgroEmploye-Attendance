const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// ============ PUBLIC: GUEST REGISTRATION ============
router.post('/register', async (req, res) => {
  const {
    full_name,
    phone,
    gender,
    service_id,
    purpose,
    notes,
  } = req.body || {};

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

    // Validate service exists and is active
    const [svcRows] = await pool.query(
      'SELECT id, name, is_active FROM services WHERE id = ?',
      [service_id]
    );
    if (!svcRows.length || !svcRows[0].is_active) {
      return res.status(400).json({ message: 'Invalid or inactive service' });
    }
    const svc = svcRows[0];

    // If "Other" was chosen, require the free-text purpose
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

    const [result] = await pool.query(
      `INSERT INTO guests (full_name, phone, gender, service_id, purpose, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        phone.trim(),
        gender || null,
        service_id,
        purposeText || svc.name,
        notes?.trim() || null,
      ]
    );

    res.status(201).json({
      message: 'Thank you for signing in. The team has been notified.',
      guest_id: result.insertId,
    });
  } catch (err) {
    console.error('[guests] register:', err.message);
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// ============ ADMIN: LIST GUESTS ============
router.get('/', verifyToken, isAdmin, async (req, res) => {
  const { from, to, search } = req.query;

  let sql = `
    SELECT g.*, s.name AS service_name
    FROM guests g
    LEFT JOIN services s ON g.service_id = s.id
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
    res.json({ total, today, week });
  } catch (err) {
    console.error('[guests] stats:', err.message);
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

module.exports = router;