/* Test v3.1 — Pemutus sirkuit + mesin cadangan (file game-translate-html).
   Jalankan: node test_v31_fallback.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan), lalu menguji
   rantai mesin dengan fetch + Translator global yang di-mock:
   pemutus sirkuit Google, Google Dict, Translator bawaan Chrome,
   retry 429, 401 custom, dan batch 10. */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const htmlPath = process.argv[2] || '/home/hatch/workspace/game-translate-html-gh/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
const w = dom.window;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const V = w.__GTHTML_V31__;
check('A0 hook v3.1 tersedia', !!V && typeof V.translateBatch === 'function' && typeof V.translateSegments === 'function'
  && typeof V.googleDictBatch === 'function' && typeof V.parseDictResponse === 'function'
  && typeof V.builtinBatch === 'function' && typeof V.isRetryable === 'function'
  && typeof V.resetCircuitBreaker === 'function');
check('A0 label versi v3.4.6', html.includes('Game Translate HTML v3.4.6') && !html.includes('Game Translate HTML v3.4.5'));
check('A0 Cara pakai menyebut pemutus sirkuit v3.1', html.includes('Pemutus sirkuit') && html.includes('(v3.1)'));
check('A0 BATCH = 10', /const BATCH = 10;/.test(html));
check('A0 ceklis Pilih semua skip-passage ada', html.includes('id="skipAll"') && html.includes('id="skipAllCount"') && html.includes('Pilih semua'));

/* ---------- mock fetch + Translator ---------- */
const calls = { google: 0, marker: 0, dict: 0, edge: 0, mymemory: 0, custom: 0 };
function resetCalls() { for (const k of Object.keys(calls)) calls[k] = 0; }
let mode = 'google-ok';
let google429left = 0;
const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
w.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('clients5.google.com')) {
    calls.dict++;
    if (mode === 'all-fail' || mode === 'dict-fail') return errRes(500);
    const qs = new URL(u).searchParams.getAll('q');
    return okRes(qs.map((t) => 'ID:' + t));
  }
  if (u.includes('translate.googleapis.com')) {
    const qs = new URL(u).searchParams.getAll('q');
    if (qs.length === 1 && qs[0].includes('ZXQSEP')) {
      calls.marker++;
      if (mode === 'google-null' || mode === 'all-fail') return okRes([[['teks tanpa marker']]]);
      return okRes([[['x ' + qs[0] + ' y']]]);
    }
    calls.google++;
    if (mode === 'google-429') {
      if (google429left > 0) { google429left--; return errRes(429); }
      return okRes([qs.map((t) => [['ID:' + t]])]);
    }
    if (mode === 'google-null' || mode === 'all-fail') return okRes([qs.map(() => [])]);
    return okRes([qs.map((t) => [['ID:' + t]])]);
  }
  if (u.includes('edge.microsoft.com')) {
    calls.edge++;
    if (mode === 'all-fail' || mode === 'edge-fail') return errRes(500);
    const texts = JSON.parse(opts.body);
    return okRes(texts.map((t) => ({ translations: [{ text: 'ID:' + t }] })));
  }
  if (u.includes('api.mymemory.translated.net')) {
    calls.mymemory++;
    if (mode === 'all-fail') return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    const q = new URL(u).searchParams.get('q');
    return okRes({ responseData: { translatedText: 'ID:' + q } });
  }
  if (u.includes('x.test')) {
    calls.custom++;
    return errRes(401);
  }
  throw new Error('fetch tak dikenal: ' + u);
};
// Backoff retry instan di test (aslinya 1-2 detik per percobaan).
V.setRetrySleep(() => Promise.resolve());
const logText = () => (w.document.getElementById('logBox') || { textContent: '' }).textContent;
const statusText = () => (w.document.getElementById('transStatus') || { textContent: '' }).textContent;

async function main() {
  // Pastikan init() sudah jalan (listener DOM terpasang) sebelum menguji ceklis.
  await new Promise((r) => { if (w.document.readyState !== 'loading') r(); else w.document.addEventListener('DOMContentLoaded', r); });
  /* ---------- (a)+(b) Google mati 3x -> down, batch ke-4 loncat ke Dict ---------- */
  mode = 'google-null'; resetCalls(); V.resetCircuitBreaker();
  const r1 = await V.translateBatch(['Halo dunia', 'Selamat pagi'], 'en', 'id');
  check('B1 batch 1: hasil via Google Dict', r1.every((x) => x && x.via === 'Google Dict'), JSON.stringify(r1));
  check('B1 batch 1: Google dipanggil 1x + marker 1x, Dict 1x', calls.google === 1 && calls.marker === 1 && calls.dict === 1, JSON.stringify(calls));
  await V.translateBatch(['Halo dunia', 'Selamat pagi'], 'en', 'id');
  check('B1 batch 2: Google belum mati (streak 2)', V.circuitBreaker.google.down === false && V.circuitBreaker.google.streak === 2, JSON.stringify(V.circuitBreaker.google));
  await V.translateBatch(['Halo dunia', 'Selamat pagi'], 'en', 'id');
  check('B1 batch 3: Google MATI setelah 3 gagal beruntun', V.circuitBreaker.google.down === true && V.circuitBreaker.google.streak === 3, JSON.stringify(V.circuitBreaker.google));
  check('B1 log pemutus sirkuit Google tampil', /Pemutus sirkuit.*Google dimatikan/.test(logText()), logText().slice(-300));
  const gBefore = calls.google, mBefore = calls.marker, dBefore = calls.dict;
  const r4 = await V.translateBatch(['Halo dunia', 'Selamat pagi'], 'en', 'id');
  check('B1 batch 4: Google TIDAK dipanggil lagi (0 panggilan baru)', calls.google === gBefore && calls.marker === mBefore, JSON.stringify(calls));
  check('B1 batch 4: langsung ke Dict', calls.dict === dBefore + 1 && r4.every((x) => x && x.via === 'Google Dict'), JSON.stringify(calls));
  check('B1 status menampilkan mesin yang dipakai', /Google Dict/.test(statusText()), statusText());

  /* ---------- (d) Google 429 dua kali lalu berhasil ---------- */
  mode = 'google-429'; google429left = 2; resetCalls(); V.resetCircuitBreaker();
  const rd = await V.translateBatch(['Halo dunia'], 'en', 'id');
  check('D1 429 2x lalu berhasil: via Google', rd[0] && rd[0].via === 'Google', JSON.stringify(rd));
  check('D1 Google dipanggil tepat 3x (2 gagal + 1 berhasil)', calls.google === 3, JSON.stringify(calls));
  check('D1 streak reset setelah berhasil', V.circuitBreaker.google.streak === 0, JSON.stringify(V.circuitBreaker.google));
  check('D1 isRetryable: 429 ya, 401/403 tidak, 500 ya, jaringan ya',
    V.isRetryable({ status: 429 }) && V.isRetryable({ message: 'Google HTTP 500' })
    && !V.isRetryable({ status: 401 }) && !V.isRetryable({ message: 'Custom HTTP 403' })
    && V.isRetryable(new Error('network down')));

  /* ---------- (e) Custom 401: tidak diulang, langsung dimatikan ---------- */
  mode = 'google-ok'; resetCalls(); V.resetCircuitBreaker();
  V.setCustomCfg({ enabled: true, baseUrl: 'https://x.test', apiKey: 'bad-key', model: 'm1' });
  const re1 = await V.translateBatch(['Halo dunia'], 'en', 'id');
  check('E1 401: custom dipanggil tepat 1x (tidak dicoba ulang)', calls.custom === 1, JSON.stringify(calls));
  check('E1 401: custom langsung DIMATIKAN', V.circuitBreaker.custom.down === true, JSON.stringify(V.circuitBreaker.custom));
  check('E1 401: jatuh ke Google', re1[0] && re1[0].via === 'Google', JSON.stringify(re1));
  const cBefore = calls.custom;
  await V.translateBatch(['Halo dunia'], 'en', 'id');
  check('E1 batch berikut: custom tidak dipanggil lagi', calls.custom === cBefore, JSON.stringify(calls));
  V.setCustomCfg({ enabled: false, baseUrl: '', apiKey: '', model: '' });
  V.resetCircuitBreaker();

  /* ---------- (f) BATCH = 10: 25 teks -> 3 batch ---------- */
  mode = 'google-ok'; resetCalls(); V.resetCircuitBreaker();
  const queue25 = Array.from({ length: 25 }, (_, i) => ({ id: 'b' + i, text: 'Text number ' + i + ' here' }));
  const g0 = calls.google;
  await V.translateSegments(queue25);
  check('F1 25 teks diproses dalam 3 panggilan Google (10+10+5)', calls.google - g0 === 3, JSON.stringify(calls));
  const ok25 = queue25.filter((s) => { const t = V.state.translations.get(s.id); return t && !t.failed && t.via === 'Google'; }).length;
  check('F1 semua 25 teks berhasil via Google', ok25 === 25, 'ok=' + ok25);
  check('F1 status menampilkan mesin', /mesin: Google/.test(statusText()), statusText());

  /* ---------- (c) semua mesin online gagal -> Translator Chrome ---------- */
  mode = 'all-fail'; resetCalls(); V.resetCircuitBreaker();
  w.Translator = {
    availability: async () => 'available',
    create: async () => ({ translate: async (t) => 'CHROME:' + t }),
  };
  // 21 teks = 3 batch (10+10+1) supaya Google sempat gagal 3x dan dimatikan.
  const queue3 = Array.from({ length: 21 }, (_, i) => ({ id: 'c' + i, text: 'Chrome rescue text number ' + i + ' here' }));
  await V.translateSegments(queue3);
  const rescued = queue3.filter((s) => { const t = V.state.translations.get(s.id); return t && !t.failed && t.via === 'Chrome'; }).length;
  check('C1 semua mesin gagal -> Translator Chrome menyelamatkan 21/21', rescued === 21, 'rescued=' + rescued);
  check('C1 log penyelamatan Chrome tampil', /Translator Chrome menyelamatkan 21/.test(logText()), logText().slice(-300));
  check('C1 Google sempat dimatikan di tengah jalan', V.circuitBreaker.google.down === true, JSON.stringify(V.circuitBreaker.google));

  /* ---------- (c2) Translator tidak tersedia -> dilewati tanpa crash ---------- */
  mode = 'all-fail'; resetCalls(); V.resetCircuitBreaker();
  delete w.Translator;
  const queue2 = [
    { id: 'd1', text: 'Hello world' },
    { id: 'd2', text: 'Good morning' },
  ];
  let threw = null;
  try { await V.translateSegments(queue2); } catch (e) { threw = e; }
  check('C2 tanpa Translator: tidak crash', threw === null, threw && threw.message);
  const stillFailed = queue2.filter((s) => { const t = V.state.translations.get(s.id); return t && t.failed; }).length;
  check('C2 tanpa Translator: teks tetap gagal (bukan crash)', stillFailed === 2, 'failed=' + stillFailed);
  check('C2 log "tidak bisa dipakai" tampil', /Translator bawaan Chrome tidak bisa dipakai/.test(logText()), logText().slice(-300));

  /* ---------- (h) ceklis "Pilih semua" skip-passage ---------- */
  const skipFixture = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
    + '<tw-storydata name="SkipTest" startnode="1" creator="Twine" creator-version="2.3.0" ifid="SKIP1" format="SugarCube" format-version="2.36.1" options="" hidden>'
    + '<tw-passagedata pid="1" name="Alpha" tags="" position="10,10">Teks alpha pertama.</tw-passagedata>'
    + '<tw-passagedata pid="2" name="Beta" tags="" position="10,10">Teks beta kedua.</tw-passagedata>'
    + '<tw-passagedata pid="3" name="Gamma" tags="" position="10,10">Teks gamma ketiga.</tw-passagedata>'
    + '</tw-storydata></body></html>';
  const sScan = w.scanFile(skipFixture, { includeScript: false, translateNames: false });
  V.state.segments = sScan.segments;
  V.state.passages = sScan.passages;
  V.state.engine = sScan.engine; // seperti doScan: updateStats membaca S.engine.name
  V.state.skipPassages = new Set();
  V.state.translations = new Map();
  V.renderSkipList();
  const master = () => w.document.getElementById('skipAll');
  const skipBoxes = () => [...w.document.querySelectorAll('#skipList input')];
  const skipCount = () => w.document.getElementById('skipAllCount').textContent;
  const fireChange = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('H1 3 passage terpindai', sScan.passages.length === 3, JSON.stringify(sScan.passages.map((p) => p.name)));
  check('H1 master aktif saat ada file', master().disabled === false);
  check('H1 hitungan awal (0 dari 3)', skipCount().includes('0 dilewati dari 3 passage'), skipCount());
  check('H1 3 kotak passage', skipBoxes().length === 3);
  master().checked = true; fireChange(master());
  check('H1 Pilih semua: semua nama masuk skipPassages',
    ['Alpha', 'Beta', 'Gamma'].every((n) => V.state.skipPassages.has(n)), JSON.stringify([...V.state.skipPassages]));
  check('H1 Pilih semua: semua segmen skipped', V.state.segments.length > 0 && V.state.segments.every((s) => s.skipped));
  check('H1 master checked + hitungan (3 dari 3)', master().checked === true && skipCount().includes('3 dilewati dari 3 passage'), skipCount());
  check('H1 semua kotak ikut tercentang', skipBoxes().every((b) => b.checked));
  master().checked = false; fireChange(master());
  check('H1 klik lagi: semua centang terhapus', V.state.skipPassages.size === 0 && V.state.segments.every((s) => !s.skipped));
  check('H1 master unchecked + hitungan (0 dari 3)', master().checked === false && master().indeterminate === false && skipCount().includes('0 dilewati dari 3 passage'));
  skipBoxes()[0].checked = true; fireChange(skipBoxes()[0]);
  check('H1 sebagian: master indeterminate', master().indeterminate === true && master().checked === false);
  check('H1 sebagian: hitungan (1 dari 3)', skipCount().includes('1 dilewati dari 3 passage'), skipCount());
  check('H1 sebagian: hanya Alpha yang dilewati', V.state.skipPassages.size === 1 && V.state.skipPassages.has('Alpha'));
  master().checked = true; fireChange(master());
  V.state.fileName = 'skiptest.html'; V.state.originalText = skipFixture;
  V.saveProject();
  V.state.skipPassages = new Set(); V.state.segments = []; V.state.passages = [];
  const saved = JSON.parse(w.localStorage.getItem('gthtml_v1'));
  V.restoreProject(saved);
  check('H1 sesudah save/restore: skipPassages kembali 3', V.state.skipPassages.size === 3, JSON.stringify([...V.state.skipPassages]));
  check('H1 sesudah restore: master checked', master().checked === true);
  check('H1 sesudah restore: segmen skipped lagi', V.state.segments.length > 0 && V.state.segments.every((s) => s.skipped));

  /* ---------- unit: parseDictResponse ---------- */
  check('U1 parseDictResponse ok', JSON.stringify(V.parseDictResponse(['a', 'b'], 2)) === '["a","b"]');
  check('U1 parseDictResponse tolak panjang salah', V.parseDictResponse(['a'], 2) === null);
  check('U1 parseDictResponse tolak entri kosong', V.parseDictResponse(['a', ''], 2) === null);
  mode = 'google-ok'; // mode sebelumnya 'all-fail' membuat Dict mengembalikan 500
  check('U1 googleDictBatch langsung', (await V.googleDictBatch(['Halo'], 'en', 'id'))[0] === 'ID:Halo');

  console.log('\nV31_FALLBACK: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
