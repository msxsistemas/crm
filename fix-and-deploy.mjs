import { Client } from 'ssh2';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VPS = { host: '185.139.1.201', port: 22, username: 'root', password: '87066690M@aa' };

function ssh(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      console.log(`  ▶ ${cmd.substring(0, 120)}`);
      conn.exec(cmd, (err, stream) => {
        if (err) { reject(err); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', () => { conn.end(); resolve(); });
      });
    });
    conn.on('error', reject);
    conn.connect(VPS);
  });
}

function scpDir(localDir, remoteDir) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp(async (err, sftp) => {
        if (err) { reject(err); return; }
        async function uploadDir(localPath, remotePath) {
          await new Promise(r => sftp.mkdir(remotePath, () => r()));
          const items = readdirSync(localPath, { withFileTypes: true });
          for (const item of items) {
            if (item.name === 'node_modules' || item.name === '.git') continue;
            const lp = join(localPath, item.name);
            const rp = `${remotePath}/${item.name}`;
            if (item.isDirectory()) {
              await uploadDir(lp, rp);
            } else {
              const content = readFileSync(lp);
              await new Promise((res, rej) => {
                const ws = sftp.createWriteStream(rp);
                ws.on('close', res);
                ws.on('error', rej);
                ws.write(content);
                ws.end();
              });
              process.stdout.write('.');
            }
          }
        }
        await uploadDir(localDir, remoteDir);
        conn.end();
        console.log('');
        resolve();
      });
    });
    conn.on('error', reject);
    conn.connect(VPS);
  });
}

async function main() {
  console.log('\n🔧 1. Rodando migration: adicionando coluna respect_queues...');
  await ssh(`psql -U msxcrm msxcrm -c "ALTER TABLE auto_distribution_config ADD COLUMN IF NOT EXISTS respect_queues boolean NOT NULL DEFAULT false;" 2>&1`);
  console.log('✅ Migration OK\n');

  console.log('📁 2. Enviando arquivos do backend...');
  await scpDir(join(__dirname, 'backend/src'), '/var/www/msxcrm/backend/src');
  console.log('✓ Arquivos enviados\n');

  console.log('🔄 3. Reiniciando backend...');
  await ssh('pm2 restart msxcrm-backend && sleep 3 && curl -sf http://localhost:3000/health | head -c 200 || echo "health check falhou"');
  console.log('\n✅ Deploy completo!\n');

  console.log('📋 4. Verificando logs...');
  await ssh('pm2 logs msxcrm-backend --lines 10 --nostream 2>&1');
}

main().catch(console.error);
