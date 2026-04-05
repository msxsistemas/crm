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
// Get errors from AFTER the last successful deploy (23:52)
await ssh(`pm2 logs msxcrm-backend --lines 50 --nostream 2>&1 | grep -E '"level":50|Error|error' | grep -v DeprecationWarning | grep '2026-04-04T23:5[2-9]\|2026-04-05' | head -20`);
