const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { persistUpload } = require('../helpers/imageStorage');
const { nearestLocality } = require('../helpers/reverseGeocode');
const { notifyAdmins, notifyUser } = require('../helpers/notifications');
const { isWorkingDay } = require('../helpers/workSchedule');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// ============================================================
//  HELPERS
// ============================================================

// ---- IP (IPv4 + CIDR) ----
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

// ---- Time ----
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

function todayAt(timeString, fallback) {
  const src = String(timeString || fallback || '00:00:00');
  const [h, m] = src.split(':');
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d;
}

// ---- Geo ----
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

function isValidCoord(lat, lng) {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ---- Misc ----
function logger(...args) {
  console.log('[attendance]', ...args);
}

function serverError(res, err, context) {
  console.error(`[attendance] ${context}:`, err.message);
  res.status(500).json({ message: 'Internal server error' });
}

// Combine a DATE (or ISO date) + TIME (HH:mm:ss) into a JS Date.
function buildTimestamp(dateVal, timeVal) {
  try {
    if (!dateVal || !timeVal) return null;
    const dateStr = String(dateVal).slice(0, 10);
    const timeStr = String(timeVal).slice(0, 8);
    const d = new Date(`${dateStr}T${timeStr}`);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ============================================================
//  SELFIE VALIDATION
// ============================================================

const SELFIE_MIN_BYTES = 10 * 1024;
const SELFIE_MAX_BYTES = 5 * 1024 * 1024;
const SELFIE_MAX_AGE_MS = 15 * 60 * 1000;
const SELFIE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

async function validateSelfieFile(file) {
  if (!file) {
    const err = new Error('A selfie is required');
    err.code = 'SELFIE_MISSING';
    throw err;
  }
  if (file.size < SELFIE_MIN_BYTES) {
    const err = new Error('Selfie file looks too small — try again with a real photo');
    err.code = 'SELFIE_TOO_SMALL';
    throw err;
  }
  if (file.size > SELFIE_MAX_BYTES) {
    const err = new Error('Selfie exceeds the 5 MB limit');
    err.code = 'SELFIE_TOO_LARGE';
    throw err;
  }
  const fd = await fs.promises.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(16);
    await fd.read(buf, 0, 16, 0);
    const detected = detectImageType(buf);
    if (!detected || !SELFIE_ALLOWED_MIME.includes(detected)) {
      const err = new Error('File is not a valid JPEG, PNG, or WEBP image');
      err.code = 'SELFIE_BAD_FORMAT';
      throw err;
    }
    return detected;
  } finally {
    await fd.close();
  }
}

// ============================================================
//  CLOCK IN
// ============================================================
router.post('/clock-in', verifyToken, upload.single('selfie'), async (req, res) => {
  const today = localDateString();
  let selfieSaved = false;

  const removeUploadedSelfie = async () => {
    if (!req.file || selfieSaved) return;
    try {
      await fs.promises.unlink(req.file.path);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[attendance] selfie cleanup failed:', err.message);
      }
    }
  };

  try {
    const [existing] = await pool.query(
      'SELECT id, status FROM attendance WHERE employee_id = ? AND attendance_date = ?',
      [req.user.id, today]
    );
    if (existing.length) {
      await removeUploadedSelfie();
      if (existing[0].status === 'leave') {
        return res.status(403).json({ message: 'You have approved leave for today' });
      }
      return res.status(400).json({ message: 'Already clocked in today' });
    }

    const [settingsRows] = await pool.query('SELECT * FROM settings WHERE id = 1');
    const settings = settingsRows[0] || {};
    const now = new Date();

    const enforceLoc = Number(settings.enforce_location) === 1;
    const enforceNet = Number(settings.enforce_network) === 1;
    const workStartStr = settings.work_start || '08:00:00';
    const workEndStr = settings.work_end || '17:00:00';
    const lateThreshold = Number(settings.late_threshold_minutes ?? 15);
    const workStart = todayAt(workStartStr, '08:00:00');
    const workEnd = todayAt(workEndStr, '17:00:00');

    if (!isWorkingDay(now, settings.working_days)) {
      await removeUploadedSelfie();
      return res.status(403).json({
        message: 'Clock-in is not available on a configured non-working day.',
        outsideWorkDay: true,
      });
    }
    if (now < workStart || now > workEnd) {
      await removeUploadedSelfie();
      return res.status(403).json({
        message: `Clock-in is available between ${workStartStr.slice(0, 5)} and ${workEndStr.slice(0, 5)} on configured working days.`,
        outsideWorkHours: true,
      });
    }

    const mode = String(req.body?.mode || 'onsite').toLowerCase();
    if (!['onsite', 'remote'].includes(mode)) {
      await removeUploadedSelfie();
      return res.status(400).json({ message: 'Clock-in mode must be onsite or remote' });
    }
    if (mode === 'onsite') await removeUploadedSelfie();

    const clientIp = getClientIp(req);
    const bodyPublicIp = req.body?.publicIp ? String(req.body.publicIp).trim() : null;

    const bodyLat = req.body?.lat != null && req.body.lat !== '' ? Number(req.body.lat) : null;
    const bodyLng = req.body?.lng != null && req.body.lng !== '' ? Number(req.body.lng) : null;

    let method = 'manual';
    let verified = 0;
    let distance = null;
    let remoteLocation = null;
    let remoteSelfie = null;

    if (mode === 'remote') {
      const location = String(req.body?.remote_location || '').trim();
      if (!location) {
        await removeUploadedSelfie();
        return res.status(400).json({ message: 'Enter the remote work location' });
      }
      if (location.length > 255) {
        await removeUploadedSelfie();
        return res.status(400).json({ message: 'Remote location must be 255 characters or fewer' });
      }

      try {
        await validateSelfieFile(req.file);
      } catch (err) {
        await removeUploadedSelfie();
        return res.status(400).json({
          message: err.message || 'Invalid selfie file',
          requiresSelfie: true,
        });
      }

      if (!isValidCoord(bodyLat, bodyLng)) {
        await removeUploadedSelfie();
        return res.status(400).json({
          message: 'Allow location access to record your remote work location',
          requiresLocation: true,
        });
      }

      remoteLocation = location;
      remoteSelfie = await persistUpload(req.file);
      method = 'remote';
      verified = 1;
    } else if (enforceLoc || enforceNet) {
      if (enforceNet) {
        if (!clientIp || !ipMatchesAllowList(clientIp, settings.allowed_ips)) {
          await removeUploadedSelfie();
          return res.status(403).json({
            message: 'You must be connected to the office Wi-Fi to clock in.',
            requiresOfficeWifi: true,
            sawIp: clientIp,
          });
        }
      }

      if (enforceLoc) {
        if (!isValidCoord(bodyLat, bodyLng) || settings.office_lat == null || settings.office_lng == null) {
          await removeUploadedSelfie();
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
          await removeUploadedSelfie();
          return res.status(403).json({
            message: `You are ${Math.round(distance)}m from the office. Must be within ${radius}m to clock in.`,
            distance: Math.round(distance),
            radius,
          });
        }
      }

      method = enforceLoc && enforceNet ? 'ip+gps' : enforceLoc ? 'gps' : 'ip';
      verified = 1;
    } else {
      method = 'manual';
      verified = 1;
    }

    const diffMin = (now - workStart) / 60000;
    const status = diffMin > lateThreshold ? 'late' : 'present';

    await pool.query(
      `INSERT INTO attendance
        (employee_id, attendance_date, clock_in, status,
         clock_in_lat, clock_in_lng, clock_in_ip, clock_in_method, clock_in_verified,
         clock_in_mode, remote_location, remote_selfie)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        today,
        localTimeString(now),
        status,
        bodyLat,
        bodyLng,
        clientIp || bodyPublicIp || null,
        method,
        verified,
        mode,
        remoteLocation,
        remoteSelfie,
      ]
    );
    selfieSaved = true;

    logger(`clock-in user=${req.user.id} mode=${mode} method=${method} status=${status}`);
    const employeeName = req.user.full_name || `Employee #${req.user.id}`;
    await notifyAdmins({
      type: 'attendance_clock_in',
      title: 'Employee clocked in',
      message: `${employeeName} clocked in ${mode === 'remote' ? 'remotely' : 'on-site'} (${status}).`,
      targetPath: '/reports',
    });

    res.json({
      message: 'Clocked in',
      status,
      method,
      verified,
      distance: distance != null ? Math.round(distance) : null,
    });
  } catch (err) {
    await removeUploadedSelfie();
    if (err.code === 'IMAGE_STORAGE_NOT_CONFIGURED') {
      return res.status(503).json({ message: err.message });
    }
    serverError(res, err, 'clock-in');
  }
});

// ============================================================
//  CLOCK OUT
// ============================================================
router.post('/clock-out', verifyToken, async (req, res) => {
  const today = localDateString();
  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?',
      [req.user.id, today]
    );
    if (!rows.length) {
      return res.status(400).json({ message: 'You have not clocked in today' });
    }
    const record = rows[0];
    if (record.clock_out) {
      return res.status(400).json({ message: 'Already clocked out' });
    }
    if (record.needs_review) {
      return res.status(403).json({
        message: 'Your attendance is awaiting admin review. Contact an administrator to resolve it.',
        needsAdminReview: true,
      });
    }

    const isRemote = record.clock_in_mode === 'remote';

    const tasksCompleted = String(req.body?.tasks_completed || '').trim();
    if (isRemote && !tasksCompleted) {
      return res.status(400).json({
        message: 'Please enter the tasks you completed before clocking out',
        requiresTasks: true,
      });
    }
    if (tasksCompleted.length > 5000) {
      return res
        .status(400)
        .json({ message: 'Tasks completed must be 5000 characters or fewer' });
    }

    let reason = null;
    const now = new Date();
    let isEarly = false;
    const clockInAt = todayAt(record.clock_in, '00:00:00');
    if (now < clockInAt) {
      return res.status(403).json({ message: 'Clock-out is not available before your clock-in time.' });
    }

    if (!isRemote) {
      const [settingsRows] = await pool.query(
        'SELECT work_end, auto_clock_out_grace_minutes, working_days FROM settings WHERE id = 1'
      );
      const settings = settingsRows[0] || {};
      if (!isWorkingDay(now, settings.working_days)) {
        return res.status(403).json({
          message: 'Clock-out is not available on a configured non-working day.',
          outsideWorkDay: true,
        });
      }
      const workEndStr = settings.work_end || '17:00:00';
      const workEnd = todayAt(workEndStr, '17:00:00');
      const graceMinutes = Number(settings.auto_clock_out_grace_minutes ?? 15);
      const clockOutDeadline = new Date(workEnd.getTime() + graceMinutes * 60000);
      if (now >= clockOutDeadline) {
        return res.status(403).json({
          message: 'The on-site clock-out window has closed. Your attendance is being sent for admin review.',
          needsAdminReview: true,
        });
      }
      isEarly = now < workEnd;

      if (isEarly) {
        const [reqs] = await pool.query(
          `SELECT reason FROM early_leave_requests
           WHERE attendance_id = ? AND status = 'approved'
           ORDER BY decided_at DESC LIMIT 1`,
          [record.id]
        );
        if (!reqs.length) {
          return res.status(403).json({
            message: 'Early clock-out requires admin approval. Please submit a request.',
            requiresApproval: true,
          });
        }
        reason = reqs[0].reason;
      }
    }

    const [result] = await pool.query(
      `UPDATE attendance
       SET clock_out = ?, early_leave_reason = ?, tasks_completed = ?
       WHERE id = ? AND clock_out IS NULL AND needs_review = 0`,
      [
        localTimeString(now),
        reason,
        isRemote ? tasksCompleted : null,
        record.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: 'Attendance changed while clocking out. Refresh and check your attendance status.',
      });
    }

    logger(`clock-out user=${req.user.id} remote=${isRemote} early=${isEarly}`);
    const employeeName = req.user.full_name || `Employee #${req.user.id}`;
    await notifyAdmins({
      type: 'attendance_clock_out',
      title: 'Employee clocked out',
      message: `${employeeName} clocked out${isEarly ? ' early' : ''}.`,
      targetPath: '/reports',
    });
    res.json({ message: 'Clocked out' });
  } catch (err) {
    serverError(res, err, 'clock-out');
  }
});

// ============================================================
//  MY ATTENDANCE
// ============================================================
router.get('/my', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = ? ORDER BY attendance_date DESC LIMIT 60',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err, 'my attendance');
  }
});

router.get('/today', verifyToken, async (req, res) => {
  try {
    const today = localDateString();
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?',
      [req.user.id, today]
    );
    res.json(rows[0] || null);
  } catch (err) {
    serverError(res, err, 'today attendance');
  }
});

// ============================================================
//  EARLY LEAVE — EMPLOYEE
// ============================================================
router.post('/early-leave/request', verifyToken, async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  const today = localDateString();

  if (!reason) {
    return res.status(400).json({ message: 'Reason is required' });
  }
  if (reason.length > 5000) {
    return res.status(400).json({ message: 'Reason must be 5000 characters or fewer' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?',
      [req.user.id, today]
    );
    if (!rows.length) {
      return res.status(400).json({ message: 'You have not clocked in today' });
    }
    const record = rows[0];
    if (record.clock_out) {
      return res.status(400).json({ message: 'Already clocked out' });
    }

    if (record.clock_in_mode === 'remote') {
      return res.status(400).json({
        message: 'Remote workers do not need early-leave approval. Just clock out when your field work is done.',
      });
    }

    const [pending] = await pool.query(
      `SELECT id FROM early_leave_requests WHERE attendance_id = ? AND status = 'pending'`,
      [record.id]
    );
    if (pending.length) {
      return res.status(400).json({ message: 'You already have a pending early-leave request' });
    }

    const outTime = localTimeString();
    await pool.query(
      `INSERT INTO early_leave_requests
        (employee_id, attendance_id, requested_out_time, reason)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, record.id, outTime, reason]
    );

    logger(`early-leave request user=${req.user.id}`);
    const employeeName = req.user.full_name || `Employee #${req.user.id}`;
    await notifyUser(req.user.id, {
      type: 'early_leave_request_received',
      title: 'Early-leave request received',
      message: 'Your early-leave request was submitted and is waiting for admin review.',
      targetPath: '/leave-requests',
    });
    await notifyAdmins({
      type: 'early_leave_request',
      title: 'Early-leave request submitted',
      message: `${employeeName} requested to leave early today.`,
      targetPath: '/early-leave',
    });
    res.status(201).json({ message: 'Request submitted. Awaiting admin approval.' });
  } catch (err) {
    serverError(res, err, 'early-leave request');
  }
});

router.get('/early-leave/my', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM early_leave_requests
       WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err, 'early-leave my');
  }
});

// ============================================================
//  EARLY LEAVE — ADMIN
// ============================================================
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
    serverError(res, err, 'early-leave all');
  }
});

router.put('/early-leave/:id/decide', verifyToken, isAdmin, async (req, res) => {
  const { approve, admin_note } = req.body || {};
  try {
    const [result] = await pool.query(
      `UPDATE early_leave_requests
       SET status = ?, admin_note = ?, decided_by = ?, decided_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [approve ? 'approved' : 'rejected', admin_note || null, req.user.id, req.params.id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await pool.query(
        'SELECT status FROM early_leave_requests WHERE id = ?',
        [req.params.id]
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'Request not found' });
      }
      return res.status(400).json({ message: 'Request already decided' });
    }

    logger(`early-leave decide id=${req.params.id} approve=${!!approve} by=${req.user.id}`);
    const [requestRows] = await pool.query(
      'SELECT employee_id FROM early_leave_requests WHERE id = ?',
      [req.params.id]
    );
    if (requestRows.length) {
      await notifyUser(requestRows[0].employee_id, {
        type: 'early_leave_decision',
        title: `Early-leave request ${approve ? 'approved' : 'rejected'}`,
        message: `Your early-leave request was ${approve ? 'approved' : 'rejected'}.${admin_note ? ` Admin note: ${String(admin_note).trim()}` : ''}`,
        targetPath: '/leave-requests',
      });
      await notifyAdmins({
        type: 'early_leave_decision',
        title: `Early-leave request ${approve ? 'approved' : 'rejected'}`,
        message: `Employee #${requestRows[0].employee_id}'s early-leave request was ${approve ? 'approved' : 'rejected'}.`,
        targetPath: '/early-leave',
      });
    }
    res.json({ message: approve ? 'Approved' : 'Rejected' });
  } catch (err) {
    serverError(res, err, 'early-leave decide');
  }
});

router.delete('/early-leave/:id', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT employee_id, status FROM early_leave_requests WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (rows[0].employee_id !== req.user.id) {
      return res.status(403).json({ message: 'Not your request' });
    }
    if (rows[0].status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    }

    const [result] = await pool.query(
      `DELETE FROM early_leave_requests WHERE id = ? AND status = 'pending'`,
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'Request is no longer pending' });
    }

    logger(`early-leave cancel id=${req.params.id} by=${req.user.id}`);
    res.json({ message: 'Request cancelled' });
  } catch (err) {
    serverError(res, err, 'early-leave cancel');
  }
});

// ============================================================
//  ADMIN VIEWS
// ============================================================
router.post('/reverse-geocode', verifyToken, isAdmin, (req, res) => {
  const latitude = Number(req.body?.lat);
  const longitude = Number(req.body?.lng);

  if (
    req.body?.lat == null ||
    req.body?.lng == null ||
    String(req.body.lat).trim() === '' ||
    String(req.body.lng).trim() === '' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({ message: 'Valid latitude and longitude are required.' });
  }

  try {
    const locality = nearestLocality(latitude, longitude);
    if (!locality) {
      return res.status(404).json({ message: 'No nearby locality was found.' });
    }
    return res.json(locality);
  } catch (error) {
    if (error.code === 'LOCALITY_DATA_MISSING') {
      return res.status(503).json({ message: error.message });
    }
    console.error('[reverse geocode] Locality lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to find the nearest locality.' });
  }
});

router.get('/all', verifyToken, isAdmin, async (req, res) => {
  const { from, to, employee_id } = req.query;

  let sql = `
    SELECT a.*, e.full_name, e.employee_code, d.name AS department
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE 1 = 1
  `;
  const params = [];

  if (from) {
    sql += ' AND a.attendance_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND a.attendance_date <= ?';
    params.push(to);
  }
  if (employee_id) {
    sql += ' AND a.employee_id = ?';
    params.push(employee_id);
  }
  sql += ' ORDER BY a.attendance_date DESC, e.full_name';

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    serverError(res, err, 'attendance all');
  }
});

// ============================================================
//  ACTIVITY FEED (admin)
// ============================================================
// Includes: clock-ins, clock-outs, early-leave requests/decisions,
// employee registrations, AND guest check-ins.
// ============================================================
router.get('/activity-feed', verifyToken, isAdmin, async (req, res) => {
  const today = localDateString();
  const from = req.query.from || today;
  const to = req.query.to || today;
  const limit = Math.min(Number(req.query.limit) || 100, 300);

  try {
    const events = [];

    // ---- 1. Employee attendance (clock-in + clock-out) ----
    const [attendance] = await pool.query(
      `SELECT a.id, a.employee_id, a.attendance_date, a.clock_in, a.clock_out,
              DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date_key,
              DATE_FORMAT(a.admin_resolved_at, '%Y-%m-%d') AS admin_resolved_date,
              a.status, a.clock_in_mode, a.remote_location, a.remote_selfie,
              a.tasks_completed, a.early_leave_reason, a.created_at,
              a.auto_clocked_out, a.admin_resolved, a.admin_resolved_at,
              reviewer.full_name AS admin_resolved_by_name,
              e.full_name, e.employee_code,
              d.name AS department
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN employees reviewer ON a.admin_resolved_by = reviewer.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE (a.attendance_date >= ? AND a.attendance_date <= ?)
          OR (DATE(a.admin_resolved_at) >= ? AND DATE(a.admin_resolved_at) <= ?)`,
      [from, to, from, to]
    );

    attendance.forEach((r) => {
      const attendanceDate = r.attendance_date_key;
      const attendanceInRange = attendanceDate >= from && attendanceDate <= to;
      const resolvedDate = r.admin_resolved_date;
      const reviewInRange = resolvedDate && resolvedDate >= from && resolvedDate <= to;

      if (attendanceInRange) {
        events.push({
          id: `att-in-${r.id}`,
          kind: 'clock-in',
          at: r.created_at,
          employee: {
            id: r.employee_id,
            full_name: r.full_name,
            employee_code: r.employee_code,
            department: r.department,
          },
          meta: {
            attendance_id: r.id,
            time: r.clock_in,
            date: attendanceDate,
            status: r.status,
            mode: r.clock_in_mode,
            remote_location: r.remote_location,
            remote_selfie: r.remote_selfie,
          },
        });
      }

      if (attendanceInRange && r.clock_out && !r.admin_resolved) {
        events.push({
          id: `att-out-${r.id}`,
          kind: 'clock-out',
          at: buildTimestamp(attendanceDate, r.clock_out) || r.created_at,
          employee: {
            id: r.employee_id,
            full_name: r.full_name,
            employee_code: r.employee_code,
            department: r.department,
          },
          meta: {
            attendance_id: r.id,
            time: r.clock_out,
            date: attendanceDate,
            mode: r.clock_in_mode,
            early: Boolean(r.early_leave_reason),
            early_reason: r.early_leave_reason,
            tasks_completed: r.tasks_completed,
            auto_clocked_out: Boolean(r.auto_clocked_out),
            admin_resolved: Boolean(r.admin_resolved),
            status: r.status,
          },
        });
      }

      if (reviewInRange) {
        events.push({
          id: `att-review-${r.id}`,
          kind: 'attendance-review',
          at: r.admin_resolved_at,
          employee: {
            id: r.employee_id,
            full_name: r.full_name,
            employee_code: r.employee_code,
            department: r.department,
          },
          meta: {
            attendance_id: r.id,
            date: attendanceDate,
            status: r.status,
            admin_resolved_by_name: r.admin_resolved_by_name,
          },
        });
      }
    });

    // ---- 2. Early-leave requests + decisions ----
    const [earlyLeaves] = await pool.query(
      `SELECT r.id, r.employee_id, r.requested_out_time, r.reason,
              r.status, r.admin_note, r.decided_by, r.decided_at, r.created_at,
              e.full_name, e.employee_code,
              d.name AS department,
              decider.full_name AS decided_by_name
       FROM early_leave_requests r
       JOIN employees e ON r.employee_id = e.id
       LEFT JOIN employees decider ON r.decided_by = decider.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE DATE(r.created_at) BETWEEN ? AND ?
          OR DATE(r.decided_at) BETWEEN ? AND ?`,
      [from, to, from, to]
    );

    earlyLeaves.forEach((r) => {
      events.push({
        id: `early-req-${r.id}`,
        kind: 'early-request',
        at: r.created_at,
        employee: {
          id: r.employee_id,
          full_name: r.full_name,
          employee_code: r.employee_code,
          department: r.department,
        },
        meta: {
          request_id: r.id,
          requested_out_time: r.requested_out_time,
          reason: r.reason,
          status: r.status,
        },
      });

      if (r.status !== 'pending' && r.decided_at) {
        events.push({
          id: `early-${r.status}-${r.id}`,
          kind: r.status === 'approved' ? 'early-approved' : 'early-rejected',
          at: r.decided_at,
          employee: {
            id: r.employee_id,
            full_name: r.full_name,
            employee_code: r.employee_code,
            department: r.department,
          },
          meta: {
            request_id: r.id,
            requested_out_time: r.requested_out_time,
            reason: r.reason,
            admin_note: r.admin_note,
            decided_by_name: r.decided_by_name,
          },
        });
      }
    });

    // ---- 3. Employee registrations ----
    const [registrations] = await pool.query(
      `SELECT e.id, e.full_name, e.employee_code, e.email, e.is_approved,
              e.created_at, d.name AS department
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE DATE(e.created_at) BETWEEN ? AND ?`,
      [from, to]
    );

    registrations.forEach((r) => {
      events.push({
        id: `reg-${r.id}`,
        kind: 'registration',
        at: r.created_at,
        employee: {
          id: r.id,
          full_name: r.full_name,
          employee_code: r.employee_code,
          department: r.department,
        },
        meta: {
          email: r.email,
          is_approved: !!r.is_approved,
        },
      });
    });

    // ---- 4. Guest check-ins ----
    // guests: id, full_name, phone, gender, service_id, purpose, notes, created_at
    // Service name lives in `services` (join by service_id).
    const [guestCheckins] = await pool.query(
      `SELECT g.id, g.full_name, g.phone, g.purpose, g.created_at,
              s.name AS service_name
       FROM guests g
       LEFT JOIN services s ON g.service_id = s.id
       WHERE DATE(g.created_at) BETWEEN ? AND ?`,
      [from, to]
    );

    guestCheckins.forEach((g) => {
      events.push({
        id: `guest-${g.id}`,
        kind: 'guest-checkin',
        at: g.created_at,
        employee: null,
        meta: {
          guest_id: g.id,
          full_name: g.full_name,
          phone: g.phone || null,
          service_name: g.service_name || null,
          purpose: g.purpose || null,
          time: g.created_at
            ? new Date(g.created_at).toTimeString().slice(0, 8)
            : null,
        },
      });
    });

    // ---- Sort all events newest-first, cap at limit ----
    events.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return tb - ta;
    });

    res.json(events.slice(0, limit));
  } catch (err) {
    serverError(res, err, 'activity-feed');
  }
});

router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const today = localDateString();

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) total FROM employees WHERE is_active = 1'
    );
    const [[{ present }]] = await pool.query(
      `SELECT COUNT(*) present FROM attendance
       WHERE attendance_date = ? AND status IN ('present', 'late', 'half-day')`,
      [today]
    );
    const [[{ leave_count: leave }]] = await pool.query(
      "SELECT COUNT(*) AS leave_count FROM attendance WHERE attendance_date = ? AND status = 'leave'",
      [today]
    );
    const [[{ late }]] = await pool.query(
      'SELECT COUNT(*) late FROM attendance WHERE attendance_date = ? AND status = ?',
      [today, 'late']
    );
    const [[{ pending_early }]] = await pool.query(
      `SELECT COUNT(*) pending_early FROM early_leave_requests WHERE status = 'pending'`
    );

    res.json({
      total,
      present,
      late,
      leave,
      absent: Math.max(0, total - present - leave),
      pending_early_leaves: pending_early,
    });
  } catch (err) {
    serverError(res, err, 'stats');
  }
});

// ═════════════════════════════════════════════════════════
//  ADMIN REVIEW — flagged auto-clock-out records
// ═════════════════════════════════════════════════════════

// GET /attendance/needs-review
router.get('/needs-review', verifyToken, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, e.full_name, e.employee_code, e.email, e.phone,
              d.name AS department
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE a.needs_review = 1
         AND a.admin_resolved = 0
         AND a.clock_out IS NULL
       ORDER BY a.attendance_date DESC, e.full_name`
    );
    res.json(rows);
  } catch (err) {
    serverError(res, err, 'needs-review');
  }
});

// PUT /attendance/:id/resolve-review
// Body: { decision: 'present' | 'absent' }
// - present → close at work_end with status 'present' (or keep 'late')
// - absent  → close at work_end, status = 'absent'
// Both close the day, so the record stops nagging the employee.
router.put('/:id/resolve-review', verifyToken, isAdmin, async (req, res) => {
  const { decision } = req.body || {};
  if (!['present', 'absent'].includes(decision)) {
    return res.status(400).json({ message: 'decision must be present or absent' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT id, employee_id, attendance_date,
              DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date_key,
              clock_in,
              status, needs_review, admin_resolved
       FROM attendance WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Record not found' });
    const r = rows[0];
    if (r.admin_resolved || !r.needs_review) {
      return res.status(400).json({ message: 'This attendance record is not awaiting review' });
    }

    const [settingsRows] = await pool.query('SELECT work_end FROM settings WHERE id = 1');
    const workEnd = settingsRows[0]?.work_end || '17:00:00';

    // 'late' stays 'late' — admin is only confirming presence, not changing timing.
    const newStatus =
      decision === 'absent' ? 'absent' :
      (r.status === 'late' ? 'late' : 'present');

    const [result] = await pool.query(
      `UPDATE attendance
       SET clock_out = ?,
           auto_clocked_out = 0,
           auto_clock_out_reason = NULL,
           auto_close_time = NULL,
           status = ?,
           needs_review = 0,
           admin_resolved = 1,
           admin_resolved_by = ?,
           admin_resolved_at = NOW()
       WHERE id = ? AND needs_review = 1
         AND admin_resolved = 0 AND clock_out IS NULL`,
      [
        workEnd,
        newStatus,
        req.user.id,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'This attendance record has already been resolved' });
    }

    await notifyUser(r.employee_id, {
      type: 'attendance_admin_decision',
      title: decision === 'present' ? 'Your day was marked Present' : 'Your day was marked Absent',
      message:
        decision === 'present'
          ? `Admin has reviewed your missed clock-out on ${r.attendance_date_key} and recorded you as present.`
          : `Admin reviewed your missed clock-out on ${r.attendance_date_key} and recorded you as absent.`,
      targetPath: '/dashboard',
    });

    res.json({ message: 'Resolved', status: newStatus });
  } catch (err) {
    serverError(res, err, 'resolve-review');
  }
});

module.exports = router;