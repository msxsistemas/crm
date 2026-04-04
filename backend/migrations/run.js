import { readdirSync, readFileSync } from 'fs';
import { pool } from '../src/database.js';
import 'dotenv/config';

const dir = new URL('.', import.meta.url);
const files = readdirSync(dir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const sql = readFileSync(new URL(file, dir), 'utf8');
  try {
    await pool.query(sql);
    console.log(`✅ ${file}`);
  } catch (e) {
    console.error(`❌ ${file}: ${e.message}`);
  }
}

await pool.end();
