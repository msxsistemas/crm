import { Client } from 'ssh2';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VPS = { host: '185.139.1.201', port: 22, username: 'root', password: '87066690M@aa' };

function ssh(commands) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      let i = 0;
      function next() {
        if (i >= commands.length) { conn.end(); resolve(); return; }
        const cmd = commands[i++];
        console.log(`  ▶ ${cmd.substring(0, 120)}`);
        conn.exec(cmd, (err, stream) => {
          if (err) { reject(err); return; }
          stream.on('data', d => process.stdout.write(d.toString()));
          stream.stderr.on('data', d => process.stderr.write(d.toString()));
          stream.on('close', next);
        });
      }
      next();
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
        let count = 0;
        async function uploadDir(localPath, remotePath) {
          await new Promise(r => sftp.mkdir(remotePath, () => r()));
          const items = readdirSync(localPath, { withFileTypes: true });
          for (const item of items) {
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
              count++;
              process.stdout.write('.');
            }
          }
        }
        await uploadDir(localDir, remoteDir);
        conn.end();
        console.log(`\n✓ ${count} arquivos enviados`);
        resolve();
      });
    });
    conn.on('error', reject);
    conn.connect(VPS);
  });
}

async function main() {
  console.log('\n🚀 Fazendo deploy do frontend...\n');

  // Clear old frontend and upload new build
  await ssh(['rm -rf /var/www/msxcrm/frontend && mkdir -p /var/www/msxcrm/frontend']);

  console.log('📁 Enviando dist/...');
  await scpDir(join(__dirname, 'dist'), '/var/www/msxcrm/frontend');

  await ssh(['ls /var/www/msxcrm/frontend | head -5']);

  console.log('\n✅ Frontend deploy concluído!\n');
}

main().catch(console.error);
