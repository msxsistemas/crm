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
  'nginx -t && nginx -s reload',
]);
console.log('\n✅ Nginx recarregado!\n');
