const fs = require('fs');
const path = require('path');
const { strFromU8, unzipSync } = require('fflate');

const DATA_URL = 'https://download.geonames.org/export/dump/cities1000.zip';
const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIRECTORY, 'cities1000.txt');

function hasLocalityData() {
  try {
    const stats = fs.statSync(DATA_FILE);
    return stats.isFile() && stats.size > 0;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function downloadLocalities() {
  if (hasLocalityData()) {
    console.log('GeoNames locality dataset is already installed.');
    return;
  }

  console.log('Downloading the GeoNames cities1000 dataset...');
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`GeoNames download failed with HTTP ${response.status}`);
  }

  const archive = new Uint8Array(await response.arrayBuffer());
  const files = unzipSync(archive);
  const entry = files['cities1000.txt'];
  if (!entry || !entry.length) {
    throw new Error('The GeoNames archive did not contain cities1000.txt.');
  }

  const contents = strFromU8(entry);
  const recordCount = contents.split(/\r?\n/).filter(Boolean).length;
  if (!recordCount) {
    throw new Error('The downloaded GeoNames locality dataset is empty.');
  }

  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, contents, 'utf8');
  fs.renameSync(temporaryFile, DATA_FILE);
  console.log(`Installed ${recordCount} GeoNames locality records.`);
}

if (require.main === module) {
  downloadLocalities().catch((error) => {
    console.error('Unable to install the GeoNames locality dataset:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { downloadLocalities, hasLocalityData };
