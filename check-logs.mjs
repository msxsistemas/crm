import { Client } from 'ssh2';
const VPS = { host: '185.139.1.201', port: 22, username: 'root', password: '87066690M@aa' };
function ssh(cmd) {
  return new Promise((res, rej) => {
    const conn = new Client();
    conn.on('ready', () => conn.exec(cmd, (err, stream) => {
      if (err) return rej(err);
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', () => { conn.end(); res(); });
    }));
    conn.on('error', rej);
    conn.connect(VPS);
  });
}
await ssh(`pm2 logs msxcrm-backend --lines 30 --nostream 2>&1 | grep -A3 "auto-distribution\\|Error\\|error" | head -40`);
