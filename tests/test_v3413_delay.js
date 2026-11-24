/* Test v3.4.13 — Jeda batch custom lebih panjang + hormati Retry-After
   (ide Ilham: Groq 429 berulang karena laju ~30-40/menit > batas gratis ~30).
   Jalankan: node tests/test_v3413_delay.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook V3413 + batchDelayMs + Retry-After
   belum ada), lalu perbaikan minimal.
   Spec (ide-jeda-custom-v3413.md):
   1. batchDelayMs() = 2500 saat custom aktif (dicentang + konfigurasi
      lengkap); = 1200 saat custom mati / konfigurasi tidak lengkap /
      custom tidak dicentang.
   2. Retry-After: 429 + header retry-after: 5 -> retrySleep tercatat 5000
      (bukan 1000); 429 tanpa header -> 1000; retry-after: 120 -> dibatasi
      60000.
   3. Loop memakai jeda itu: satu run 2 batch (12 segmen) dengan custom
      aktif — waktu tempuh >= 2000 ms (batas bawah saja).
   4. Custom tidak aktif -> helper 1200 (dicakup butir 1). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); }
}
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

  const V3413 = w.__GTHTML_V3413__;
  const V3410 = w.__GTHTML_V3410__;
  const V348 = w.__GTHTML_V348__;
  const V344 = w.__GTHTML_V344__;
  const V31 = w.__GTHTML_V31__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.13 tersedia', !!V3413 && typeof V3413.batchDelayMs === 'function', 'hook: ' + typeof V3413);
  check('A0 label versi v3.4.21', html.includes('Game Translate HTML v3.4.21') && !html.includes('Game Translate HTML v3.4.20'));
  check('A0 Cara pakai menyebut v3.4.13', html.includes('(v3.4.13)'));
  if (!V3413 || typeof V3413.batchDelayMs !== 'function') { console.log('\nV3413_DELAY: batchDelayMs belum diekspos di hook v3.4.13 — RED'); process.exit(1); }

  /* ---------- mock fetch + mesin ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let sleeps = [];
  V31.setRetrySleep((ms) => { sleeps.push(ms); return Promise.resolve(); });
  function setEngines(sel) {
    V344.setEngineSel(Object.assign({ custom: false, google: false, dict: false, edge: false, mymemory: false, chrome: false }, sel));
    V31.setCustomCfg({ enabled: !!sel.custom, baseUrl: 'http://localhost:3001/v1', apiKey: 'k-test', model: 'm-test' });
    V31.resetCircuitBreaker();
  }
  // Custom: 'ok' = selalu sukses; 'ra5'/'ra120'/'noheader' = 429 sekali
  // (dengan header retry-after masing-masing) lalu sukses.
  let customMode = 'ok';
  let customCalls = 0;
  function customOkResponse(opts) {
    const body = JSON.parse(opts.body);
    const texts = JSON.parse(body.messages[1].content);
    return okRes({ choices: [{ message: { content: JSON.stringify(texts.map((t) => 'CUSTOM:' + t)) } }] });
  }
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('localhost:3001')) {
      customCalls++;
      if (customMode === 'ok') return customOkResponse(opts);
      if (customCalls === 1) {
        if (customMode === 'noheader') return errRes(429);
        const v = customMode === 'ra5' ? '5' : '120';
        return { ok: false, status: 429, json: async () => ({}), headers: { get: (n) => (String(n).toLowerCase() === 'retry-after' ? v : null) } };
      }
      return customOkResponse(opts);
    }
    if (u.includes('translate.googleapis.com')) return errRes(500);
    if (u.includes('clients5.google.com')) return errRes(500);
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };

  /* ---------- 1: helper batchDelayMs ---------- */
  setEngines({ custom: true });
  check('D1 custom aktif: jeda 2500', V3413.batchDelayMs() === 2500, 'jeda: ' + V3413.batchDelayMs());
  setEngines({ google: true });
  check('D1 custom tidak dicentang: jeda 1200', V3413.batchDelayMs() === 1200, 'jeda: ' + V3413.batchDelayMs());
  setEngines({ custom: true });
  V31.setCustomCfg({ enabled: false });
  check('D1 custom dicentang tapi tidak diaktifkan: jeda 1200', V3413.batchDelayMs() === 1200, 'jeda: ' + V3413.batchDelayMs());
  V31.setCustomCfg({ enabled: true, baseUrl: '', apiKey: 'k-test', model: 'm-test' });
  check('D1 custom aktif tapi baseUrl kosong: jeda 1200', V3413.batchDelayMs() === 1200, 'jeda: ' + V3413.batchDelayMs());

  /* ---------- 2: Retry-After ---------- */
  async function retryAfterCase(mode, expected) {
    customMode = mode; customCalls = 0; sleeps = [];
    setEngines({ custom: true });
    const out = await V31.translateBatch(['Halo dunia.'], 'en', 'id');
    return { out, sleeps: sleeps.slice() };
  }
  let r = await retryAfterCase('ra5', 5000);
  check('D2 retry-after 5: tidur 5000 (bukan 1000)', r.sleeps.length === 1 && r.sleeps[0] === 5000, 'sleeps: ' + JSON.stringify(r.sleeps));
  check('D2 retry-after 5: hasil tetap sampai', Array.isArray(r.out) && r.out[0] && r.out[0].text === 'CUSTOM:Halo dunia.', JSON.stringify(r.out));
  r = await retryAfterCase('noheader', 1000);
  check('D2 429 tanpa header: tidur 1000 (backoff lama)', r.sleeps.length === 1 && r.sleeps[0] === 1000, 'sleeps: ' + JSON.stringify(r.sleeps));
  r = await retryAfterCase('ra120', 60000);
  check('D2 retry-after 120: dibatasi 60000', r.sleeps.length === 1 && r.sleeps[0] === 60000, 'sleeps: ' + JSON.stringify(r.sleeps));

  /* ---------- 3: run 2 batch custom aktif >= 2000 ms ---------- */
  const FIX12 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">'
    + ['Kalimat 01.', 'Kalimat 02.', 'Kalimat 03.', 'Kalimat 04.', 'Kalimat 05.', 'Kalimat 06.', 'Kalimat 07.', 'Kalimat 08.', 'Kalimat 09.', 'Kalimat 10.', 'Kalimat 11.', 'Kalimat 12.'].join('\n\n')
    + '</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  function setupState12() {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX12) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = []; S.running = false; S.cancelled = false;');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  const S = setupState12();
  check('D3 fixture: 12 segmen', S.segments.filter((s) => s.translatable).length === 12, 'segmen: ' + S.segments.length);
  const segByText = (s, t) => s.segments.find((x) => x.text === t);
  for (const seg of S.segments) {
    if (seg.translatable) S.translations.set(seg.id, { text: 'Lama ' + seg.text, via: 'Google' });
  }
  customMode = 'ok';
  setEngines({ custom: true });
  w.eval('S.selected = new Set(S.segments.filter((s) => s.translatable).map((s) => s.id)); renderList();');
  const t0 = Date.now();
  const r3 = await V3410.retranslateSelected();
  const dt = Date.now() - t0;
  check('D3 run 2 batch custom aktif: 12 diganti', !!r3 && r3.replaced === 12 && r3.kept === 0, JSON.stringify(r3));
  check('D3 run 2 batch custom aktif: tempuh >= 2000 ms', dt >= 2000, 'dt: ' + dt + ' ms');
  check('D3 akuntansi bms batch 1 memakai jeda baru', Array.isArray(S.stats.recent) && S.stats.recent.length >= 1 && S.stats.recent[0].ms >= 2000, 'recent: ' + JSON.stringify(S.stats.recent));

  console.log('\nV3413_DELAY: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
