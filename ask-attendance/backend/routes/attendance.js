const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// ============ HELPERS ============
function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTimeString(d = new Date()) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  let ip = req.ip || req.connection?.remoteAddress || null;
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

// ============ CLOCK IN (strict: public IP AND GPS both required) ============
router.post('/clock-in', verifyToken, async (req, res) => {
  const today = localDateString();
  try {
    const [existing] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id=? AND attendance_date=?',
      [req.user.id, today]
    );
    if (existing.length) {
      return res.status(400).json({ message: 'Already clocked in today' });
    }

    const [settingsRows] = await pool.query('SELECT * FROM settings WHERE id=1');
    const settings = settingsRows[0] || {};
    const now = new Date();

    // ---------- LOCATION CHECK (IP AND GPS) ----------
    const enforce = !!Number(settings.enforce_location);
    const reqIp = getClientIp(req); // backend-observed IP (LAN/loopback on same machine)
    const clientPublicIp = req.body?.publicIp ? String(req.body.publicIp).trim() : null; // from ipify in browser
    const bodyLat = req.body?.lat != null ? Number(req.body.lat) : null;
    const bodyLng = req.body?.lng != null ? Number(req.body.lng) : null;

    let method = 'manual';
    let verified = 0;
    let distance = null;

    if (enforce) {
      const allowedIps = (settings.allowed_ips || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      // --- 1) IP check (must pass) ---
      // Prefer the browser-reported public IP; fall back to req.ip for direct connections.
      const effectiveIp = clientPublicIp || reqIp;
      if (!effectiveIp || allowedIps.length === 0 || !allowedIps.includes(effectiveIp)) {
        return res.status(403).json({
          message: 'You must be connected to the office Wi-Fi to clock in.',
          requiresOfficeWifi: true,
          sawIp: effectiveIp, // helps debugging without exposing anything sensitive
        });
      }

      // --- 2) GPS check (must also pass) ---
      if (
        bodyLat == null ||
        bodyLng == null ||
        settings.office_lat == null ||
        settings.office_lng == null
      ) {
        return res.status(403).json({
          message: 'Location required. Enable GPS on your device to clock in.',
          requiresLocation: true,
        });
      }

      distance = haversineMeters(
        bodyLat,
        bodyLng,
        Number(settings.office_lat),
        Number(settings.office_lng)
      );
      const radius = Number(settings.geofence_radius_m || 200);
      if (distance > radius) {
        return res.status(403).json({
          message: `You are ${Math.round(distance)}m from the office. Must be within ${radius}m to clock in.`,
          distance: Math.round(distance),
          radius,
        });
      }

      // Both passed
      method = 'ip+gps';
      verified = 1;
    } else {
      method = 'manual';
      verified = 1;
    }

    // ---------- LATE / PRESENT ----------
    const [h, m] = String(settings.work_start || '08:00:00').split(':');
    const workStart = new Date();
    workStart.setHours(+h, +m, 0, 0);
    const diffMin = (now - workStart) / 60000;
    const status =
      diffMin > Number(settings.late_threshold_minutes ?? 15) ? 'late' : 'present';

    // ---------- INSERT ----------
    await pool.query(
      `INSERT INTO attendance
        (employee_id, attendance_date, clock_in, status,
         clock_in_lat, clock_in_lng, clock_in_ip, clock_in_method, clock_in_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        today,
        localTimeString(now),
        status,
        bodyLat,
        bodyLng,
        clientPublicIp || reqIp, // store the public IP that was actually validated
        method,
        verified,
      ]
    );

    res.json({
      message: 'Clocked in',
      status,
      method,
      verified,
      distance: distance != null ? Math.round(distance) : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ CLOCK OUT ============
router.post('/clock-out', verifyToken, async (req, res) => {
  const today = localDateString();
  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id=? AND attendance_date=?',
      [req.user.id, today]
    );
    if (!rows.length) return res.status(400).json({ message: 'You have not clocked in today' });
    if (rows[0].clock_out) return res.status(400).json({ message: 'Already clocked out' });

    const [settings] = await pool.query('SELECT * FROM settings WHERE id=1');
    const now = new Date();
    const [wh, wm] = settings[0].work_end.split(':');
    const workEnd = new Date();
    workEnd.setHours(+wh, +wm, 0, 0);

    const isEarly = now < workEnd;
    let reason = null;

    if (isEarly) {
      const [reqs] = await pool.query(
        `SELECT * FROM early_leave_requests
         WHERE attendance_id=? AND status='approved'
         ORDER BY decided_at DESC LIMIT 1`,
        [rows[0].id]
      );
      if (!reqs.length) {
        return res.status(403).json({
          message: 'Early clock-out requires admin approval. Please submit a request.',
          requiresApproval: true,
        });
      }
      reason = reqs[0].reason;
    }

    await pool.query(
      'UPDATE attendance SET clock_out=?, early_leave_reason=? WHERE id=?',
      [localTimeString(now), reason, rows[0].id]
    );
    res.json({ message: 'Clocked out' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ MY ATTENDANCE ============
router.get('/my', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id=? ORDER BY attendance_date DESC LIMIT 60',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/today', verifyToken, async (req, res) => {
  try {
    const today = localDateString();
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id=? AND attendance_date=?',
      [req.user.id, today]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ EARLY LEAVE — EMPLOYEE ============
router.post('/early-leave/request', verifyToken, async (req, res) => {
  const { reason } = req.body;
  const today = localDateString();

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'Reason is required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id=? AND attendance_date=?',
      [req.user.id, today]
    );
    if (!rows.length) {
      return res.status(400).json({ message: 'You have not clocked in today' });
    }
    if (rows[0].clock_out) {
      return res.status(400).json({ message: 'Already clocked out' });
    }

    const [pending] = await pool.query(
      `SELECT id FROM early_leave_requests
       WHERE attendance_id=? AND status='pending'`,
      [rows[0].id]
    );
    if (pending.length) {
      return res.status(400).json({ message: 'You already have a pending early-leave request' });
    }

    const outTime = localTimeString();
    await pool.query(
      `INSERT INTO early_leave_requests
        (employee_id, attendance_id, requested_out_time, reason)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, rows[0].id, outTime, reason.trim()]
    );

    res.status(201).json({ message: 'Request submitted. Awaiting admin approval.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/early-leave/my', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM early_leave_requests
       WHERE employee_id=? ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ EARLY LEAVE — ADMIN ============
router.get('/early-leave/all', verifyToken, isAdmin, async (req, res) => {
  const { status } = req.query;
  try {
    let sql = `
      SELECT r.*, e.full_name, e.employee_code
      FROM early_leave_requests r
      JOIN employees e ON r.employee_id = e.id
    `;
    const params = [];
    if (status) {
      sql += ' WHERE r.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY r.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/early-leave/:id/decide', verifyToken, isAdmin, async (req, res) => {
  const { approve, admin_note } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM early_leave_requests WHERE id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Request not found' });
    if (rows[0].status !== 'pending') {
      return res.status(400).json({ message: 'Request already decided' });
    }

    await pool.query(
      `UPDATE early_leave_requests
       SET status=?, admin_note=?, decided_by=?, decided_at=NOW()
       WHERE id=?`,
      [approve ? 'approved' : 'rejected', admin_note || null, req.user.id, req.params.id]
    );

    res.json({ message: approve ? 'Approved' : 'Rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ EARLY LEAVE — EMPLOYEE CANCEL ============
router.delete('/early-leave/:id', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM early_leave_requests WHERE id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Request not found' });

    if (rows[0].employee_id !== req.user.id) {
      return res.status(403).json({ message: 'Not your request' });
    }

    if (rows[0].status !== 'pending') {
      return res.status(400).json({
        message: 'Only pending requests can be cancelled',
      });
    }

    await pool.query('DELETE FROM early_leave_requests WHERE id=?', [req.params.id]);
    res.json({ message: 'Request cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ ADMIN VIEWS ============
router.get('/all', verifyToken, isAdmin, async (req, res) => {
  const { from, to, employee_id } = req.query;

  let sql = `
    SELECT a.*, e.full_name, e.employee_code, d.name AS department
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (from) { sql += ' AND a.attendance_date >= ?'; params.push(from); }
  if (to) { sql += ' AND a.attendance_date <= ?'; params.push(to); }
  if (employee_id) { sql += ' AND a.employee_id = ?'; params.push(employee_id); }

  sql += ' ORDER BY a.attendance_date DESC, e.full_name';

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const today = localDateString();

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) total FROM employees WHERE is_active=1'
    );
    const [[{ present }]] = await pool.query(
      'SELECT COUNT(*) present FROM attendance WHERE attendance_date=?',
      [today]
    );
    const [[{ late }]] = await pool.query(
      'SELECT COUNT(*) late FROM attendance WHERE attendance_date=? AND status=?',
      [today, 'late']
    );
    const [[{ pending_early }]] = await pool.query(
      `SELECT COUNT(*) pending_early FROM early_leave_requests WHERE status='pending'`
    );

    res.json({
      total,
      present,
      late,
      absent: total - present,
      pending_early_leaves: pending_early,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;