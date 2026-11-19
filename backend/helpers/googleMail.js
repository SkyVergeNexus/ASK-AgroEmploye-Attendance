const GOOGLE_SCOPE = 'openid email https://www.googleapis.com/auth/gmail.send';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth client ID, client secret, and redirect URI must be configured.');
  }
  return { clientId, clientSecret, redirectUri };
}

function isGoogleOAuthConfigured() {
  try {
    getGoogleOAuthConfig();
    return true;
  } catch {
    return false;
  }
}

function buildGoogleAuthorizationUrl(config, state) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString();
  return url.toString();
}

async function postTokenForm(values) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Google OAuth token request failed.');
    error.code = data.error || 'GOOGLE_OAUTH_ERROR';
    throw error;
  }
  return data;
}

async function exchangeAuthorizationCode(config, code) {
  const data = await postTokenForm({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

async function getGoogleAccount(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = new Error('Unable to verify the authorized Google account.');
    error.code = `GOOGLE_USERINFO_${response.status}`;
    throw error;
  }
  return response.json();
}

async function refreshGoogleAccessToken(config, refreshToken) {
  const data = await postTokenForm({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
  };
}

function encodeMimeMessage({ from, to, subject, text }) {
  if (!EMAIL_PATTERN.test(from) || !EMAIL_PATTERN.test(to)) {
    throw new Error('A valid sender and recipient email address are required.');
  }
  const encodedSubject = Buffer.from(String(subject), 'utf8').toString('base64');
  const encodedText = Buffer.from(String(text), 'utf8')
    .toString('base64')
    .match(/.{1,76}/g)
    ?.join('\r\n') || '';
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedText,
  ].join('\r\n');
  return Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendGmailMessage(config, { to, subject, text }) {
  const raw = encodeMimeMessage({
    from: config.fromEmail,
    to,
    subject,
    text,
  });
  const response = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error?.message || `Gmail API returned HTTP ${response.status}.`);
    error.code = `GMAIL_API_HTTP_${response.status}`;
    throw error;
  }
}

module.exports = {
  buildGoogleAuthorizationUrl,
  exchangeAuthorizationCode,
  getGoogleAccount,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  refreshGoogleAccessToken,
  sendGmailMessage,
};
