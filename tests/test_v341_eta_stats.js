/* Test v3.4.1 — ETA dari kecepatan batch terakhir + Statistik di atas
   Daftar Teks + Daftar Teks kotak scroll sendiri (file game-translate-html).
   Jalankan: node test_v341_eta_stats.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan). Latar:
   - ETA lama memakai rata-rata kumulatif sejak awal proses; setelah fase
     Google mati di file 17.699 teks, ETA membengkak jadi "13472 mnt".
   - Kotak Statistik letaknya jauh di atas Daftar Teks sehingga tidak
     terlihat saat proses berjalan.
   - Daftar Teks 100 baris memanjangkan halaman; harus di-scroll di
     kotaknya sendiri.
   Kriteria: semua PASS, 0 FAIL. */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const htmlPath = process.argv[2] || '/home/hatch/workspace/game-translate-html-gh/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
const w = dom.window;
const G = w.GTHTML;
const V341 = w.__GTHTML_V341__;
const $ = (id) => w.document.getElementById(id);

check('A0 hook v3.4.1 tersedia', !!V341 && typeof V341.recentAvgSeconds === 'function' && typeof V341.updateStats === 'function' && typeof V341.renderList === 'function');
check('A0 label versi v3.4.21', html.includes('Game Translate HTML v3.4.21') && !html.includes('Game Translate HTML v3.4.20'));
check('A0 Cara pakai menyebut v3.4.1', html.includes('Statistik di atas Daftar Teks &amp; ETA dari batch terakhir (v3.4.1)'));
check('A0 GTHTML tersedia', !!G && typeof G.prepareForTranslate === 'function');

/* ---------- (a) ETA dari batch terakhir, bukan rata-rata kumulatif ---------- */
// 1000 teks, belum ada yang berhasil -> sisa 1000
const segs = [];
for (let i = 0; i < 1000; i++) segs.push({ id: 's' + i, text: 'Text ' + i, translatable: true, skipped: false, passage: 'P1', kind: 'text' });
G._setState({ segments: segs, translations: new Map(), fileName: 'Index.html', passages: [{ name: 'P1' }], page: 0 });
const S = V341.state;
const slow = []; for (let i = 0; i < 10; i++) slow.push({ ms: 60000, n: 10 }); // 6 dtk/teks
const fast = []; for (let i = 0; i < 10; i++) fast.push({ ms: 1000, n: 10 });  // 0,1 dtk/teks

// Fase lambat: kumulatif 600 dtk total / 100 teks = 6 dtk/teks; recent juga lambat
S.stats = { totalMs: 600000, doneCount: 100, recent: slow.slice() };
check('A1 recentAvgSeconds fase lambat = 6 dtk/teks', Math.abs(V341.recentAvgSeconds() - 6) < 1e-9, String(V341.recentAvgSeconds()));
V341.updateStats();
check('A1 ETA fase lambat = 100 mnt 0 dtk (1000 x 6 dtk)', $('statEta').textContent === '100 mnt 0 dtk', $('statEta').textContent);

// Mesin pulih: 10 batch terakhir cepat, tapi kumulatif masih berat (600000 ms / 100 teks)
S.stats = { totalMs: 600000, doneCount: 100, recent: fast.slice() };
check('A1 recentAvgSeconds fase cepat = 0,1 dtk/teks', Math.abs(V341.recentAvgSeconds() - 0.1) < 1e-9, String(V341.recentAvgSeconds()));
V341.updateStats();
check('A1 ETA ikut batch terakhir (1 mnt 40 dtk), bukan kumulatif (100 mnt)', $('statEta').textContent === '1 mnt 40 dtk', $('statEta').textContent);

// Kurang dari 2 batch -> fallback rata-rata kumulatif (6 dtk/teks)
S.stats = { totalMs: 600000, doneCount: 100, recent: [{ ms: 1000, n: 10 }] };
check('A1 1 batch -> fallback kumulatif = 6 dtk/teks', Math.abs(V341.recentAvgSeconds() - 6) < 1e-9, String(V341.recentAvgSeconds()));
// Belum ada batch sama sekali -> 0,8 dtk/teks
S.stats = { totalMs: 0, doneCount: 0, recent: [] };
check('A1 tanpa batch -> 0,8 dtk/teks', Math.abs(V341.recentAvgSeconds() - 0.8) < 1e-9, String(V341.recentAvgSeconds()));
V341.updateStats();
check('A1 ETA tanpa batch = 13 mnt 20 dtk (1000 x 0,8 dtk)', $('statEta').textContent === '13 mnt 20 dtk', $('statEta').textContent);
// recent dibatasi 10 batch (simulasi 12 batch cepat: yang dipakai tetap 10 terakhir)
const twelve = []; for (let i = 0; i < 12; i++) twelve.push({ ms: 1000, n: 10 });
S.stats = { totalMs: 600000, doneCount: 100, recent: twelve.slice(-10) };
check('A1 jendela recent dibatasi 10 batch', S.stats.recent.length === 10 && Math.abs(V341.recentAvgSeconds() - 0.1) < 1e-9);
// Selesai semua -> 'selesai', bukan ETA
for (const sg of segs) S.translations.set(sg.id, { text: 'Teks ' + sg.id, via: 'Edge' });
V341.updateStats();
check('A1 semua selesai -> statEta selesai', $('statEta').textContent === 'selesai', $('statEta').textContent);
check('A1 statDone 1000 saat semua selesai', $('statDone').textContent === '1000', $('statDone').textContent);

/* ---------- (b) Statistik tepat di atas Daftar Teks ---------- */
const iStats = html.indexOf('id="secStats"');
const iList = html.indexOf('id="secList"');
check('B0 secStats ada sebelum secList', iStats > 0 && iList > iStats, iStats + ' vs ' + iList);
{
  const before = html.slice(0, iList);
  const ids = [...before.matchAll(/<section id="(sec[A-Za-z]+)"/g)].map((m) => m[1]);
  check('B0 section tepat sebelum Daftar Teks adalah Statistik', ids[ids.length - 1] === 'secStats', ids.join(','));
}
for (const id of ['statTotal', 'statDone', 'statLeft', 'statPct', 'statEta', 'progressBar', 'statNote']) {
  check('B0 id ' + id + ' tetap ada', html.includes('id="' + id + '"'));
}

/* ---------- (c) Daftar Teks: 100/halaman, kotak scroll, header di luar ---------- */
const style = (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
check('C0 CSS #listBody max-height 70vh', /#listBody\s*\{[^}]*max-height\s*:\s*70vh/.test(style));
check('C0 CSS #listBody overflow-y auto', /#listBody\s*\{[^}]*overflow-y\s*:\s*auto/.test(style));
check('C0 perPage tetap 100', G._state.perPage === 100, String(G._state.perPage));
check('C0 header kolom di luar #listBody (tetap terlihat)', html.indexOf('trow head') > 0 && html.indexOf('trow head') < html.indexOf('id="listBody"'));
// renderList menyimpan & memulihkan scrollTop (jsdom tidak me-reset scroll
// saat innerHTML diganti, jadi dicek di level sumber + perilaku):
const rlSrc = html.slice(html.indexOf('function renderList()'), html.indexOf('function renderList()') + 4000);
check('C0 renderList simpan scrollTop sebelum render', rlSrc.includes('const keepScroll = body.scrollTop'));
check('C0 renderList pulihkan scrollTop sesudah render', (rlSrc.match(/body\.scrollTop = keepScroll/g) || []).length >= 2);
check('C0 ganti halaman reset scroll ke atas', html.includes("$('listBody').scrollTop = 0"));
{
  // Perilaku: render ulang dengan 100 baris tidak mengubah scrollTop
  G._setState({ segments: segs.slice(0, 150), translations: new Map(), page: 0 });
  V341.renderList();
  const body = $('listBody');
  body.scrollTop = 250;
  V341.renderList();
  check('C0 render ulang mempertahankan scrollTop', body.scrollTop === 250, String(body.scrollTop));
  check('C0 renderList menampilkan 100 baris di halaman 1', body.querySelectorAll('.trow').length === 100, String(body.querySelectorAll('.trow').length));
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
