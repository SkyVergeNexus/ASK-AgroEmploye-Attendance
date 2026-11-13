const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------- STATIC ASSETS ----------
// Serves uploaded profile pictures AND login/register cover images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- API ROUTES ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/settings', require('./routes/settings'));

// ---------- HEALTH CHECK ----------
app.get('/', (_, res) =>
  res.json({ message: 'ASK Agrobusiness Attendance API' })
);

// ---------- 404 FALLBACK ----------
app.use((req, res) => {
  res.status(404).json({ message: 'Not found: ' + req.originalUrl });
});

// ---------- GLOBAL ERROR HANDLER ----------
// Catches any uncaught throw from a route so the process doesn't crash.
// Multer errors (file too large, wrong type) also land here.
app.use((err, req, res, next) => {
  console.error('[server error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File too large (max 5 MB)' });
  }
  if (err.message && /Only .* allowed/i.test(err.message)) {
    return res.status(415).json({ message: err.message });
  }
  res.status(500).json({ message: 'Internal server error' });
});

// ---------- START ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () =>
  console.log('Server on http://localhost:' + PORT)
);