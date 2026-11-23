/* Test v3.4.7 — Tulis balik Harlowe memakai -> (F3).
   Jalankan: node test_v347_harlowe.js [path/index.html]
   Bukti (manual resmi Harlowe 3.3.8): pemisah label-target Harlowe
   adalah "->" atau "<-"; "|" BUKAN pemisah Harlowe (itu SugarCube).
   Menguji:
   (a) Harlowe [[Home]] -> Timpa [[Rumah->Home]] (bukan [[Rumah|Home]]);
   (b) SugarCube [[Home]] -> Timpa [[Rumah|Home]] (tetap);
   (c) Harlowe dua argumen [[Go Home|Home]] -> label diganti, pemisah
       ASLI "|" dipertahankan (bukan ditulis aplikasi — file asli sudah
       memakai "|", jadi bukan kerusakan baru dari aplikasi);
   (d) verifikasi lolos untuk build Harlowe (pindai ulang cocok).
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

check('A0 hook v3.4.7 tersedia', !!V347 && typeof V347.buildOutput === 'function' && typeof V347.verifyOutput === 'function');
if (!V347) { console.log('\nV347_HARLOWE: hook belum ada — RED'); process.exit(1); }

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

async function main() {
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  w.confirm = () => true;

  /* ---------- (a) Harlowe [[Home]] ---------- */
  const FIX_H = twine2('<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Go [[Home]] now. [[Go Home|Home]]</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="Home" tags="" position="200,100" size="100,100">Home text.</tw-passagedata>\n', 'harlowe');
  let S = setupState(FIX_H, true);
  check('A1 Harlowe terdeteksi', S.engine && S.engine.kind === 'harlowe', JSON.stringify(S.engine && S.engine.kind));
  for (const s of S.segments) {
    if (s.translatable && s.text === 'Home') S.translations.set(s.id, { text: 'Rumah', via: 'manual' });
    if (s.translatable && s.text === 'Go Home') S.translations.set(s.id, { text: 'Pulang', via: 'manual' });
  }
  let built = V347.buildOutput();
  check('A1 Harlowe Timpa: [[Rumah->Home]]', built.text.includes('[[Rumah->Home]]'), built.text.slice(built.text.indexOf('Go '), built.text.indexOf('Go ') + 60));
  check('A1 Harlowe Timpa: TIDAK ada [[Rumah|Home]]', !built.text.includes('[[Rumah|Home]]'));
  check('A1 Harlowe dua argumen: pemisah asli "|" dipertahankan', built.text.includes('[[Pulang|Home]]'), built.text.slice(built.text.indexOf('Go '), built.text.indexOf('Go ') + 60));
  let checks = V347.verifyOutput(built.text);
  check('A1 Harlowe verifikasi lolos semua', checks.every((c) => c.ok), checks.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label).join(' | '));

  /* ---------- (b) SugarCube [[Home]] (tetap |) ---------- */
  const FIX_SC = twine2('<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Go [[Home]] now.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="Home" tags="" position="200,100" size="100,100">Home text.</tw-passagedata>\n', 'sugarcube');
  S = setupState(FIX_SC, true);
  check('B1 SugarCube terdeteksi', S.engine && S.engine.kind === 'sugarcube', JSON.stringify(S.engine && S.engine.kind));
  for (const s of S.segments) {
    if (s.translatable && s.text === 'Home') S.translations.set(s.id, { text: 'Rumah', via: 'manual' });
  }
  built = V347.buildOutput();
  check('B1 SugarCube Timpa: [[Rumah|Home]] (tetap |)', built.text.includes('[[Rumah|Home]]'), built.text.slice(built.text.indexOf('Go '), built.text.indexOf('Go ') + 40));
  check('B1 SugarCube Timpa: TIDAK ada [[Rumah->Home]]', !built.text.includes('[[Rumah->Home]]'));

  console.log('\nV347_HARLOWE: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
