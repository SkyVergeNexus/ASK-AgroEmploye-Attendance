require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function getApplied(db) {
  const [rows] = await db.query('SELECT filename FROM _migrations');
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(db, filename) {
  console.log(`\n→ Applying ${filename}`);
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const mod = require(filepath);

  await db.beginTransaction();
  try {
    await mod.up(db);
    await db.query('INSERT INTO _migrations (filename) VALUES (?)', [filename]);
    await db.commit();
    console.log(`  ✓ ${filename} applied`);
  } catch (err) {
    await db.rollback();
    console.error(`  ✗ ${filename} failed:`, err.message);
    throw err;
  }
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
    multipleStatements: false,
  });

  console.log(`Connected to ${process.env.DB_HOST} / ${process.env.DB_NAME}`);

  await ensureMigrationsTable(db);
  const applied = await getApplied(db);

  const all = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();

  const pending = all.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('No pending migrations ✅');
    await db.end();
    return;
  }

  console.log(`Pending: ${pending.join(', ')}`);

  for (const filename of pending) {
    await applyMigration(db, filename);
  }

  await db.end();
  console.log(`\n✅ All migrations applied (${pending.length})`);
}

main().catch((err) => {
  console.error('\nMIGRATE FAILED:', err.message);
  process.exit(1);
});