import { readFileSync } from 'fs';
import { pool } from '../src/database.js';
import 'dotenv/config';

const sql = readFileSync(new URL('./001_initial.sql', import.meta.url), 'utf8');

try {
  await pool.query(sql);
  console.log('✅ Migrations executadas com sucesso!');
} catch (e) {
  console.error('❌ Erro nas migrations:', e.message);
} finally {
  await pool.end();
}
