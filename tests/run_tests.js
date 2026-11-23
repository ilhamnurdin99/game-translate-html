/* (v3.4.7) Pelari tes (F18) — dulu tidak ada runner: tiap berkas tes
   dijalankan manual satu per satu. Sekarang: node tests/run_tests.js
   (atau: npm test) menjalankan semua tests/test_*.js, mencetak satu
   baris ringkasan per berkas, lalu keluar 1 bila ada satu saja yang
   gagal/rusak/timeout. Tiap berkas tes tetap bisa dijalankan sendiri:
   node tests/test_v347_small.js */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter((f) => /^test_.*\.js$/.test(f) && f !== 'run_tests.js')
  .sort()
  .map((f) => path.join(dir, f));
let totalPass = 0, totalFail = 0, crashed = [];
console.log('Menjalankan ' + files.length + ' berkas tes…\n');
for (const file of files) {
  const name = path.basename(file);
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.trim().split('\n').filter(Boolean);
  const summary = lines.length ? lines[lines.length - 1] : '(tanpa output)';
  const m = /(\d+) PASS, (\d+) FAIL/.exec(summary);
  if (m) { totalPass += Number(m[1]); totalFail += Number(m[2]); }
  const ok = r.status === 0 && r.error === undefined && m && Number(m[2]) === 0;
  console.log((ok ? 'OK   ' : 'GAGAL') + ' ' + name + ' — ' + summary);
  if (!ok) {
    crashed.push(name);
    if (r.error) console.log('       ' + String(r.error.message || r.error));
    if (r.status !== 0 && r.status !== null) console.log('       keluar dengan kode ' + r.status);
  }
}
console.log('\nRUN_TESTS: ' + files.length + ' berkas, ' + totalPass + ' PASS, ' + totalFail + ' FAIL' + (crashed.length ? ' — gagal: ' + crashed.join(', ') : ''));
process.exit(crashed.length ? 1 : 0);
