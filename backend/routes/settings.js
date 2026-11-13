const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============ COVER UPLOAD SETUP ============
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'cover_' + Date.now() + ext);
  },
});

const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp/i.test(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, or WEBP images allowed'), ok);
  },
});

// ============ PUBLIC ENDPOINT (no auth) ============
// Used by Login and Register pages to load the cover image + company name.
// NEVER expose sensitive fields here (allowed_ips, office_lat, etc.).
router.get('/public', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT company_name, login_cover_url FROM settings WHERE id = 1'
    );
    if (!rows.length) {
      return res.json({
        company_name: 'ASK Agrobusiness Limited',
        login_cover_url: null,
      });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ GET MY PUBLIC IP ============
router.get('/my-ip', verifyToken, isAdmin, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json();

    if (data.ip && /^\d+\.\d+\.\d+\.\d+$/.test(data.ip)) {
      return res.json({ ip: data.ip, source: 'external' });
    }
    throw new Error('Invalid response from IP service');
  } catch (err) {
    const fwd = req.headers['x-forwarded-for'];
    let ip = fwd
      ? String(fwd).split(',')[0].trim()
      : req.ip || req.connection?.remoteAddress || null;
    if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
    res.json({
      ip,
      source: 'fallback',
      warning: err.message,
    });
  }
});

// ============ UPLOAD NEW COVER ============
router.post(
  '/cover',
  verifyToken,
  isAdmin,
  coverUpload.single('cover'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const url = '/uploads/' + req.file.filename;
    try {
      await pool.query('UPDATE settings SET login_cover_url = ? WHERE id = 1', [url]);
      res.json({ message: 'Cover updated', login_cover_url: url });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// ============ RESET COVER TO DEFAULT ============
router.delete('/cover', verifyToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE settings SET login_cover_url = NULL WHERE id = 1');
    res.json({ message: 'Cover reset to default' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ GET ALL SETTINGS (auth) ============
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
    if (!rows.length) return res.status(404).json({ message: 'Settings not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ UPDATE SETTINGS ============
router.put('/', verifyToken, isAdmin, async (req, res) => {
  const {
    work_start,
    work_end,
    late_threshold_minutes,
    company_name,
    office_lat,
    office_lng,
    geofence_radius_m,
    enforce_location,
    allowed_ips,
  } = req.body;

  // --- required core fields ---
  if (!work_start || !work_end || late_threshold_minutes === undefined || !company_name) {
    return res.status(400).json({ message: 'Work hours, threshold, and company name are required' });
  }
  if (Number(late_threshold_minutes) < 0) {
    return res.status(400).json({ message: 'Late threshold must be >= 0' });
  }
  if (work_start >= work_end) {
    return res.status(400).json({ message: 'Work start must be before work end' });
  }

  // --- geofence + IP validation ---
  const enforce = enforce_location ? 1 : 0;
  const lat = office_lat == null || office_lat === '' ? null : Number(office_lat);
  const lng = office_lng == null || office_lng === '' ? null : Number(office_lng);
  const radius = geofence_radius_m ? Number(geofence_radius_m) : 200;

  if (enforce) {
    if (lat == null || lng == null) {
      return res.status(400).json({
        message: 'Office latitude and longitude are required when location enforcement is on',
      });
    }
    if (lat < -90 || lat > 90) {
      return res.status(400).json({ message: 'Latitude must be between -90 and 90' });
    }
    if (lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'Longitude must be between -180 and 180' });
    }
    if (radius < 10 || radius > 20000) {
      return res.status(400).json({ message: 'Geofence radius must be between 10m and 20000m' });
    }

    const ipList = (allowed_ips || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (ipList.length === 0) {
      return res.status(400).json({
        message: 'At least one office IP is required when location enforcement is on',
      });
    }
  }

  try {
    await pool.query(
      `UPDATE settings
       SET work_start = ?, work_end = ?, late_threshold_minutes = ?, company_name = ?,
           office_lat = ?, office_lng = ?, geofence_radius_m = ?,
           enforce_location = ?, allowed_ips = ?
       WHERE id = 1`,
      [
        work_start,
        work_end,
        Number(late_threshold_minutes),
        company_name,
        lat,
        lng,
        radius,
        enforce,
        allowed_ips || null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;