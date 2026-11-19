const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const {
  createSmtpTransport,
  encryptPassword,
  getPublicSmtpSettings,
  loadSmtpConfig,
} = require('../helpers/smtpSettings');

const router = express.Router();

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    res.json(await getPublicSmtpSettings(pool));
  } catch (error) {
    console.error('[email settings] load failed:', error.message);
    res.status(500).json({ message: 'Unable to load email sender settings.' });
  }
});

router.put('/', verifyToken, isAdmin, async (req, res) => {
  const host = typeof req.body?.host === 'string' ? req.body.host.trim() : '';
  const port = Number(req.body?.port);
  const secure = req.body?.secure;
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fromEmail = typeof req.body?.fromEmail === 'string' ? req.body.fromEmail.trim() : '';

  if (!host || host.length > 255) {
    return res.status(400).json({ message: 'Enter a valid SMTP host.' });
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(400).json({ message: 'Enter an SMTP port from 1 to 65535.' });
  }
  if (typeof secure !== 'boolean') {
    return res.status(400).json({ message: 'Choose whether SMTP uses implicit TLS.' });
  }
  if (!username || username.length > 255) {
    return res.status(400).json({ message: 'Enter the SMTP username for the sender mailbox.' });
  }
  if (!validEmail(fromEmail) || fromEmail.length > 255) {
    return res.status(400).json({ message: 'Enter a valid sender email address.' });
  }
  if (password.length > 1000) {
    return res.status(400).json({ message: 'SMTP password is too long.' });
  }
  if (port === 465 && !secure) {
    return res.status(400).json({ message: 'Port 465 requires implicit TLS to be enabled.' });
  }

  try {
    const [existingRows] = await pool.query(
      'SELECT encrypted_password FROM notification_email_settings WHERE id = 1'
    );
    if (!password && !existingRows.length) {
      return res.status(400).json({ message: 'Enter the SMTP password or app password.' });
    }

    const encryptedPassword = password
      ? encryptPassword(password)
      : existingRows[0].encrypted_password;

    await pool.query(
      `INSERT INTO notification_email_settings
        (id, host, port, secure, username, encrypted_password, from_email, updated_by)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         host = VALUES(host),
         port = VALUES(port),
         secure = VALUES(secure),
         username = VALUES(username),
         encrypted_password = VALUES(encrypted_password),
         from_email = VALUES(from_email),
         updated_by = VALUES(updated_by)`,
      [host, port, secure ? 1 : 0, username, encryptedPassword, fromEmail, req.user.id]
    );

    res.json({
      message: 'Email sender settings saved.',
      settings: {
        host,
        port,
        secure,
        username,
        fromEmail,
        hasPassword: true,
        source: 'database',
        configured: true,
      },
    });
  } catch (error) {
    console.error('[email settings] save failed:', error.message);
    if (error.message.includes('SMTP_CREDENTIALS_ENCRYPTION_KEY')) {
      return res.status(503).json({
        message: 'Set a valid SMTP_CREDENTIALS_ENCRYPTION_KEY on the backend before saving SMTP credentials.',
      });
    }
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        message: 'Email settings storage is not initialized. Restart the backend with npm start to run migrations.',
      });
    }
    res.status(500).json({ message: 'Unable to save email sender settings.' });
  }
});

router.post('/test', verifyToken, isAdmin, async (req, res) => {
  let transporter;
  try {
    const config = await loadSmtpConfig(pool);
    if (!config) {
      return res.status(400).json({ message: 'Save SMTP settings before sending a test email.' });
    }

    const [admins] = await pool.query(
      'SELECT email FROM employees WHERE id = ? AND system_role = ?',
      [req.user.id, 'admin']
    );
    if (!admins.length || !admins[0].email) {
      return res.status(400).json({ message: 'The signed-in admin account has no email address.' });
    }

    transporter = createSmtpTransport(config);
    await transporter.verify();
    await transporter.sendMail({
      from: config.fromEmail,
      to: admins[0].email,
      subject: 'ASK Agrobusiness notification email test',
      text: `This is a test email from ${config.fromEmail}. Notification emails are configured.`,
    });
    res.json({ message: `Test email sent to ${admins[0].email}.` });
  } catch (error) {
    console.error('[email settings] SMTP test failed:', error.message);
    if (error.message.includes('SMTP_CREDENTIALS_ENCRYPTION_KEY')) {
      return res.status(503).json({
        message: 'The backend SMTP encryption key is missing or invalid. Configure a base64-encoded 32-byte key in Render before testing.',
      });
    }
    if (/unable to authenticate data|bad decrypt/i.test(error.message)) {
      return res.status(503).json({
        message: 'The saved SMTP password cannot be decrypted with the current encryption key. Re-enter the SMTP password and save the settings again.',
      });
    }
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      return res.status(502).json({
        message: 'The SMTP server rejected the login. Check the username and password; for Gmail, use the full Gmail address and a current Google app password.',
      });
    }
    if (error.code === 'ECONNECTION') {
      return res.status(502).json({
        message: 'The SMTP connection closed before login. For Gmail, try port 465 with implicit TLS enabled.',
      });
    }
    res.status(502).json({
      message: 'SMTP test failed. Check the host, port, security mode, username, password, and sender authorization.',
    });
  } finally {
    if (transporter) transporter.close();
  }
});

module.exports = router;
