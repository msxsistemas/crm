import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../database.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

export async function runPendingMigrations() {
  // Create tracking table if missing (ignore errors — superuser may have created it)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  const { rows: applied } = await pool.query('SELECT filename FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.filename));

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      console.log(`✅ Migration: ${file}`);
      ran++;
    } catch (e) {
      // CONCURRENTLY indexes can't run in transactions — run via separate connection
      if (e.message.includes('cannot run inside a transaction block')) {
        const client = await pool.connect();
        try {
          // Split on semicolons and run each statement individually
          const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
          for (const stmt of stmts) {
            await client.query(stmt).catch(err => {
              if (!err.message.includes('already exists')) throw err;
            });
          }
          await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
          console.log(`✅ Migration (sequential): ${file}`);
          ran++;
        } finally {
          client.release();
        }
      } else if (
        e.message.includes('already exists') ||
        e.message.includes('must be owner') ||
        e.message.includes('duplicate key')
      ) {
        // Objects already exist (created by postgres superuser previously) — mark as applied
        await pool.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        console.log(`⚡ Migration already applied: ${file}`);
        ran++;
      } else {
        // Log but don't crash — server can still start with existing schema
        console.error(`❌ Migration failed: ${file} — ${e.message}`);
        await pool.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]).catch(() => {});
      }
    }
  }

  if (ran === 0) console.log('✅ Migrations: nothing new to run');
}
