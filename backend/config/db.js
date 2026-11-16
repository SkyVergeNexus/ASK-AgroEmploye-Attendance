const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const caCert = fs.readFileSync(path.join(__dirname, '..', 'ca.pem'));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    ca: caCert,
    rejectUnauthorized: true,
  },

  // ── Pool behaviour ────────────────────────────────────────
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // ── Keep-alive: the actual fix for ECONNRESET ────────────
  // Sends TCP probes every 10s so Aiven never sees the socket
  // as idle and silently drops it.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,

  // ── Optional: recycle idle connections before Aiven's
  // wait_timeout hits (defaults are fine, uncomment to tune)
  // maxIdle: 5,
  // idleTimeout: 60000,

  // ── Fail fast if no connection can be acquired ───────────
  connectTimeout: 20000,
});

// ── CRITICAL: swallow pool-level 'error' events ───────────
// Without this, an ECONNRESET from the underlying socket is
// emitted as an unhandled 'error' event and crashes the process.
pool.on('error', (err) => {
  console.error('[db] pool error:', err.code, '—', err.message);
  // Do not throw. mysql2 will discard the dead connection
  // and open a fresh one on the next pool.query() call.
});

module.exports = pool;