/* Test v3.4.7 — Verifikasi §8: empat cek baru di verifyOutput (F2).
   Jalankan: node test_v347_verify.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) build benar: 10 cek (6 lama + 4 baru) semua lolos;
   (b) fixture rusak nama passage -> cek nama GAGAL (yang lain lolos);
   (c) fixture rusak target tautan -> cek target GAGAL (nama lolos);
   (d) fixture rusak keseimbangan << >> -> cek << >> GAGAL;
   (e) fixture rusak tag <script> -> cek script GAGAL;
   (f) target dinamis ($, _, ()) dilewati — cek target tetap lolos;
   (g) mode nama passage aktif -> cek nama TIDAK ADA (dilewati).
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

check('A0 hook v3.4.7 tersedia', !!V347 && typeof V347.verifyOutput === 'function' && typeof V347.buildOutput === 'function');
if (!V347) { console.log('\nV347_VERIFY: hook belum ada — RED'); process.exit(1); }

const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<script>window.x = 1;</script>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Welcome. [[Go to Shop|Shop]] [[Home]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Shop" tags="" position="200,100" size="100,100">Shop text. <<set $x to 1>></tw-passagedata>\n'
  + '<tw-passagedata pid="3" name="Home" tags="" position="300,100" size="100,100">Home text. <<widget "w">>Widget text<</widget>></tw-passagedata>\n'
  + '</tw-storydata></body></html>';
function setupState(fix, linkLabels, translateNames) {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = ' + (!!translateNames) + '; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = ' + (!!linkLabels) + '; S.linkNoBodyTargets = [];');
  w.eval('segCounter = 0; doScan(); renderList();');
  return V347.state;
}
const byLabel = (checks, frag) => checks.find((c) => c.label.includes(frag));
const setTranslations = (S, map) => {
  for (const s of S.segments) {
    if (s.translatable && map[s.text]) S.translations.set(s.id, { text: map[s.text], via: 'manual' });
  }
};

async function main() {
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  w.confirm = () => true;

  /* ---------- (a) build benar: 10 cek ---------- */
  let S = setupState(FIX, true, false);
  setTranslations(S, { 'Welcome.': 'Selamat datang.', 'Shop text.': 'Teks toko.', 'Home text.': 'Teks rumah.', 'Widget text': 'Teks widget', 'Go to Shop': 'Pergi ke Toko', 'Home': 'Rumah' });
  const built = V347.buildOutput();
  let checks = V347.verifyOutput(built.text);
  check('A1 10 cek (6 lama + 4 baru)', checks.length === 10, 'dapat: ' + checks.length + ' — ' + checks.map((c) => c.label).join(' | '));
  check('A1 semua cek lolos', checks.every((c) => c.ok), checks.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label).join(' | '));
  check('A1 cek nama passage ada + lolos', !!byLabel(checks, 'Nama passage') && byLabel(checks, 'Nama passage').ok);
  check('A1 cek target tautan ada + lolos', !!byLabel(checks, 'Target tautan') && byLabel(checks, 'Target tautan').ok);
  check('A1 cek << >> ada + lolos', !!byLabel(checks, 'seimbang') && byLabel(checks, 'seimbang').ok);
  check('A1 cek <script> ada + lolos', !!byLabel(checks, '<script>') && byLabel(checks, '<script>').ok);

  /* ---------- (b) nama passage rusak ---------- */
  const brokenName = built.text.replace('name="Shop"', 'name="Toko"');
  checks = V347.verifyOutput(brokenName);
  check('B1 cek nama GAGAL bila name= diganti', !!byLabel(checks, 'Nama passage') && !byLabel(checks, 'Nama passage').ok, JSON.stringify(byLabel(checks, 'Nama passage')));
  check('B1 cek target ikut GAGAL (Shop hilang)', !!byLabel(checks, 'Target tautan') && !byLabel(checks, 'Target tautan').ok);
  check('B1 cek << >> tetap lolos', !!byLabel(checks, 'seimbang') && byLabel(checks, 'seimbang').ok);

  /* ---------- (c) target tautan rusak ---------- */
  const brokenTarget = built.text.replace('[[Pergi ke Toko|Shop]]', '[[Pergi ke Toko|Nowhere]]');
  checks = V347.verifyOutput(brokenTarget);
  check('C1 cek target GAGAL bila target tidak ada', !!byLabel(checks, 'Target tautan') && !byLabel(checks, 'Target tautan').ok, JSON.stringify(byLabel(checks, 'Target tautan')));
  check('C1 cek nama tetap lolos', !!byLabel(checks, 'Nama passage') && byLabel(checks, 'Nama passage').ok);

  /* ---------- (d) keseimbangan << >> rusak ---------- */
  const brokenAngle = built.text.replace('<</widget>>', '<</widget>');
  checks = V347.verifyOutput(brokenAngle);
  check('D1 cek << >> GAGAL bila penutup hilang', !!byLabel(checks, 'seimbang') && !byLabel(checks, 'seimbang').ok, JSON.stringify(byLabel(checks, 'seimbang')));

  /* ---------- (e) tag <script> rusak ---------- */
  const brokenScript = built.text.replace('</script>', '');
  checks = V347.verifyOutput(brokenScript);
  check('E1 cek <script> GAGAL bila penutup hilang', !!byLabel(checks, '<script>') && !byLabel(checks, '<script>').ok, JSON.stringify(byLabel(checks, '<script>')));

  /* ---------- (f) target dinamis dilewati ---------- */
  const FIX_DYN = FIX.replace('[[Home]]', '[[Home]] [[Go|$next]] [[Go|_tmp]] [[Go|pick()]]');
  S = setupState(FIX_DYN, true, false);
  setTranslations(S, { 'Welcome.': 'Selamat datang.', 'Shop text.': 'Teks toko.', 'Home text.': 'Teks rumah.', 'Widget text': 'Teks widget', 'Go to Shop': 'Pergi ke Toko', 'Home': 'Rumah' });
  const builtDyn = V347.buildOutput();
  checks = V347.verifyOutput(builtDyn.text);
  check('F1 cek target tetap lolos (target dinamis dilewati)', !!byLabel(checks, 'Target tautan') && byLabel(checks, 'Target tautan').ok, JSON.stringify(byLabel(checks, 'Target tautan')));

  /* ---------- (g) mode nama passage aktif: cek nama dilewati ---------- */
  S = setupState(FIX, true, true);
  setTranslations(S, { 'Welcome.': 'Selamat datang.', 'Shop text.': 'Teks toko.', 'Home text.': 'Teks rumah.', 'Widget text': 'Teks widget', 'Go to Shop': 'Pergi ke Toko', 'Home': 'Rumah' });
  const builtNames = V347.buildOutput();
  checks = V347.verifyOutput(builtNames.text);
  check('G1 cek nama TIDAK ADA bila mode nama passage aktif', !byLabel(checks, 'Nama passage'), checks.map((c) => c.label).join(' | '));
  check('G1 cek lain tetap ada', !!byLabel(checks, 'Target tautan') && !!byLabel(checks, 'seimbang') && !!byLabel(checks, '<script>'));

  console.log('\nV347_VERIFY: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
