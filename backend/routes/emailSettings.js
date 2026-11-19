const express = require('express');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const {
  createSmtpTransport,
  decryptPassword,
  encryptPassword,
  getPublicSmtpSettings,
  isEncryptionKeyConfigured,
  loadSmtpConfig,
} = require('../helpers/smtpSettings');
const { pollDeviceCode, startDeviceCode } = require('../helpers/microsoftOAuth');

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
  const authType = req.body?.authType === 'outlook_oauth2' ? 'outlook_oauth2' : 'smtp_password';
  const host = authType === 'outlook_oauth2'
    ? 'smtp-mail.outlook.com'
    : typeof req.body?.host === 'string' ? req.body.host.trim() : '';
  const port = authType === 'outlook_oauth2' ? 587 : Number(req.body?.port);
  const secure = authType === 'outlook_oauth2' ? false : req.body?.secure;
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
  if (authType === 'outlook_oauth2' && !validEmail(username)) {
    return res.status(400).json({ message: 'Enter the Outlook mailbox email address as the username.' });
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
      `SELECT auth_type, username, encrypted_password, encrypted_refresh_token
       FROM notification_email_settings
       WHERE id = 1`
    );
    const existing = existingRows[0];
    const sameAccount = existing
      && existing.auth_type === authType
      && existing.username.toLowerCase() === username.toLowerCase();

    if (authType === 'outlook_oauth2' && !process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim()) {
      return res.status(503).json({
        message: 'Configure MICROSOFT_OAUTH_CLIENT_ID on the backend before connecting Outlook.',
      });
    }
    if (
      authType === 'smtp_password'
      && !password
      && (
        !existing
        || existing.auth_type !== authType
        || existing.username.toLowerCase() !== username.toLowerCase()
      )
    ) {
      return res.status(400).json({ message: 'Enter the SMTP password or app password.' });
    }

    const encryptedPassword = authType === 'outlook_oauth2'
      ? ''
      : password
        ? encryptPassword(password)
        : existing.encrypted_password;
    const encryptedRefreshToken = authType === 'outlook_oauth2' && sameAccount
      ? existing.encrypted_refresh_token
      : null;

    await pool.query(
      `INSERT INTO notification_email_settings
        (id, host, port, secure, auth_type, username, encrypted_password,
         encrypted_refresh_token, from_email, updated_by)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         host = VALUES(host),
         port = VALUES(port),
         secure = VALUES(secure),
         auth_type = VALUES(auth_type),
         username = VALUES(username),
         encrypted_password = VALUES(encrypted_password),
         encrypted_refresh_token = VALUES(encrypted_refresh_token),
         from_email = VALUES(from_email),
         updated_by = VALUES(updated_by)`,
      [
        host,
        port,
        secure ? 1 : 0,
        authType,
        username,
        encryptedPassword,
        encryptedRefreshToken,
        fromEmail,
        req.user.id,
      ]
    );

    res.json({
      message: 'Email sender settings saved.',
      settings: {
        authType,
        host,
        port,
        secure,
        username,
        fromEmail,
        hasPassword: authType === 'smtp_password',
        outlookConnected: Boolean(encryptedRefreshToken),
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

router.post('/outlook/device-code', verifyToken, isAdmin, async (req, res) => {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return res.status(503).json({
      message: 'Configure MICROSOFT_OAUTH_CLIENT_ID on the backend before connecting Outlook.',
    });
  }
  if (!isEncryptionKeyConfigured()) {
    return res.status(503).json({
      message: 'Configure a valid SMTP_CREDENTIALS_ENCRYPTION_KEY before connecting Outlook.',
    });
  }

  try {
    const [rows] = await pool.query(
      'SELECT auth_type FROM notification_email_settings WHERE id = 1'
    );
    if (!rows.length || rows[0].auth_type !== 'outlook_oauth2') {
      return res.status(400).json({ message: 'Save Outlook as the email sender before connecting it.' });
    }

    const device = await startDeviceCode(clientId);
    res.json({
      deviceCode: device.device_code,
      userCode: device.user_code,
      verificationUri: device.verification_uri_complete || device.verification_uri,
      expiresIn: Number(device.expires_in) || 900,
      interval: Number(device.interval) || 5,
    });
  } catch (error) {
    console.error('[email settings] Outlook sign-in start failed:', error.code || error.message);
    res.status(502).json({ message: 'Unable to start Outlook sign-in. Check the Microsoft app registration and try again.' });
  }
});

router.post('/outlook/poll', verifyToken, isAdmin, async (req, res) => {
  const deviceCode = typeof req.body?.deviceCode === 'string' ? req.body.deviceCode : '';
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
  if (!deviceCode || deviceCode.length > 4096) {
    return res.status(400).json({ message: 'The Outlook sign-in session is invalid. Start again.' });
  }
  if (!clientId) {
    return res.status(503).json({ message: 'Microsoft Outlook sign-in is not configured on the backend.' });
  }
  if (!isEncryptionKeyConfigured()) {
    return res.status(503).json({ message: 'Configure a valid SMTP_CREDENTIALS_ENCRYPTION_KEY before connecting Outlook.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT auth_type FROM notification_email_settings WHERE id = 1'
    );
    if (!rows.length || rows[0].auth_type !== 'outlook_oauth2') {
      return res.status(400).json({ message: 'Save Outlook as the email sender before connecting it.' });
    }

    const result = await pollDeviceCode(clientId, deviceCode);
    if (result.status === 'pending') {
      return res.status(202).json({
        status: 'pending',
        interval: result.slowDown ? 10 : 5,
      });
    }

    await pool.query(
      `UPDATE notification_email_settings
       SET encrypted_refresh_token = ?, updated_by = ?
       WHERE id = 1 AND auth_type = 'outlook_oauth2'`,
      [encryptPassword(result.refreshToken), req.user.id]
    );
    res.json({ status: 'connected', message: 'Outlook mailbox connected.' });
  } catch (error) {
    console.error('[email settings] Outlook sign-in failed:', error.code || error.message);
    if (error.code === 'expired_token') {
      return res.status(400).json({ message: 'The Outlook sign-in code expired. Start the connection again.' });
    }
    if (error.code === 'authorization_declined') {
      return res.status(400).json({ message: 'Outlook sign-in was declined. Start again if you want to connect this mailbox.' });
    }
    if (error.code === 'invalid_client' || error.code === 'invalid_scope') {
      return res.status(502).json({
        message: 'Check the Microsoft app registration, public-client setting, and delegated SMTP.Send permission.',
      });
    }
    res.status(502).json({ message: 'Unable to complete Outlook sign-in. Check the Microsoft app registration and try again.' });
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
    if (error.message.includes('MICROSOFT_OAUTH_CLIENT_ID')) {
      return res.status(503).json({
        message: 'Configure MICROSOFT_OAUTH_CLIENT_ID on the backend, then reconnect Outlook.',
      });
    }
    if (error.message.includes('Connect the Outlook mailbox')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'invalid_grant') {
      return res.status(400).json({
        message: 'The Outlook authorization expired or was revoked. Reconnect the Outlook mailbox.',
      });
    }
    if (error.code === 'invalid_client' || error.code === 'invalid_scope') {
      return res.status(502).json({
        message: 'Check the Microsoft app registration and delegated SMTP.Send permission.',
      });
    }
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
        message: 'The SMTP server rejected authentication. For Outlook, reconnect with OAuth2 and confirm SMTP.Send permission and mailbox SMTP AUTH are enabled.',
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
