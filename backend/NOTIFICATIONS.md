# Notifications

The authenticated admin and employee pages show a floating notification bell. It polls for new notifications every 30 seconds, displays unread counts, and lets each user mark notifications read. Notifications are private to the signed-in employee account.

Key events create in-app notifications:

- Employee registrations send a receipt to the applicant and notify active admins. Approval, rejection, and revocation send the corresponding email to the employee and notify admins.
- Attendance clock-in and clock-out, guest check-ins, and new leave or early-leave requests notify active admins. Leave applicants also receive a submission confirmation.
- Guest assignment or reassignment notifies the assigned employee and admins. A previously assigned employee is also notified when the assignment changes.
- Guest status updates notify admins.
- Leave decisions, early-leave decisions, employee approval changes, and admin employee-profile changes notify the affected employee and admins.

## Configure the sender mailbox

An admin can configure one sender mailbox from **System Settings → Notification email sender**. The mailbox must be authorized to send through the selected SMTP server. Notification recipients continue to use their email addresses saved in their employee accounts.

For Gmail or another password-based SMTP provider, configure the provider's host and port. Gmail uses `smtp.gmail.com`, port `465` with implicit TLS enabled or port `587` with implicit TLS disabled. Gmail requires an app password when SMTP app-password access is available; do not enter the normal Google account password.

For a personal Outlook.com or Hotmail mailbox, select **Outlook.com / Hotmail (OAuth2)**. This uses `smtp-mail.outlook.com` on port `587` with STARTTLS and does not use a mailbox password. Microsoft Basic Authentication errors cannot be fixed by changing the SMTP password.

### Set up Outlook.com / Hotmail OAuth2

1. Register an application in Microsoft Entra that supports personal Microsoft accounts.
2. Enable the app's public-client/device-code flow and add the delegated `SMTP.Send` permission for Outlook.
3. Set the application's client ID as `MICROSOFT_OAUTH_CLIENT_ID` in the backend environment. This is an application ID, not a password; do not put it in frontend configuration.
4. Ensure `SMTP_CREDENTIALS_ENCRYPTION_KEY` is configured on the backend, then restart it.
5. In **System Settings → Notification email sender**, choose Outlook, enter the same Outlook address as the SMTP username and sender address, and save.
6. Select **Connect Outlook**, complete Microsoft's device sign-in with that same account, and approve access. The app encrypts the returned refresh token before storing it.

The app does not need a Microsoft client secret for device-code sign-in. If the Microsoft account has SMTP AUTH disabled, SMTP OAuth2 may still be unavailable; enable SMTP AUTH for that mailbox if Microsoft permits it.

SMTP passwords and Outlook refresh tokens are encrypted with AES-256-GCM before they are stored in MySQL. Before saving sender settings, add `SMTP_CREDENTIALS_ENCRYPTION_KEY` to the backend host's environment. Generate a 32-byte key encoded as Base64 with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep that value secret and unchanged across deployments. If it is lost or replaced, saved SMTP credentials and Outlook authorization cannot be decrypted; reconfigure the sender and reconnect Outlook.

After saving, **Send test email** sends a test to the signed-in admin's registered email address. SMTP failures are logged and do not undo attendance, leave, or assignment actions. The optional `NOTIFICATION_APP_URL` environment variable adds a direct link to notification emails.

The previous `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `NOTIFICATION_FROM_EMAIL` environment variables remain supported as a fallback if no admin-managed sender has been saved.

## Database and Render deployment

Notification storage is created by migrations `013_create_notifications.js`, `014_create_notification_email_settings.js`, `015_add_employee_approval_status.js`, and `016_add_outlook_oauth_settings.js`. In the Render backend service, set the **Start Command** to:

```text
npm start
```

The backend's `start` script runs `node db/migrate.js` before starting the API. Keep SMTP credentials, OAuth refresh tokens, and `SMTP_CREDENTIALS_ENCRYPTION_KEY` out of source control and frontend configuration.
