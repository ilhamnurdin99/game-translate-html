/* Test v3.4.7 — Label kapital semua jadi segmen HANYA untuk tautan
   satu argumen (singleLink) (F1 Important).
   Jalankan: node test_v347_caps.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) [[SUNDAY]] jadi segmen bila ceklis label tautan AKTIF (SugarCube);
   (b) <<link "MONDAY">> jadi segmen bila ceklis AKTIF;
   (c) [[TUESDAY]] jadi segmen bila ceklis AKTIF (Harlowe);
   (d) [[SUNDAY]] BUKAN segmen bila ceklis NONAKTIF (target dicatat);
   (e) token kode kapital semua di teks biasa tetap BUKAN segmen;
   (f) label dua argumen [[SUNDAY|Sunday]] TIDAK dilonggarkan (di luar
       lingkup: hanya singleLink);
   (g) Timpa [[SUNDAY]] -> [[Minggu|SUNDAY]] + verifikasi lolos.
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
const V347 = w.__GTHTML_V347__;
const $ = (id) => w.document.getElementById(id);

check('A0 hook v3.4.7 tersedia', !!V347 && typeof V347.scanFile === 'function' && typeof V347.buildOutput === 'function' && typeof V347.verifyOutput === 'function');
if (!V347) { console.log('\nV347_CAPS: hook belum ada — RED'); process.exit(1); }

function twine2(passages, engine) {
  const fmt = engine === 'harlowe' ? 'Harlowe' : 'SugarCube';
  const ver = engine === 'harlowe' ? '3.3.8' : '2.37.3';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="' + fmt + '" format-version="' + ver + '" options="" hidden>\n'
    + passages + '</tw-storydata></body></html>';
}
function setupState(fix, linkLabels) {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = ' + (linkLabels ? 'true' : 'false') + '; S.linkNoBodyTargets = [];');
  w.eval('segCounter = 0; doScan(); renderList();');
  return V347.state;
}
const texts = (S) => S.segments.filter((s) => s.translatable).map((s) => s.text);

async function main() {
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  w.confirm = () => true;

  /* ---------- (a) [[SUNDAY]] SugarCube, ceklis AKTIF ---------- */
  const FIX_SC = twine2('<tw-passagedata pid="1" name="Days" tags="" position="100,100" size="100,100">Hari ini [[SUNDAY]] dan [[MONDAY]] lalu.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="SUNDAY" tags="" position="200,100" size="100,100">Sunday text.</tw-passagedata>\n'
    + '<tw-passagedata pid="3" name="MONDAY" tags="" position="300,100" size="100,100">Monday text.</tw-passagedata>\n');
  let S = setupState(FIX_SC, true);
  check('A1 [[SUNDAY]] + [[MONDAY]] jadi segmen (ceklis AKTIF)', texts(S).includes('SUNDAY') && texts(S).includes('MONDAY'), JSON.stringify(texts(S)));

  /* ---------- (b) <<link "MONDAY">>, ceklis AKTIF ---------- */
  const FIX_LINK = twine2('<tw-passagedata pid="1" name="L" tags="" position="100,100" size="100,100">Klik <<link "TUESDAY">> di sini.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="TUESDAY" tags="" position="200,100" size="100,100">Tuesday text.</tw-passagedata>\n');
  S = setupState(FIX_LINK, true);
  check('B1 <<link "TUESDAY">> jadi segmen (ceklis AKTIF)', texts(S).includes('TUESDAY'), JSON.stringify(texts(S)));

  /* ---------- (c) [[TUESDAY]] Harlowe, ceklis AKTIF ---------- */
  const FIX_H = twine2('<tw-passagedata pid="1" name="Days" tags="" position="100,100" size="100,100">Hari ini [[WEDNESDAY]] lalu.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="WEDNESDAY" tags="" position="200,100" size="100,100">Wednesday text.</tw-passagedata>\n', 'harlowe');
  S = setupState(FIX_H, true);
  check('C1 [[WEDNESDAY]] Harlowe jadi segmen (ceklis AKTIF)', texts(S).includes('WEDNESDAY'), JSON.stringify(texts(S)));

  /* ---------- (d) [[SUNDAY]] / <<link>> ceklis NONAKTIF ---------- */
  S = setupState(FIX_SC, false);
  check('D1 [[SUNDAY]] BUKAN segmen (ceklis NONAKTIF)', !texts(S).includes('SUNDAY') && !texts(S).includes('MONDAY'), JSON.stringify(texts(S)));
  S = setupState(FIX_LINK, false);
  check('D1 target <<link "TUESDAY">> dicatat di linkNoBodyTargets', (S.linkNoBodyTargets || []).includes('TUESDAY'), JSON.stringify(S.linkNoBodyTargets));

  /* ---------- (e) token kode kapital semua di teks biasa ---------- */
  const FIX_CODE = twine2('<tw-passagedata pid="1" name="P" tags="" position="100,100" size="100,100">MAX_VALUE\n\nSome normal text here.</tw-passagedata>\n');
  S = setupState(FIX_CODE, true);
  check('E1 MAX_VALUE di teks biasa tetap BUKAN segmen', !texts(S).includes('MAX_VALUE') && texts(S).includes('Some normal text here.'), JSON.stringify(texts(S)));

  /* ---------- (f) label dua argumen tidak dilonggarkan ---------- */
  const FIX_TWO = twine2('<tw-passagedata pid="1" name="P" tags="" position="100,100" size="100,100">Pergi [[SUNDAY|Sunday]] sekarang.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="Sunday" tags="" position="200,100" size="100,100">Sunday text.</tw-passagedata>\n');
  S = setupState(FIX_TWO, true);
  check('F1 label dua argumen [[SUNDAY|Sunday]] TIDAK jadi segmen', !texts(S).includes('SUNDAY'), JSON.stringify(texts(S)));

  /* ---------- (g) Timpa [[SUNDAY]] ---------- */
  S = setupState(FIX_SC, true);
  for (const s of S.segments) {
    if (s.translatable && s.text === 'SUNDAY') S.translations.set(s.id, { text: 'Minggu', via: 'manual' });
    if (s.translatable && s.text === 'MONDAY') S.translations.set(s.id, { text: 'Senin', via: 'manual' });
  }
  const built = V347.buildOutput();
  check('G1 Timpa: [[SUNDAY]] -> [[Minggu|SUNDAY]]', built.text.includes('[[Minggu|SUNDAY]]') && built.text.includes('[[Senin|MONDAY]]'), built.text.slice(built.text.indexOf('Hari ini'), built.text.indexOf('Hari ini') + 60));
  const checksG = V347.verifyOutput(built.text);
  check('G1 verifikasi lolos semua', checksG.every((c) => c.ok), checksG.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label).join(' | '));

  console.log('\nV347_CAPS: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
