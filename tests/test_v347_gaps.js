/* Test v3.4.7 — Celah tes (F7 + F8).
   Jalankan: node test_v347_gaps.js [path/index.html]
   Memuat index.html di jsdom, fetch + Translator di-mock (pola v3.4.4),
   lalu menguji:
   (F7) baris log awal run memuat "label tautan satu argumen: AKTIF"
        bila ceklis hidup, dan "NONAKTIF" bila ceklis mati;
   (F8) penolakan '|' ujung-ke-ujung: mesin mengembalikan terjemahan
        label ber-'|' ("Ru|mah") untuk segmen singleLink — segmen itu
        harus ditandai gagal ("gagal:label mengandung |"), segmen biasa
        tetap diterjemahkan, dan Timpa tidak menulis "Ru|mah".
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
const V31 = w.__GTHTML_V31__;
const V344 = w.__GTHTML_V344__;
const V347 = w.__GTHTML_V347__;
const $ = (id) => w.document.getElementById(id);
const logText = () => ($('logBox') || { textContent: '' }).textContent;

check('A0 hook v3.4.7 tersedia (runTranslate + translateSegments)', !!V347 && typeof V347.runTranslate === 'function' && typeof V347.translateSegments === 'function' && typeof V347.validateOne === 'function' && typeof V347.buildOutput === 'function');
if (!V347 || typeof V347.runTranslate !== 'function') { console.log('\nV347_GAPS: runTranslate belum diekspos di hook v3.4.7 — RED'); process.exit(1); }

/* ---------- mock fetch + Translator (pola v3.4.4) ---------- */
const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
w.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('translate.googleapis.com')) {
    const qs = new URL(u).searchParams.getAll('q');
    if (qs.length === 1 && qs[0].includes('ZXQSEP')) return okRes([[['x ' + qs[0] + ' y']]]);
    return okRes([qs.map((t) => [[t.replace(/[^A-Za-z]/g, '') === 'Home' ? 'Ru|mah' : (t.includes('Hello') ? 'Halo dunia.' : (t.includes('Home text') ? 'Teks rumah.' : 'ID:' + t))]])]);
  }
  if (u.includes('clients5.google.com')) return errRes(500);
  if (u.includes('edge.microsoft.com')) return errRes(500);
  if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
  if (u.includes('x.test')) return errRes(401);
  throw new Error('fetch tak dikenal: ' + u);
};
V31.setRetrySleep(() => Promise.resolve());
w.Translator = { availability: async () => 'available', create: async () => ({ translate: async (t) => 'CHROME:' + t }) };
const ALL_ON = { custom: true, google: true, dict: true, edge: true, mymemory: true, chrome: true };
function resetEngines() { V344.setEngineSel(ALL_ON); V31.setCustomCfg({ enabled: false, baseUrl: '', apiKey: '', model: '' }); V31.resetCircuitBreaker(); }

const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Hello world. [[Home]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Home" tags="" position="200,100" size="100,100">Home text.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
function setupState(linkLabels) {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = ' + (linkLabels ? 'true' : 'false') + '; S.linkNoBodyTargets = [];');
  w.eval('segCounter = 0; doScan(); renderList();');
  return V347.state;
}

async function main() {
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  w.confirm = () => true;

  /* ---------- F7: baris log AKTIF / NONAKTIF ---------- */
  resetEngines();
  V344.setEngineSel({ chrome: false }); // tanpa penyelamatan Chrome — F8 butuh gagal tetap gagal
  let S = setupState(true);
  let before = logText().length;
  await V347.runTranslate('all');
  check('F7 ceklis HIDUP: log memuat "label tautan satu argumen: AKTIF"', logText().slice(before).includes('label tautan satu argumen: AKTIF'), logText().slice(before).slice(0, 400));
  check('F7 ceklis HIDUP: log TIDAK memuat NONAKTIF di baris mulai', !logText().slice(before).includes('label tautan satu argumen: NONAKTIF'));

  resetEngines();
  V344.setEngineSel({ chrome: false });
  S = setupState(false);
  before = logText().length;
  await V347.runTranslate('all');
  check('F7 ceklis MATI: log memuat "label tautan satu argumen: NONAKTIF"', logText().slice(before).includes('label tautan satu argumen: NONAKTIF'), logText().slice(before).slice(0, 400));

  /* ---------- F8: penolakan '|' ujung-ke-ujung ---------- */
  resetEngines();
  V344.setEngineSel({ chrome: false });
  S = setupState(true);
  await V347.runTranslate('all');
  const homeSeg = S.segments.find((s) => s.text === 'Home' && s.singleLink);
  const helloSeg = S.segments.find((s) => s.text === 'Hello world.');
  check('F8 segmen singleLink [[Home]] ada', !!homeSeg, JSON.stringify(S.segments.map((s) => s.text)));
  const homeTr = homeSeg && S.translations.get(homeSeg.id);
  check('F8 terjemahan ber-| ditandai gagal', !!homeTr && homeTr.failed === true && homeTr.via === 'gagal:label mengandung |', JSON.stringify(homeTr));
  const helloTr = helloSeg && S.translations.get(helloSeg.id);
  check('F8 segmen biasa tetap diterjemahkan', !!helloTr && helloTr.failed !== true && helloTr.text === 'Halo dunia.', JSON.stringify(helloTr));
  const built = V347.buildOutput();
  check('F8 Timpa tidak menulis "Ru|mah"', !built.text.includes('Ru|mah'));
  check('F8 Timpa menulis terjemahan biasa', built.text.includes('Halo dunia.'));

  console.log('\nV347_GAPS: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
