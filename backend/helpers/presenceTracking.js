const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const MAX_HEARTBEAT_AGE_MS = HEARTBEAT_INTERVAL_MS * 3;
const REQUIRED_OUTSIDE_SAMPLES = 2;

function determinePresence({
  enforceLocation,
  enforceNetwork,
  gpsInside,
  networkInside,
}) {
  const checks = [];
  if (enforceLocation) checks.push(gpsInside);
  if (enforceNetwork) checks.push(networkInside);
  if (!checks.length) return 'unknown';
  if (checks.some((inside) => inside === true)) return 'inside';
  if (checks.every((inside) => inside === false)) return 'outside';
  return 'unknown';
}

module.exports = {
  HEARTBEAT_INTERVAL_MS,
  MAX_HEARTBEAT_AGE_MS,
  REQUIRED_OUTSIDE_SAMPLES,
  determinePresence,
};
