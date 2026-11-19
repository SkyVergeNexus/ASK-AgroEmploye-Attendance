const crypto = require('crypto');
const nodemailer = require('nodemailer');

function getEncryptionKey() {
  const encoded = process.env.SMTP_CREDENTIALS_ENCRYPTION_KEY;
  const key = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  if (key.length !== 32) {
    throw new Error('SMTP_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

function isEncryptionKeyConfigured() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

function decryptPassword(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Stored SMTP credential has an invalid format.');
  }

  const [iv, authTag, encrypted] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function environmentSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const username = process.env.SMTP_USER?.trim() || '';
  const password = process.env.SMTP_PASS || '';
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim();

  if (!host && !fromEmail && !username && !password) return null;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !fromEmail) {
    throw new Error('SMTP environment settings are incomplete.');
  }
  if (Boolean(username) !== Boolean(password)) {
    throw new Error('SMTP_USER and SMTP_PASS must both be set or both be empty.');
  }

  return {
    host,
    port,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || port === 465,
    username,
    password,
    fromEmail,
    source: 'environment',
  };
}

async function loadSmtpConfig(pool) {
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT host, port, secure, username, encrypted_password, from_email
       FROM notification_email_settings
       WHERE id = 1`
    );
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return environmentSmtpConfig();
    throw error;
  }

  if (!rows.length) return environmentSmtpConfig();

  const settings = rows[0];
  return {
    host: settings.host,
    port: Number(settings.port),
    secure: Boolean(Number(settings.secure)),
    username: settings.username,
    password: decryptPassword(settings.encrypted_password),
    fromEmail: settings.from_email,
    source: 'database',
  };
}

async function getPublicSmtpSettings(pool) {
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT host, port, secure, username, encrypted_password, from_email
       FROM notification_email_settings
       WHERE id = 1`
    );
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    rows = [];
  }

  const saved = rows[0];
  const environment = saved ? null : environmentSmtpConfig();
  const settings = saved
    ? {
        host: saved.host,
        port: Number(saved.port),
        secure: Boolean(Number(saved.secure)),
        username: saved.username,
        fromEmail: saved.from_email,
        hasPassword: Boolean(saved.encrypted_password),
        source: 'database',
        configured: true,
      }
    : {
        host: environment?.host || process.env.SMTP_HOST || '',
        port: environment?.port || Number(process.env.SMTP_PORT) || 587,
        secure: environment?.secure || String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        username: environment?.username || process.env.SMTP_USER || '',
        fromEmail: environment?.fromEmail || process.env.NOTIFICATION_FROM_EMAIL || '',
        hasPassword: Boolean(environment?.password),
        source: environment ? 'environment' : 'none',
        configured: Boolean(environment),
      };

  return {
    ...settings,
    encryptionKeyConfigured: isEncryptionKeyConfigured(),
  };
}

function createSmtpTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...(config.username
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
  });
}

module.exports = {
  createSmtpTransport,
  decryptPassword,
  encryptPassword,
  getPublicSmtpSettings,
  isEncryptionKeyConfigured,
  loadSmtpConfig,
};
