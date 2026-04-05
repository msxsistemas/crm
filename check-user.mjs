import { Client } from 'ssh2';
const VPS = { host: '185.139.1.201', port: 22, username: 'root', password: '87066690M@aa' };

function ssh(commands) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      let i = 0;
      function next() {
        if (i >= commands.length) { conn.end(); resolve(); return; }
        const cmd = commands[i++];
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

const DB = 'PGPASSWORD="msxcrm2026Secure!" psql -U msxcrm -d msxcrm -h localhost';

await ssh([
  `${DB} -c "SELECT id, email, full_name, role, status, created_at FROM profiles WHERE email ILIKE '%planostreaming25%';"`,
  // Also test login via API
  `curl -sf -X POST https://api.msxzap.pro/auth/login -H 'Content-Type: application/json' -d '{"email":"planostreaming25@gmail.com","password":"87066690"}' 2>&1 | head -c 300`,
]);
