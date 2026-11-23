const COMPANY_EMAIL_DOMAIN = 'angelcommoditiesltd.org';

function normalizeCompanyEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[a-z0-9._%+-]+@angelcommoditiesltd\.org$/.test(email)
    ? email
    : null;
}

module.exports = { COMPANY_EMAIL_DOMAIN, normalizeCompanyEmail };
