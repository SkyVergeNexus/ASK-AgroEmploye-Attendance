require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { requireR2Config, uploadExistingFile } = require('../helpers/imageStorage');

const uploadDir = path.join(__dirname, '..', 'uploads');

function getLocalFilename(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/^\/uploads\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function main() {
  requireR2Config();

  const [employees] = await pool.query(
    "SELECT id, profile_picture AS image_url FROM employees WHERE profile_picture LIKE '/uploads/%'"
  );
  const [settings] = await pool.query(
    "SELECT id, login_cover_url AS image_url FROM settings WHERE login_cover_url LIKE '/uploads/%'"
  );
  const [attendance] = await pool.query(
    "SELECT id, remote_selfie AS image_url FROM attendance WHERE remote_selfie LIKE '/uploads/%'"
  );

  const references = [
    ...employees.map((row) => ({ ...row, table: 'employees', column: 'profile_picture' })),
    ...settings.map((row) => ({ ...row, table: 'settings', column: 'login_cover_url' })),
    ...attendance.map((row) => ({ ...row, table: 'attendance', column: 'remote_selfie' })),
  ];
  const migratedUrls = new Map();
  const missingFiles = [];
  let migratedCount = 0;

  for (const reference of references) {
    const filename = getLocalFilename(reference.image_url);
    if (!filename) continue;

    const filePath = path.join(uploadDir, path.basename(filename));
    if (!fs.existsSync(filePath)) {
      missingFiles.push(`${reference.table} #${reference.id}: ${filename}`);
      continue;
    }

    let publicUrl = migratedUrls.get(filename);
    if (!publicUrl) {
      const contentType = filename.match(/\.png$/i)
        ? 'image/png'
        : filename.match(/\.webp$/i)
          ? 'image/webp'
          : 'image/jpeg';
      publicUrl = await uploadExistingFile(filePath, filename, contentType);
      migratedUrls.set(filename, publicUrl);
    }

    const sql = `UPDATE ${reference.table} SET ${reference.column} = ? WHERE id = ? AND ${reference.column} = ?`;
    await pool.query(sql, [publicUrl, reference.id, reference.image_url]);
    migratedCount += 1;
    console.log(`Migrated ${reference.table} #${reference.id}`);
  }

  console.log(`\nMigrated ${migratedCount} image reference(s).`);
  if (missingFiles.length) {
    console.error('Local files not found; those references were left unchanged:');
    missingFiles.forEach((file) => console.error(`- ${file}`));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('Image migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
