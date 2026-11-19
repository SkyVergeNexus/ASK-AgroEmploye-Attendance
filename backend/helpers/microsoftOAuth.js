const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SMTP_SCOPE = 'offline_access https://outlook.office.com/SMTP.Send';

async function postForm(url, values) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  return { response, data };
}

function microsoftError(data, fallback) {
  const error = new Error(fallback);
  error.code = data.error || 'MICROSOFT_OAUTH_ERROR';
  return error;
}

async function startDeviceCode(clientId) {
  const { response, data } = await postForm(`${AUTHORITY}/devicecode`, {
    client_id: clientId,
    scope: SMTP_SCOPE,
  });
  if (!response.ok) {
    throw microsoftError(data, 'Unable to start Microsoft sign-in.');
  }
  return data;
}

async function pollDeviceCode(clientId, deviceCode) {
  const { response, data } = await postForm(`${AUTHORITY}/token`, {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: clientId,
    device_code: deviceCode,
  });

  if (data.error === 'authorization_pending') {
    return { status: 'pending' };
  }
  if (data.error === 'slow_down') {
    return { status: 'pending', slowDown: true };
  }
  if (!response.ok) {
    throw microsoftError(data, 'Microsoft sign-in was not completed.');
  }
  if (!data.refresh_token) {
    throw new Error('Microsoft did not return a refresh token. Reconnect and approve offline access.');
  }
  return { status: 'authorized', refreshToken: data.refresh_token };
}

async function refreshAccessToken(clientId, refreshToken) {
  const { response, data } = await postForm(`${AUTHORITY}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    scope: SMTP_SCOPE,
  });
  if (!response.ok || !data.access_token) {
    throw microsoftError(data, 'Unable to refresh the Microsoft mail authorization.');
  }
  return {
    accessToken: data.access_token,
    expires: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    refreshToken: data.refresh_token || refreshToken,
  };
}

module.exports = {
  pollDeviceCode,
  refreshAccessToken,
  startDeviceCode,
};
