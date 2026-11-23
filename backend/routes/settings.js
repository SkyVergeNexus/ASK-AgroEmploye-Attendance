const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { persistUpload } = require('../helpers/imageStorage');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const net = require('net');

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

// ============ IP HELPERS ============
function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (
    ((nums[0] << 24) >>> 0) +
    ((nums[1] << 16) >>> 0) +
    ((nums[2] << 8) >>> 0) +
    (nums[3] >>> 0)
  );
}

function ipv4InCidr(ip, entry) {
  if (!entry) return false;
  if (!entry.includes('/')) return ip === entry;

  const [base, bitsStr] = entry.split('/');
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipN = ipv4ToInt(ip);
  const baseN = ipv4ToInt(base);
  if (ipN == null || baseN == null) return false;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

function ipMatchesAllowList(ip, allowedIps) {
  if (!ip) return false;
  const entries = String(allowedIps || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!entries.length) return false;
  return entries.some((entry) => ipv4InCidr(ip, entry));
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  let ip = fwd
    ? String(fwd).split(',')[0].trim()
    : req.ip || req.connection?.remoteAddress || null;
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function isValidIpEntry(entry) {
  if (!entry) return false;
  if (entry.includes('/')) {
    const [base, bitsStr] = entry.split('/');
    const bits = Number(bitsStr);
    return (
      net.isIPv4(base) &&
      Number.isInteger(bits) &&
      bits >= 0 &&
      bits <= 32
    );
  }
  return net.isIPv4(entry);
}

// ============ PUBLIC ENDPOINT (no auth) ============
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

// ============ DEBUG: SERVER IP + CLIENT IP ============
router.get('/my-ip', verifyToken, isAdmin, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeout);
    const data = await resp.json();

    res.json({
      ip: data?.ip || null,
      source: 'server',
      note:
        'This is the SERVER outbound IP. For the admin browser IP, the frontend must call ipify directly.',
      clientIpSeenByServer: getClientIp(req),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ CHECK THE CALLER'S IP AGAINST THE ALLOWLIST ============
router.get('/check-ip', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT enforce_location, enforce_network, allowed_ips, geofence_radius_m FROM settings WHERE id = 1'
    );
    const settings = rows[0] || {};
    const enforceLoc = !!Number(settings.enforce_location);
    const enforceNet = !!Number(settings.enforce_network);
    const clientIp = getClientIp(req);

    // If network enforcement is OFF, the IP check always passes.
    if (!enforceNet) {
      return res.json({
        enforce: false,
        enforceLocation: enforceLoc,
        enforceNetwork: false,
        allowed: true,
        clientIp,
        message: 'Office network check is off',
      });
    }

    const allowed = ipMatchesAllowList(clientIp, settings.allowed_ips);
    return res.json({
      enforce: true,
      enforceLocation: enforceLoc,
      enforceNetwork: true,
      allowed,
      clientIp,
      message: allowed
        ? 'You are on an allowed network'
        : 'You are not on the office Wi-Fi network',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    try {
      const url = await persistUpload(req.file);
      await pool.query('UPDATE settings SET login_cover_url = ? WHERE id = 1', [url]);
      res.json({ message: 'Cover updated', login_cover_url: url });
    } catch (err) {
      console.error('[settings] cover upload failed:', err.message);
      res.status(err.code === 'IMAGE_STORAGE_NOT_CONFIGURED' ? 503 : 500).json({
        message: err.code === 'IMAGE_STORAGE_NOT_CONFIGURED'
          ? err.message
          : 'Failed to upload cover image',
      });
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
    auto_clock_out_grace_minutes,
    late_threshold_minutes,
    company_name,
    office_lat,
    office_lng,
    geofence_radius_m,
    enforce_location,
    enforce_network,
    allowed_ips,
  } = req.body;

  // --- required core fields ---
  if (
    !work_start ||
    !work_end ||
    late_threshold_minutes === undefined ||
    !company_name
  ) {
    return res
      .status(400)
      .json({ message: 'Work hours, threshold, and company name are required' });
  }
  if (Number(late_threshold_minutes) < 0) {
    return res.status(400).json({ message: 'Late threshold must be >= 0' });
  }
  if (work_start >= work_end) {
    return res.status(400).json({ message: 'Work start must be before work end' });
  }
  const graceMinutes =
    auto_clock_out_grace_minutes === undefined ? 15 : Number(auto_clock_out_grace_minutes);
  if (
    auto_clock_out_grace_minutes === null ||
    auto_clock_out_grace_minutes === '' ||
    !Number.isInteger(graceMinutes) ||
    graceMinutes < 0 ||
    graceMinutes > 1440
  ) {
    return res.status(400).json({
      message: 'Auto clock-out grace period must be a whole number between 0 and 1440 minutes',
    });
  }
  // --- normalize IPs ---
  const rawEntries = String(allowed_ips || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const ipList = Array.from(new Set(rawEntries));

  const invalid = ipList.filter((e) => !isValidIpEntry(e));
  if (invalid.length) {
    return res.status(400).json({
      message:
        'Invalid IP entries: ' +
        invalid.join(', ') +
        '. Use IPv4 (e.g. 41.90.64.10) or CIDR (e.g. 41.90.64.0/24).',
    });
  }

  // --- flags ---
  const enforceLoc = enforce_location ? 1 : 0;
  const enforceNet = enforce_network ? 1 : 0;

  const lat =
    office_lat == null || office_lat === '' ? null : Number(office_lat);
  const lng =
    office_lng == null || office_lng === '' ? null : Number(office_lng);
  const radius = geofence_radius_m ? Number(geofence_radius_m) : 200;

  // --- geofence validation (only when GPS enforcement is on) ---
  if (enforceLoc) {
    if (lat == null || lng == null) {
      return res.status(400).json({
        message:
          'Office latitude and longitude are required when location enforcement is on',
      });
    }
    if (lat < -90 || lat > 90) {
      return res
        .status(400)
        .json({ message: 'Latitude must be between -90 and 90' });
    }
    if (lng < -180 || lng > 180) {
      return res
        .status(400)
        .json({ message: 'Longitude must be between -180 and 180' });
    }
    if (radius < 10 || radius > 20000) {
      return res
        .status(400)
        .json({ message: 'Geofence radius must be between 10m and 20000m' });
    }
  }

  // --- network validation (only when network enforcement is on) ---
  if (enforceNet && ipList.length === 0) {
    return res.status(400).json({
      message:
        'At least one office IP (or CIDR range) is required when office network enforcement is on',
    });
  }

  try {
    await pool.query(
      `UPDATE settings
       SET work_start = ?, work_end = ?, auto_clock_out_grace_minutes = ?,
           late_threshold_minutes = ?, company_name = ?,
           office_lat = ?, office_lng = ?, geofence_radius_m = ?,
           enforce_location = ?, enforce_network = ?, allowed_ips = ?
       WHERE id = 1`,
      [
        work_start,
        work_end,
        graceMinutes,
        Number(late_threshold_minutes),
        company_name,
        lat,
        lng,
        radius,
        enforceLoc,
        enforceNet,
        ipList.length ? ipList.join(', ') : null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    if (
      err.code === 'ER_BAD_FIELD_ERROR' &&
      String(err.message).includes('auto_clock_out_grace_minutes')
    ) {
      return res.status(503).json({
        message: 'Database migration 019 is pending. Run npm run db:migrate, then restart the backend.',
      });
    }
    res.status(500).json({ message: err.message });
  }
});

// Export helpers so attendance.js can reuse the exact same logic.
module.exports = router;
module.exports.getClientIp = getClientIp;
module.exports.ipMatchesAllowList = ipMatchesAllowList;