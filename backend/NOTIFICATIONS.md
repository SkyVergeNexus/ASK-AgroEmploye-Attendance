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

For Gmail, use `smtp.gmail.com`, port `465` with implicit TLS enabled or port `587` with implicit TLS disabled. Gmail requires an app password when SMTP app-password access is available; do not enter the normal Google account password. Other providers may use different host, port, authentication, or security requirements.

If the backend host cannot reach Gmail's SMTP ports, select **Gmail API (OAuth2)** in the sender settings. It sends through Google's HTTPS API on port 443 while keeping the same Gmail mailbox as the sender.

### Set up Gmail API / OAuth2

1. In Google Cloud Console, create a project, enable the Gmail API, and configure the OAuth consent screen with the `gmail.send`, `openid`, and `email` scopes.
2. Create an OAuth client ID for a **Web application** and add the backend callback URI as an authorized redirect URI:
   - Production: `https://ask-attendance-api.onrender.com/api/email-settings/google/callback`
   - Local: `http://localhost:5000/api/email-settings/google/callback`
3. Add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` to the backend environment. Set the redirect URI to the exact registered URL. Keep the client secret out of the frontend and source control.
4. Ensure `SMTP_CREDENTIALS_ENCRYPTION_KEY` is configured on the backend, then restart it.
5. In **System Settings → Notification email sender**, choose **Gmail API (OAuth2)**, enter the Gmail sender address, and save.
6. Select **Connect Gmail**, sign in to that same account, approve access, and use **Send test email**.

Google's OAuth consent configuration may require verification before production use. Apps left in testing mode can have refresh tokens expire, so complete Google's publishing/verification requirements for ongoing production delivery.

SMTP passwords and Gmail refresh tokens are encrypted with AES-256-GCM before they are stored in MySQL. Before saving sender settings, add `SMTP_CREDENTIALS_ENCRYPTION_KEY` to the backend host's environment. Generate a 32-byte key encoded as Base64 with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep that value secret and unchanged across deployments. If it is lost or replaced, saved mail credentials cannot be decrypted; re-enter the SMTP password or reconnect Gmail API with a new key.

After saving and connecting, **Send test email** sends a test to the signed-in admin's registered email address. Email delivery failures are logged and do not undo attendance, leave, or assignment actions. The optional `NOTIFICATION_APP_URL` environment variable adds a direct link to notification emails.

The previous `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `NOTIFICATION_FROM_EMAIL` environment variables remain supported as a fallback if no admin-managed sender has been saved.

## Database and Render deployment

Notification and sender storage is managed by migrations `013_create_notifications.js`, `014_create_notification_email_settings.js`, `015_add_employee_approval_status.js`, `017_remove_unused_sender_auth_fields.js`, and `018_add_gmail_api_sender.js`. Migration `016_add_outlook_oauth_settings.js` is retained for migration history; migration 017 cleans up its unused fields. In the Render backend service, set the **Start Command** to:

```text
npm start
```

The backend's `start` script runs `node db/migrate.js` before starting the API. Keep SMTP credentials, Google OAuth credentials, refresh tokens, and `SMTP_CREDENTIALS_ENCRYPTION_KEY` out of source control and frontend configuration.
