/* Test v3.4.19 — Penolakan tidak mematikan custom di Terjemahan custom,
   pemutus 429 DIPERTAHANKAN
   (ide Ilham: run 19:49 dengan gpt-oss-20b, 16 diganti 84 dipertahankan —
   pemutus sirkuit trip karena 3 batch DITOLAK beruntun, padahal pecahan
   satuan v3.4.18 menyelamatkan teks. Ilham menegaskan 20:02: pemutus
   untuk Custom HTTP 429 (3 kali dalam 1 run) DIPERTAHANKAN — yang
   dihilangkan hanya pemutus untuk PENOLAKAN di Terjemahan custom.)
   Jalankan: node tests/test_v3419_breaker.js (dari root repo).
   TDD: tes ditulis gagal dulu (penanda belum ada), lalu perbaikan minimal.
   Spec (ide-pemutus-sirkuit-penolakan-v3419.md):
   1. Custom menolak 3 batch beruntun lewat Terjemahan custom -> pemutus
      TIDAK trip (down false, streak 0, custom tetap dicoba).
   2. Custom 429 3 batch beruntun lewat Terjemahan custom -> pemutus
      TETAP trip.
   3. Network error 3x beruntun lewat Terjemahan custom -> pemutus
      TETAP trip.
   4. Custom menolak 3 batch beruntun lewat bulk -> pemutus tetap trip.
   5. A0: label versi naik ke v3.4.19. */
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
  check('A0 label versi v3.4.21', html.includes('Game Translate HTML v3.4.21') && !html.includes('Game Translate HTML v3.4.20'));
  check('A0 Cara pakai menyebut v3.4.20', html.includes('(v3.4.20)'));

  /* ---------- mock fetch ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let customCalls = 0;
  let customBehavior = null; // (texts) => { content } | { http } | { network: true }
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
    if (u.includes('translate.googleapis.com')) return errRes(500);
    if (u.includes('clients5.google.com')) {
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

  /* ---------- 1: 3 batch ditolak beruntun lewat Terjemahan custom -> TIDAK trip ---------- */
  setEngines();
  customCalls = 0;
  customBehavior = () => refuse();
  let S = setupRetranslate(30);
  const logBefore1 = logText().length;
  const r1 = await V3410.retranslateSelected();
  check('D1 retranslate 3x ditolak: 30 diganti (via Dict), 0 dipertahankan', !!r1 && r1.replaced === 30 && r1.kept === 0, JSON.stringify(r1));
  check('D1 retranslate 3x ditolak: pemutus TIDAK trip (down false, streak 0)',
    V31.circuitBreaker.custom.down === false && V31.circuitBreaker.custom.streak === 0,
    'down=' + V31.circuitBreaker.custom.down + ' streak=' + V31.circuitBreaker.custom.streak);
  check('D1 retranslate 3x ditolak: custom tetap dicoba di batch ke-3 (3 batch x 22 panggilan = 66)', customCalls === 66, 'customCalls=' + customCalls);
  check('D1 retranslate 3x ditolak: tidak ada baris [Pemutus sirkuit] dari penolakan', !logText().slice(logBefore1).includes('[Pemutus sirkuit]'), logText().slice(logBefore1).slice(-300));
  /* Jalur umum (batch 1 teks, tanpa pecah): penanda juga berlaku. */
  setEngines();
  customCalls = 0;
  customBehavior = () => refuse();
  const out1b = await V31.translateBatch(['Teks solo.'], 'en', 'id', { formatErrorsDontTripBreaker: true });
  check('D1b batch 1 teks + penanda: jatuh ke Dict, streak tetap 0',
    Array.isArray(out1b) && out1b[0] && out1b[0].via === 'Google Dict' && V31.circuitBreaker.custom.streak === 0,
    JSON.stringify(out1b) + ' streak=' + V31.circuitBreaker.custom.streak);
  V31.resetCircuitBreaker();
  const out1c = await V31.translateBatch(['Teks solo.'], 'en', 'id');
  check('D1c batch 1 teks TANPA penanda (kontrol): streak naik jadi 1',
    Array.isArray(out1c) && out1c[0] && out1c[0].via === 'Google Dict' && V31.circuitBreaker.custom.streak === 1,
    JSON.stringify(out1c) + ' streak=' + V31.circuitBreaker.custom.streak);

  /* ---------- 2: 429 3 batch beruntun lewat Terjemahan custom -> TETAP trip ---------- */
  setEngines();
  customCalls = 0;
  customBehavior = () => ({ http: 429 });
  S = setupRetranslate(30);
  const logBefore2 = logText().length;
  const r2 = await V3410.retranslateSelected();
  check('D2 retranslate 3x 429: 30 diganti (via Dict), 0 dipertahankan', !!r2 && r2.replaced === 30 && r2.kept === 0, JSON.stringify(r2));
  check('D2 retranslate 3x 429: pemutus TETAP trip (down true, streak 3)',
    V31.circuitBreaker.custom.down === true && V31.circuitBreaker.custom.streak === 3,
    'down=' + V31.circuitBreaker.custom.down + ' streak=' + V31.circuitBreaker.custom.streak);
  check('D2 retranslate 3x 429: custom hanya 2x per batch (6 panggilan) lalu berhenti dicoba', customCalls === 6, 'customCalls=' + customCalls);
  check('D2 retranslate 3x 429: baris [Pemutus sirkuit] ada di log', logText().slice(logBefore2).includes('[Pemutus sirkuit]'), logText().slice(logBefore2).slice(-300));

  /* ---------- 3: network error 3x beruntun lewat Terjemahan custom -> TETAP trip ---------- */
  setEngines();
  customCalls = 0;
  customBehavior = () => ({ network: true });
  S = setupRetranslate(30);
  const r3 = await V3410.retranslateSelected();
  check('D3 retranslate 3x network: pemutus TETAP trip (down true, streak 3)',
    V31.circuitBreaker.custom.down === true && V31.circuitBreaker.custom.streak === 3,
    'down=' + V31.circuitBreaker.custom.down + ' streak=' + V31.circuitBreaker.custom.streak);
  check('D3 retranslate 3x network: custom hanya 2x per batch (6 panggilan) lalu berhenti dicoba', customCalls === 6, 'customCalls=' + customCalls);

  /* ---------- 4: 3 batch ditolak beruntun lewat bulk -> pemutus tetap trip ---------- */
  setEngines();
  customCalls = 0;
  customBehavior = () => refuse();
  S = setupState(30);
  const logBefore4 = logText().length;
  const done4 = await V31.translateSegments(S.segments.filter((s) => s.translatable && !s.skipped));
  check('D4 bulk 3x ditolak: 30 segmen diproses', done4 === 30, 'done=' + done4);
  check('D4 bulk 3x ditolak: pemutus TETAP trip (down true, streak 3)',
    V31.circuitBreaker.custom.down === true && V31.circuitBreaker.custom.streak === 3,
    'down=' + V31.circuitBreaker.custom.down + ' streak=' + V31.circuitBreaker.custom.streak);
  check('D4 bulk 3x ditolak: batch ke-3 satuan melewati custom (22+22+2 = 46 panggilan)', customCalls === 46, 'customCalls=' + customCalls);
  check('D4 bulk 3x ditolak: baris [Pemutus sirkuit] ada di log', logText().slice(logBefore4).includes('[Pemutus sirkuit]'), logText().slice(logBefore4).slice(-300));

  console.log('\nV3419_BREAKER: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
