const pool = require('../config/db');
const { createSmtpTransport, loadSmtpConfig } = require('./smtpSettings');
const { sendGmailMessage } = require('./googleMail');

let smtpWarningLogged = false;

async function getMailer() {
  let config;
  try {
    config = await loadSmtpConfig(pool);
  } catch (error) {
    if (!smtpWarningLogged) {
      console.error('[notifications] Unable to load SMTP settings:', error.message);
      smtpWarningLogged = true;
    }
    return null;
  }

  if (!config) {
    if (!smtpWarningLogged) {
      console.warn('[notifications] Email is not configured; in-app notifications will continue to work.');
      smtpWarningLogged = true;
    }
    return null;
  }

  const mailer = config.provider === 'gmail_api'
    ? {
        sendMail: (message) => sendGmailMessage(config, message),
        close: () => {},
      }
    : createSmtpTransport(config);
  return { config, mailer };
}

async function notifyUsers(employeeIds, notification) {
  const ids = [...new Set(employeeIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return;

  let recipients;
  try {
    [recipients] = await pool.query(
      'SELECT id, email FROM employees WHERE id IN (?)',
      [ids]
    );
    if (!recipients.length) return;

    const values = recipients.flatMap((recipient) => [
      recipient.id,
      notification.type,
      notification.title,
      notification.message,
      notification.targetPath || null,
    ]);
    const placeholders = recipients.map(() => '(?, ?, ?, ?, ?)').join(', ');
    await pool.query(
      `INSERT INTO notifications
        (employee_id, event_type, title, message, target_path)
       VALUES ${placeholders}`,
      values
    );
  } catch (error) {
    console.error(`[notifications] Could not save ${notification.type}:`, error.message);
    return;
  }

  const mail = await getMailer();
  if (!mail) return;

  const appUrl = process.env.NOTIFICATION_APP_URL?.trim().replace(/\/+$/, '');
  const targetUrl = appUrl && notification.targetPath
    ? `${appUrl}${notification.targetPath}`
    : null;
  try {
    await Promise.all(
      recipients
        .filter((recipient) => recipient.email)
        .map(async (recipient) => {
          try {
            await mail.mailer.sendMail({
              from: mail.config.fromEmail,
              to: recipient.email,
              subject: notification.title,
              text: [
                notification.message,
                targetUrl ? `Open the app: ${targetUrl}` : null,
              ].filter(Boolean).join('\n\n'),
            });
          } catch (error) {
            console.error(
              `[notifications] Email delivery failed for employee ${recipient.id}:`,
              error.message
            );
          }
        })
    );
  } finally {
    mail.mailer.close();
  }
}

async function notifyUser(employeeId, notification) {
  await notifyUsers([employeeId], notification);
}

async function notifyAdmins(notification) {
  try {
    const [admins] = await pool.query(
      `SELECT id FROM employees
       WHERE system_role = 'admin' AND is_active = 1`
    );
    await notifyUsers(admins.map((admin) => admin.id), notification);
  } catch (error) {
    console.error(`[notifications] Could not notify admins about ${notification.type}:`, error.message);
  }
}

module.exports = { notifyAdmins, notifyUser };
