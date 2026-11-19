# Notifications

The authenticated admin and employee pages show a floating notification bell. It polls for new notifications every 30 seconds, displays unread counts, and lets each user mark notifications read. Notifications are private to the signed-in employee account.

Key events create in-app notifications:

- Attendance clock-in and clock-out, guest check-ins, employee registrations, and new leave or early-leave requests notify active admins.
- Guest assignment or reassignment notifies the assigned employee and admins. A previously assigned employee is also notified when the assignment changes.
- Guest status updates notify admins.
- Leave decisions, early-leave decisions, employee approval changes, and admin employee-profile changes notify the affected employee and admins.

## Configure the sender mailbox

An admin can configure one sender mailbox from **System Settings → Notification email sender**. The mailbox must be authorized to send through the selected SMTP server. Notification recipients continue to use their email addresses saved in their employee accounts.

For Gmail, use `smtp.gmail.com`, port `465` with implicit TLS enabled or port `587` with implicit TLS disabled. Gmail requires an app password when SMTP app-password access is available; do not enter the normal Google account password. Other providers may use different host, port, authentication, or security requirements.

The SMTP password is encrypted with AES-256-GCM before it is stored in MySQL. Before saving sender settings, add `SMTP_CREDENTIALS_ENCRYPTION_KEY` to the backend host's environment. Generate a 32-byte key encoded as Base64 with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep that value secret and unchanged across deployments. If it is lost or replaced, the saved SMTP password cannot be decrypted; configure the sender again with a new key and password.

After saving, **Send test email** sends a test to the signed-in admin's registered email address. SMTP failures are logged and do not undo attendance, leave, or assignment actions. The optional `NOTIFICATION_APP_URL` environment variable adds a direct link to notification emails.

The previous `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `NOTIFICATION_FROM_EMAIL` environment variables remain supported as a fallback if no admin-managed sender has been saved.

## Database and Render deployment

Notification storage is created by migrations `013_create_notifications.js` and `014_create_notification_email_settings.js`. In the Render backend service, set the **Start Command** to:

```text
npm start
```

The backend's `start` script runs `node db/migrate.js` before starting the API. Keep SMTP credentials and `SMTP_CREDENTIALS_ENCRYPTION_KEY` out of source control and frontend configuration.
