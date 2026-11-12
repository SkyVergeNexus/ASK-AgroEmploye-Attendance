const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const upload = require('../middleware/upload');
const router = express.Router();

// ============ REGISTER ============
router.post('/register', upload.single('picture'), async (req, res) => {
  console.log('==========================================');
  console.log('[register] REQUEST RECEIVED at', new Date().toISOString());
  console.log('[register] Content-Type:', req.headers['content-type']);
  console.log('[register] body:', req.body);
  console.log('[register] file:', req.file ? req.file.filename : 'no file');
  console.log('==========================================');

  const {
    employee_code,
    full_name,
    email,
    password,
    confirm_password,
    phone,
    gender,
    department_id,
    role_id,
  } = req.body;

  try {
    // --- required fields ---
    if (
      !employee_code?.trim() ||
      !full_name?.trim() ||
      !email?.trim() ||
      !password?.trim()
    ) {
      console.log('[register] MISSING required fields:', {
        employee_code: !!employee_code,
        full_name: !!full_name,
        email: !!email,
        password: !!password,
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // --- password confirmation ---
    if (!confirm_password || confirm_password !== password) {
      console.log('[register] PASSWORD MISMATCH:', {
        hasConfirm: !!confirm_password,
        passwordsEqual: confirm_password === password,
        confirmLength: confirm_password ? confirm_password.length : 0,
        passwordLength: password ? password.length : 0,
      });
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const code = employee_code.trim();
    const name = full_name.trim();
    const mail = email.trim().toLowerCase();

    console.log('[register] attempting to insert:', {
      employee_code: code,
      email: mail,
    });

    // --- duplicate pre-check ---
    const [dupes] = await pool.query(
      'SELECT employee_code, email FROM employees WHERE employee_code = ? OR email = ? LIMIT 1',
      [code, mail]
    );
    if (dupes.length) {
      const existing = dupes[0];
      console.log('[register] DUPLICATE FOUND:', existing);
      if (existing.email === mail) {
        return res
          .status(409)
          .json({ message: 'An account with this email already exists' });
      }
      if (existing.employee_code === code) {
        return res.status(409).json({ message: 'This staff ID is already in use' });
      }
      return res.status(409).json({ message: 'Duplicate registration' });
    }

    // --- hash + save ---
    console.log('[register] hashing password...');
    const hash = await bcrypt.hash(password, 10);
    const picturePath = req.file ? '/uploads/' + req.file.filename : null;

    console.log('[register] inserting into employees table...');
    const [result] = await pool.query(
      `INSERT INTO employees
        (employee_code, full_name, email, password_hash, phone, gender, profile_picture, department_id, role_id, is_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [
        code,
        name,
        mail,
        hash,
        phone || null,
        gender || null,
        picturePath,
        department_id || null,
        role_id || null,
      ]
    );

    console.log('[register] SUCCESS — new employee id:', result.insertId);
    res.status(201).json({
      message: 'Registration submitted. Awaiting admin approval.',
    });
  } catch (err) {
    // --- MySQL duplicate key errors (fallback) ---
    if (err.code === 'ER_DUP_ENTRY') {
      console.log('[register] MYSQL DUPLICATE KEY:', err.message);
      if (/email/i.test(err.message)) {
        return res
          .status(409)
          .json({ message: 'An account with this email already exists' });
      }
      if (/employee_code|staff/i.test(err.message)) {
        return res
          .status(409)
          .json({ message: 'This staff ID is already in use' });
      }
      return res.status(409).json({ message: 'Duplicate registration' });
    }

    // --- catch everything else ---
    console.error('==========================================');
    console.error('[register] UNEXPECTED ERROR');
    console.error('[register] err.code:', err.code);
    console.error('[register] err.sqlMessage:', err.sqlMessage);
    console.error('[register] err.message:', err.message);
    console.error('[register] err.stack:', err.stack);
    console.error('==========================================');

    res.status(500).json({ message: 'Registration failed' });
  }
});

// ============ LOGIN ============
router.post('/login', async (req, res) => {
  console.log('==========================================');
  console.log('[login] REQUEST RECEIVED at', new Date().toISOString());
  console.log('[login] email:', req.body?.email);
  console.log('==========================================');

  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    console.log('[login] MISSING email or password');
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT e.*, d.name AS department_name, r.name AS role_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN roles r ON e.role_id = r.id
       WHERE e.email = ?`,
      [email.trim().toLowerCase()]
    );

    if (!rows.length) {
      console.log('[login] NO USER FOUND for email:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    console.log('[login] user found:', {
      id: user.id,
      email: user.email,
      is_active: user.is_active,
      is_approved: user.is_approved,
      system_role: user.system_role,
    });

    const valid = await bcrypt.compare(password, user.password_hash);
    console.log('[login] password valid:', valid);

    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!user.is_active) {
      console.log('[login] ACCOUNT DISABLED');
      return res.status(403).json({ message: 'Account disabled' });
    }
    if (!user.is_approved) {
      console.log('[login] ACCOUNT NOT APPROVED');
      return res.status(403).json({ message: 'Account pending admin approval' });
    }

    const token = jwt.sign(
      { id: user.id, system_role: user.system_role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    let login_cover_url = null;
    try {
      const [s] = await pool.query(
        'SELECT login_cover_url FROM settings WHERE id = 1'
      );
      login_cover_url = s[0]?.login_cover_url || null;
    } catch {
      /* ignore */
    }

    console.log('[login] SUCCESS — issued token for user', user.id);
    res.json({
      token,
      login_cover_url,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        code: user.employee_code,
        profile_picture: user.profile_picture,
        department_id: user.department_id,
        department_name: user.department_name,
        role_id: user.role_id,
        role_name: user.role_name,
        system_role: user.system_role,
        is_approved: user.is_approved,
      },
    });
  } catch (err) {
    console.error('==========================================');
    console.error('[login] UNEXPECTED ERROR');
    console.error('[login] err.code:', err.code);
    console.error('[login] err.message:', err.message);
    console.error('[login] err.stack:', err.stack);
    console.error('==========================================');
    res.status(500).json({ message: 'Login failed' });
  }
});

module.exports = router;