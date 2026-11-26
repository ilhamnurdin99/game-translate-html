/* Test v3.4.20 — Keberhasilan teks satuan mereset pemutus sirkuit
   (pertanyaan Ilham 20:16: "tapi jika 1 teks berhasil pemutus sirkuit
   reset kan?" — jawaban yang dicek di kode v3.4.19: reset HANYA bila
   yang berhasil satu batch utuh; teks satuan di dalam pecahan tidak
   memanggil noteEngineOk sama sekali karena penjaga !inSplit di tiga
   tempat di translateBatch.)
   Jalankan: node tests/test_v3420_reset.js (dari root repo).
   TDD: tes ditulis gagal dulu (penjaga !inSplit masih ada), lalu
   perbaikan minimal (hapus penjaga itu pada noteEngineOk saja).
   Spec (ide-reset-pemutus-satuan-v3420.md):
   1. Satu batch ditolak, pecahan menyelamatkan 2/3 satuan via Custom
      -> CB.custom.streak === 0, down === false.
   2. Tiga batch ditolak beruntun (bulk), masing-masing menyelamatkan
      >=1 satuan via Custom -> pemutus TIDAK trip; batch ke-4 yang sehat
      tetap diterjemahkan custom.
   3. Tiga batch ditolak beruntun tanpa satu pun satuan selamat -> pemutus
      TETAP trip setelah batch ke-3 (perlindungan dipertahankan).
   4. Satuan yang selamat via Google -> CB.google.streak === 0 dan
      CB.custom.streak === 1 (reset bersifat per-mesin).
   5. Jalur Terjemahan custom: satu batch ditolak, pecahan menyelamatkan
      satuan via Custom -> streak 0 (gabungan dengan penanda v3.4.19).
   6. A0: label versi naik ke v3.4.20. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); }
}
const REFUSAL = 'I’m sorry, but I can’t help with that.';
async function main() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  const logText = () => ($('logBox') || { textContent: '' }).textContent;
  const waitFor = async (fn, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 25)); }
    return fn();
  };
  await waitFor(() => logText().includes('Acorn'), 5000);

  const V31 = w.__GTHTML_V31__;
  const V3410 = w.__GTHTML_V3410__;
  const V348 = w.__GTHTML_V348__;
  const V344 = w.__GTHTML_V344__;

  /* ---------- A0: label versi ---------- */
  check('A0 label versi v3.4.26', html.includes('Game Translate HTML v3.4.26') && !html.includes('Game Translate HTML v3.4.22'));
  check('A0 Cara pakai menyebut v3.4.20', html.includes('(v3.4.20)'));

  /* ---------- mock fetch ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let customCalls = 0;
  let customBehavior = null; // (texts) => { content } | { http } | { network: true }
  let googleSucceeds = false;
  let dictFails = false;
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('localhost:3001')) {
      customCalls++;
      const body = JSON.parse(opts.body);
      const texts = JSON.parse(body.messages[1].content);
      const res = customBehavior(texts);
      if (res.network) throw new Error('Failed to fetch');
      if (res.http) return errRes(res.http);
      return okRes({ choices: [{ message: { content: res.content } }] });
    }
    if (u.includes('translate.googleapis.com')) {
      if (googleSucceeds) {
        const params = new URLSearchParams(u.split('?')[1]);
        return okRes([params.getAll('q').map((q) => [['Google:' + q]])]);
      }
      return errRes(500);
    }
    if (u.includes('clients5.google.com')) {
      if (dictFails) return errRes(500);
      const params = new URLSearchParams(u.split('?')[1]);
      return okRes(params.getAll('q').map((q) => 'Dict:' + q));
    }
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };
  V31.setRetrySleep(() => Promise.resolve());
  function setEngines() {
    V344.setEngineSel({ custom: true, google: true, dict: true, edge: false, mymemory: false, chrome: false });
    V31.setCustomCfg({ enabled: true, baseUrl: 'http://localhost:3001/v1', apiKey: 'k-test', model: 'openai/gpt-oss-20b' });
    V31.resetCircuitBreaker();
  }
  const refuse = () => ({ content: REFUSAL });
  const translateAll = (texts) => ({ content: JSON.stringify(texts.map((t) => 'ID:' + t)) });

  /* ---------- fixture: N passage, masing-masing satu teks ---------- */
  function buildFixture(n) {
    let passages = '';
    for (let i = 1; i <= n; i++) {
      passages += '<tw-passagedata pid="' + i + '" name="P' + i + '" tags="" position="100,100" size="100,100">Teks ' + i + '.</tw-passagedata>\n';
    }
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
      + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
      + passages + '</tw-storydata></body></html>';
  }
  function setupState(n) {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(buildFixture(n)) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = []; S.running = false; S.cancelled = false;');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  function setupRetranslate(n) {
    const S = setupState(n);
    for (const s of S.segments) S.translations.set(s.id, { text: 'Lama: ' + s.text, via: 'Google' });
    w.eval('S.selected = new Set(' + JSON.stringify(S.segments.map((s) => s.id)) + '); renderList();');
    return S;
  }

  /* ---------- 1: batch ditolak, 2/3 satuan selamat via Custom -> streak 0 ---------- */
  setEngines();
  googleSucceeds = false; dictFails = false; customCalls = 0;
  customBehavior = (texts) => {
    if (texts.length > 1) return refuse();
    return texts[0] === 'Teks 3.' ? refuse() : translateAll(texts);
  };
  const out1 = await V31.translateBatch(['Teks 1.', 'Teks 2.', 'Teks 3.'], 'en', 'id');
  check('D1 2/3 satuan selamat: hasil [Custom, Custom, Dict]',
    Array.isArray(out1) && out1[0] && out1[0].via === 'Custom' && out1[1] && out1[1].via === 'Custom' && out1[2] && out1[2].via === 'Google Dict',
    JSON.stringify(out1));
  check('D1 streak Custom 0, pemutus tidak trip',
    V31.circuitBreaker.custom.streak === 0 && V31.circuitBreaker.custom.down === false,
    'streak=' + V31.circuitBreaker.custom.streak + ' down=' + V31.circuitBreaker.custom.down);

  /* ---------- 2: 3 batch ditolak beruntun, tiap pecahan menyelamatkan >=1 -> tidak trip ---------- */
  setEngines();
  googleSucceeds = false; dictFails = false; customCalls = 0;
  /* Penolakan diputuskan dari teks pertama batch (bukan penghitung
     panggilan): tryWithRetry memanggil mock 2x per batch yang gagal,
     jadi penghitung akan mencapai 4 di tengah batch ke-2. Batch 1-3
     ditolak, batch 4 sehat. */
  const refusedFirst = ['Teks 1.', 'Teks 11.', 'Teks 21.'];
  customBehavior = (texts) => {
    if (texts.length > 1) return refusedFirst.includes(texts[0]) ? refuse() : translateAll(texts);
    return translateAll(texts);
  };
  let S = setupState(40);
  const done2 = await V31.translateSegments(S.segments.filter((s) => s.translatable && !s.skipped));
  check('D2 3 batch ditolak + selamat: 40 segmen diproses', done2 === 40, 'done=' + done2);
  check('D2 pemutus TIDAK trip (down false, streak 0)',
    V31.circuitBreaker.custom.down === false && V31.circuitBreaker.custom.streak === 0,
    'down=' + V31.circuitBreaker.custom.down + ' streak=' + V31.circuitBreaker.custom.streak);
  check('D2 batch ke-4 yang sehat tetap via Custom',
    S.segments.slice(30).every((s) => (S.translations.get(s.id) || {}).via === 'Custom'),
    JSON.stringify(S.segments.slice(30).map((s) => (S.translations.get(s.id) || {}).via)));
  check('D2 custom dipanggil 37x (3x(2+10) + 1)', customCalls === 37, 'customCalls=' + customCalls);

  /* ---------- 3: 3 batch ditolak, tidak ada satuan selamat -> TETAP trip ---------- */
  setEngines();
  googleSucceeds = false; dictFails = true; customCalls = 0;
  customBehavior = () => refuse();
  S = setupState(30);
  const done3 = await V31.translateSegments(S.segments.filter((s) => s.translatable && !s.skipped));
  check('D3 3 batch tanpa selamat: 30 segmen diproses', done3 === 30, 'done=' + done3);
  check('D3 pemutus TETAP trip (down true, streak 3)',
    V31.circuitBreaker.custom.down === true && V31.circuitBreaker.custom.streak === 3,
    'down=' + V31.circuitBreaker.custom.down + ' streak=' + V31.circuitBreaker.custom.streak);
  check('D3 custom dipanggil 46x (22+22+2, trip sebelum pecahan batch ke-3)', customCalls === 46, 'customCalls=' + customCalls);

  /* ---------- 4: satuan selamat via Google -> reset per-mesin ---------- */
  setEngines();
  googleSucceeds = true; dictFails = false; customCalls = 0;
  V31.circuitBreaker.google.streak = 1; // simulasi kegagalan Google pada batch sebelumnya
  customBehavior = () => refuse();
  const out4 = await V31.translateBatch(['Teks 1.', 'Teks 2.', 'Teks 3.'], 'en', 'id');
  check('D4 satuan selamat via Google: hasil semua via Google',
    Array.isArray(out4) && out4.every((x) => x && x.via === 'Google'),
    JSON.stringify(out4));
  check('D4 reset per-mesin: google streak 0, custom streak 1',
    V31.circuitBreaker.google.streak === 0 && V31.circuitBreaker.custom.streak === 1,
    'google=' + V31.circuitBreaker.google.streak + ' custom=' + V31.circuitBreaker.custom.streak);

  /* ---------- 5: Terjemahan custom, batch ditolak, satuan selamat via Custom -> streak 0 ---------- */
  setEngines();
  googleSucceeds = false; dictFails = false; customCalls = 0;
  customBehavior = (texts) => (texts.length > 1 ? refuse() : translateAll(texts));
  S = setupRetranslate(3);
  const r5 = await V3410.retranslateSelected();
  check('D5 retranslate: 3 diganti, 0 dipertahankan', !!r5 && r5.replaced === 3 && r5.kept === 0, JSON.stringify(r5));
  check('D5 retranslate: semua via Custom, streak 0, pemutus tidak trip',
    S.segments.every((s) => (S.translations.get(s.id) || {}).via === 'Custom')
    && V31.circuitBreaker.custom.streak === 0 && V31.circuitBreaker.custom.down === false,
    'streak=' + V31.circuitBreaker.custom.streak + ' down=' + V31.circuitBreaker.custom.down);

  console.log('\nV3420_RESET: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
