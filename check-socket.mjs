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
        console.log(`  ▶ ${cmd}`);
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

await ssh([
  // Check if socket.io endpoint responds (polling fallback)
  'curl -sf "http://localhost:3000/socket.io/?EIO=4&transport=polling" | head -c 100 || echo "socket.io nao respondeu"',
  // Check PM2 logs for socket.io errors
  'pm2 logs msxcrm-backend --lines 20 --nostream 2>&1 | tail -25',
]);
