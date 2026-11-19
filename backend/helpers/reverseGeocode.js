const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'cities1000.txt');
const EARTH_RADIUS_KM = 6371;

let localities;

function loadLocalities() {
  if (localities) return localities;

  let contents;
  try {
    contents = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      const missingDataError = new Error(
        'Nearest-locality data is unavailable. The backend downloads it automatically on startup; check the backend logs or run "npm run download:localities" from the backend directory.'
      );
      missingDataError.code = 'LOCALITY_DATA_MISSING';
      throw missingDataError;
    }
    throw error;
  }

  localities = contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const fields = line.split('\t');
      const latitude = Number(fields[4]);
      const longitude = Number(fields[5]);

      if (!fields[1] || !fields[8] || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      const latitudeRadians = (latitude * Math.PI) / 180;
      return {
        name: fields[1],
        countryCode: fields[8],
        latitudeRadians,
        longitudeRadians: (longitude * Math.PI) / 180,
        cosineLatitude: Math.cos(latitudeRadians),
      };
    })
    .filter(Boolean);

  if (!localities.length) {
    localities = null;
    throw new Error('Nearest-locality data is empty or invalid.');
  }

  return localities;
}

function nearestLocality(latitude, longitude) {
  const places = loadLocalities();
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const cosineLatitude = Math.cos(latitudeRadians);
  let nearest = null;
  let nearestDistance = Infinity;

  for (const place of places) {
    const latitudeDelta = place.latitudeRadians - latitudeRadians;
    const longitudeDelta = place.longitudeRadians - longitudeRadians;
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      cosineLatitude * place.cosineLatitude * Math.sin(longitudeDelta / 2) ** 2;
    const distance = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = place;
    }
  }

  if (!nearest) return null;

  return {
    name: nearest.name,
    countryCode: nearest.countryCode,
    distanceKm: Math.round(nearestDistance * 10) / 10,
  };
}

module.exports = { nearestLocality };
