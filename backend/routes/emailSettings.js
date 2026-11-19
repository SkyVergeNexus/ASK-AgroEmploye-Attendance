const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { verifyToken, isAdmin } = require('../middleware/auth');
const {
  createSmtpTransport,
  encryptPassword,
  getPublicSmtpSettings,
  isEncryptionKeyConfigured,
  loadSmtpConfig,
} = require('../helpers/smtpSettings');
const {
  buildGoogleAuthorizationUrl,
  exchangeAuthorizationCode,
  getGoogleAccount,
  getGoogleOAuthConfig,
  sendGmailMessage,
} = require('../helpers/googleMail');

const router = express.Router();

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    res.json(await getPublicSmtpSettings(pool));
  } catch (error) {
    console.error('[email settings] load failed:', error.message);
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        message: 'Email sender storage is not up to date. Restart the backend with npm start to run migrations.',
      });
    }
    res.status(500).json({ message: 'Unable to load email sender settings.' });
  }
});

router.put('/', verifyToken, isAdmin, async (req, res) => {
  const provider = req.body?.provider === 'gmail_api' ? 'gmail_api' : 'smtp';
  const host = provider === 'gmail_api'
    ? 'gmail.googleapis.com'
    : typeof req.body?.host === 'string' ? req.body.host.trim() : '';
  const port = provider === 'gmail_api' ? 443 : Number(req.body?.port);
  const secure = provider === 'gmail_api' ? true : req.body?.secure;
  const submittedUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fromEmail = typeof req.body?.fromEmail === 'string' ? req.body.fromEmail.trim() : '';
  const username = provider === 'gmail_api' ? fromEmail : submittedUsername;

  if (provider === 'smtp') {
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
    if (host.toLowerCase() === 'smtp.gmail.com') {
      if (port !== 465 && port !== 587) {
        return res.status(400).json({
          message: 'Gmail SMTP uses port 465 or 587. Use 465 with implicit TLS on, or 587 with implicit TLS off.',
        });
      }
      if ((port === 465 && !secure) || (port === 587 && secure)) {
        return res.status(400).json({
          message: 'For Gmail, use implicit TLS on port 465 and off on port 587.',
        });
      }
    } else if (port === 465 && !secure) {
      return res.status(400).json({ message: 'Port 465 requires implicit TLS to be enabled.' });
    }
  } else if (!isEncryptionKeyConfigured()) {
    return res.status(503).json({
      message: 'Configure a valid SMTP_CREDENTIALS_ENCRYPTION_KEY before saving Gmail API settings.',
    });
  }
  if (!validEmail(fromEmail) || fromEmail.length > 255) {
    return res.status(400).json({ message: 'Enter a valid sender email address.' });
  }
  if (password.length > 1000) {
    return res.status(400).json({ message: 'SMTP password is too long.' });
  }

  try {
    const [existingRows] = await pool.query(
      `SELECT provider, username, encrypted_password, encrypted_google_refresh_token, from_email
       FROM notification_email_settings
       WHERE id = 1`
    );
    const existing = existingRows[0];
    if (
      provider === 'smtp'
      && !password
      && (!existing || existing.provider !== 'smtp')
    ) {
      return res.status(400).json({ message: 'Enter the SMTP password or app password.' });
    }

    const sameGmailAccount = existing
      && existing.provider === 'gmail_api'
      && existing.from_email?.toLowerCase() === fromEmail.toLowerCase();
    const encryptedPassword = provider === 'gmail_api'
      ? ''
      : password
        ? encryptPassword(password)
        : existing.encrypted_password;
    const encryptedGoogleRefreshToken = sameGmailAccount
      ? existing.encrypted_google_refresh_token
      : null;

    await pool.query(
      `INSERT INTO notification_email_settings
        (id, host, port, secure, provider, username, encrypted_password,
         encrypted_google_refresh_token, from_email, updated_by)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         host = VALUES(host),
         port = VALUES(port),
         secure = VALUES(secure),
         provider = VALUES(provider),
         username = VALUES(username),
         encrypted_password = VALUES(encrypted_password),
         encrypted_google_refresh_token = VALUES(encrypted_google_refresh_token),
         from_email = VALUES(from_email),
         updated_by = VALUES(updated_by)`,
      [
        host,
        port,
        secure ? 1 : 0,
        provider,
        username,
        encryptedPassword,
        encryptedGoogleRefreshToken,
        fromEmail,
        req.user.id,
      ]
    );

    res.json({
      message: 'Email sender settings saved.',
      settings: {
        provider,
        host,
        port,
        secure,
        username,
        fromEmail,
        hasPassword: provider === 'smtp',
        gmailApiConnected: Boolean(encryptedGoogleRefreshToken),
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
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        message: 'Email sender storage is not up to date. Restart the backend with npm start to run migrations.',
      });
    }
    res.status(500).json({ message: 'Unable to save email sender settings.' });
  }
});

function googleOAuthResult(res, status, message, closeWindow) {
  const closeScript = closeWindow ? '<script>window.close();</script>' : '';
  res.status(status).type('html').send(
    `<!doctype html><html><head><meta charset="utf-8"><title>Gmail sender</title></head>` +
    `<body><p>${message}</p>${closeScript}</body></html>`
  );
}

router.get('/google/authorize', verifyToken, isAdmin, async (req, res) => {
  if (!isEncryptionKeyConfigured()) {
    return res.status(503).json({
      message: 'Configure a valid SMTP_CREDENTIALS_ENCRYPTION_KEY before connecting Gmail.',
    });
  }

  try {
    const [rows] = await pool.query(
      'SELECT provider FROM notification_email_settings WHERE id = 1'
    );
    if (!rows.length || rows[0].provider !== 'gmail_api') {
      return res.status(400).json({ message: 'Save Gmail API as the sender before connecting it.' });
    }

    const config = getGoogleOAuthConfig();
    const state = jwt.sign(
      {
        purpose: 'gmail_notification_sender',
        adminId: Number(req.user.id),
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    res.json({ authorizationUrl: buildGoogleAuthorizationUrl(config, state) });
  } catch (error) {
    console.error('[email settings] Gmail authorization start failed:', error.code || error.message);
    if (error.message.includes('Google OAuth')) {
      return res.status(503).json({
        message: 'Configure GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI on the backend.',
      });
    }
    res.status(500).json({ message: 'Unable to start Google authorization.' });
  }
});

router.get('/google/callback', async (req, res) => {
  if (req.query.error) {
    return googleOAuthResult(res, 400, 'Google authorization was cancelled. Return to the app and try again.', false);
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) {
    return googleOAuthResult(res, 400, 'The Google authorization response was incomplete. Return to the app and try again.', false);
  }

  try {
    const claims = jwt.verify(state, process.env.JWT_SECRET);
    if (claims.purpose !== 'gmail_notification_sender' || !Number.isInteger(Number(claims.adminId))) {
      return googleOAuthResult(res, 400, 'The Google authorization state is invalid. Start again from the app.', false);
    }

    const config = getGoogleOAuthConfig();
    const tokens = await exchangeAuthorizationCode(config, code);
    if (!tokens.refreshToken) {
      return googleOAuthResult(res, 400, 'Google did not return offline access. Reconnect and approve access again.', false);
    }
    const account = await getGoogleAccount(tokens.accessToken);
    const accountEmail = typeof account.email === 'string' ? account.email.trim().toLowerCase() : '';
    if (!accountEmail || account.email_verified !== true) {
      return googleOAuthResult(res, 400, 'Google could not verify the authorized email address.', false);
    }

    const [rows] = await pool.query(
      'SELECT provider, from_email FROM notification_email_settings WHERE id = 1'
    );
    if (!rows.length || rows[0].provider !== 'gmail_api') {
      return googleOAuthResult(res, 400, 'Gmail API is no longer the selected sender. Return to settings and try again.', false);
    }
    if (rows[0].from_email.trim().toLowerCase() !== accountEmail) {
      return googleOAuthResult(res, 400, 'Authorize the same Gmail address entered as the sender, then try again.', false);
    }

    await pool.query(
      `UPDATE notification_email_settings
       SET username = ?, encrypted_google_refresh_token = ?, updated_by = ?
       WHERE id = 1 AND provider = 'gmail_api'`,
      [accountEmail, encryptPassword(tokens.refreshToken), Number(claims.adminId)]
    );
    googleOAuthResult(res, 200, 'Gmail sender connected. Return to the app; this window will close.', true);
  } catch (error) {
    console.error('[email settings] Gmail authorization callback failed:', error.code || error.message);
    googleOAuthResult(res, 400, 'Unable to connect Gmail. Check the Google OAuth setup and retry from the app.', false);
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

    const message = {
      to: admins[0].email,
      subject: 'ASK Agrobusiness notification email test',
      text: `This is a test email from ${config.fromEmail}. Notification emails are configured.`,
    };
    if (config.provider === 'gmail_api') {
      await sendGmailMessage(config, message);
    } else {
      transporter = createSmtpTransport(config);
      await transporter.verify();
      await transporter.sendMail({ from: config.fromEmail, ...message });
    }
    res.json({ message: `Test email sent to ${admins[0].email}.` });
  } catch (error) {
    console.error('[email settings] email test failed:', error.message);
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        message: 'Email sender storage is not up to date. Restart the backend with npm start to run migrations.',
      });
    }
    if (error.message.includes('Google OAuth')) {
      return res.status(503).json({
        message: 'Configure Google OAuth client ID, client secret, and redirect URI on the backend.',
      });
    }
    if (error.message.includes('Connect the Gmail account')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('SMTP_CREDENTIALS_ENCRYPTION_KEY')) {
      return res.status(503).json({
        message: 'The backend SMTP encryption key is missing or invalid. Configure a base64-encoded 32-byte key before testing.',
      });
    }
    if (/unable to authenticate data|bad decrypt/i.test(error.message)) {
      return res.status(503).json({
        message: 'The saved mail credential cannot be decrypted with the current encryption key. Re-enter the SMTP password or reconnect Gmail.',
      });
    }
    if (error.code === 'invalid_grant') {
      return res.status(400).json({
        message: 'Gmail authorization expired or was revoked. Reconnect the Gmail sender.',
      });
    }
    if (error.code === 'GMAIL_API_HTTP_401' || error.code === 'GMAIL_API_HTTP_403') {
      return res.status(502).json({
        message: 'Google rejected the Gmail API request. Confirm Gmail API is enabled and reconnect with the Gmail send permission.',
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
      message: 'Email test failed. Check the selected delivery method and its configuration.',
    });
  } finally {
    if (transporter) transporter.close();
  }
});

module.exports = router;
