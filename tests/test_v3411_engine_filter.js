/* Test v3.4.11 — Filter mesin di dropdown Daftar Teks (ide Ilham).
   Jalankan: node tests/test_v3411_engine_filter.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook V3411 + opsi via: + label v3.4.11
   belum ada), lalu perbaikan minimal.
   Spec (ide-filter-mesin-v3411.md):
   1. Ruang lingkup via:Google Dict + pencarian kosong -> hanya baris Dict.
   2. via:TM -> hanya baris TM; via:salin -> hanya baris salin.
   3. via:Google + kata 'hello' -> baris Google yang mengandung hello ikut,
      baris Dict yang mengandung hello tidak ikut (kata dicari di asli ATAU
      terjemahan, seperti ruang lingkup 'all').
   4. 'all'/'orig'/'tr' perilakunya tidak berubah.
   5. Baris belum diterjemahkan/gagal/skipped tidak pernah muncul di ruang
      lingkup mesin; pesan kosong menyebut mesinnya.
   6. Pilih mesin lalu kembali ke 'all' lewat event change -> daftar penuh.
   7. File baru mereset ruang lingkup mesin ke 'all' (pola "file baru =
      pencarian baru" v3.4.4). */
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

  const V3411 = w.__GTHTML_V3411__;
  const V348 = w.__GTHTML_V348__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.11 tersedia', !!V3411 && typeof V3411.filteredSegs === 'function' && typeof V3411.listFilterMatches === 'function', 'hook: ' + typeof V3411);
  check('A0 label versi v3.4.17', html.includes('Game Translate HTML v3.4.17') && !html.includes('Game Translate HTML v3.4.13'));
  check('A0 Cara pakai menyebut v3.4.11', html.includes('Filter mesin di Daftar Teks (v3.4.11)'));
  if (!V3411 || typeof V3411.filteredSegs !== 'function') { console.log('\nV3411_ENGINE_FILTER: filteredSegs belum diekspos di hook v3.4.11 — RED'); process.exit(1); }

  const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Rose\n\nHello world.\n\nJohn went home.\n\nHello $name.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="SkipMe" tags="" position="200,100" size="100,100">Skip this text.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  function setupState() {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(["SkipMe"]); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = [];');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  const segByText = (S, t) => S.segments.find((s) => s.text === t);
  const textsOf = (segs) => segs.map((s) => s.text);
  const setTr = (S, text, tr) => { const s = segByText(S, text); if (s) S.translations.set(s.id, tr); };

  /* ---------- D0: dropdown berisi optgroup mesin/sumber ---------- */
  const sel = $('listSearchScope');
  const optValues = Array.from(sel.querySelectorAll('option')).map((o) => o.value);
  check('D0 dropdown berisi opsi via: mesin/sumber', ['via:Custom', 'via:Google', 'via:Google Dict', 'via:Edge', 'via:MyMemory', 'via:Chrome', 'via:TM', 'via:salin'].every((v) => optValues.includes(v)) && optValues.includes('all') && optValues.includes('orig') && optValues.includes('tr'), JSON.stringify(optValues));
  const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => g.label);
  check('D0 dropdown berisi optgroup Mesin + Sumber lain', groups.includes('Mesin') && groups.includes('Sumber lain'), JSON.stringify(groups));

  /* ---------- 1: via:Google Dict + pencarian kosong ---------- */
  let S = setupState();
  setTr(S, 'Hello world.', { text: 'Halo dunia.', via: 'Google' });
  setTr(S, 'John went home.', { text: 'John pulang.', via: 'Google Dict' });
  setTr(S, 'Rose', { text: 'Mawar', via: 'Google Dict' });
  setTr(S, 'Hello $name.', { text: 'Halo.', via: 'Chrome' });
  S.listScope = 'via:Google Dict'; S.listQuery = '';
  check('D1 via:Google Dict + kosong -> hanya baris Dict', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['Rose', 'John went home.']), JSON.stringify(textsOf(V3411.filteredSegs())));

  /* ---------- 2: via:TM dan via:salin ---------- */
  S = setupState();
  setTr(S, 'Hello world.', { text: 'Halo dunia.', via: 'TM' });
  setTr(S, 'Rose', { text: 'Rose', via: 'salin' });
  setTr(S, 'John went home.', { text: 'John pulang.', via: 'Google' });
  S.listScope = 'via:TM'; S.listQuery = '';
  check('D2 via:TM -> hanya baris TM', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['Hello world.']), JSON.stringify(textsOf(V3411.filteredSegs())));
  S.listScope = 'via:salin'; S.listQuery = '';
  check('D2 via:salin -> hanya baris salin', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['Rose']), JSON.stringify(textsOf(V3411.filteredSegs())));

  /* ---------- 3: via:Google + kata ---------- */
  S = setupState();
  setTr(S, 'Hello world.', { text: 'Halo dunia.', via: 'Google' });
  setTr(S, 'Hello $name.', { text: 'Halo $name.', via: 'Google Dict' });
  setTr(S, 'John went home.', { text: 'John pulang.', via: 'Google' });
  S.listScope = 'via:Google'; S.listQuery = 'hello';
  check('D3 via:Google + hello -> hanya Google yang mengandung hello', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['Hello world.']), JSON.stringify(textsOf(V3411.filteredSegs())));
  S.listQuery = 'pulang';
  check('D3 via:Google + pulang -> cocok lewat terjemahan (pola all)', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['John went home.']), JSON.stringify(textsOf(V3411.filteredSegs())));

  /* ---------- 4: all/orig/tr tidak berubah ---------- */
  S = setupState();
  setTr(S, 'Hello world.', { text: 'Halo dunia.', via: 'Google' });
  setTr(S, 'Hello $name.', { text: 'Halo $name.', via: 'Google Dict' });
  S.listQuery = '';
  S.listScope = 'all';
  check('D4 all + kosong -> semua 5 tampil', V3411.filteredSegs().length === 5, 'dapat: ' + V3411.filteredSegs().length);
  S.listQuery = 'hello'; S.listScope = 'orig';
  check('D4 orig + hello -> hanya yang aslinya mengandung hello', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['Hello world.', 'Hello $name.']), JSON.stringify(textsOf(V3411.filteredSegs())));
  S.listQuery = 'halo'; S.listScope = 'tr';
  check('D4 tr + halo -> hanya yang terjemahannya mengandung halo', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['Hello world.', 'Hello $name.']), JSON.stringify(textsOf(V3411.filteredSegs())));

  /* ---------- 5: belum diterjemahkan/gagal/skipped tidak muncul ---------- */
  S = setupState();
  setTr(S, 'Hello world.', { text: 'Halo dunia.', via: 'Google' });
  setTr(S, 'John went home.', { text: '', via: 'gagal:mesin', failed: true });
  setTr(S, 'Skip this text.', { text: 'Lewati ini.', via: 'Google' });
  // 'Rose' sengaja dibiarkan tanpa terjemahan.
  S.listScope = 'via:Google'; S.listQuery = '';
  check('D5 via:Google tanpa Rose (kosong), John (gagal), Skip (dilewati)', JSON.stringify(textsOf(V3411.filteredSegs())) === JSON.stringify(['Hello world.']), JSON.stringify(textsOf(V3411.filteredSegs())));
  S.listScope = 'via:MyMemory'; S.listQuery = '';
  w.eval('renderList();');
  check('D5 via:MyMemory kosong -> daftar kosong + pesan menyebut mesin', V3411.filteredSegs().length === 0 && ($('listBody') || { textContent: '' }).textContent.includes('MyMemory'), 'body: ' + ($('listBody') || { textContent: '' }).textContent.slice(0, 200));

  /* ---------- 6: event change kembali ke all ---------- */
  S = setupState();
  setTr(S, 'Hello world.', { text: 'Halo dunia.', via: 'Google' });
  setTr(S, 'John went home.', { text: 'John pulang.', via: 'Google Dict' });
  const scopeEl = $('listSearchScope');
  scopeEl.value = 'via:Google Dict';
  scopeEl.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('D6 change ke via:Google Dict -> S.listScope ikut + daftar tersaring', S.listScope === 'via:Google Dict' && V3411.filteredSegs().length === 1, 'scope: ' + S.listScope + ', n: ' + V3411.filteredSegs().length);
  scopeEl.value = 'all';
  scopeEl.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('D6 change kembali ke all -> daftar penuh lagi', S.listScope === 'all' && V3411.filteredSegs().length === 5, 'scope: ' + S.listScope + ', n: ' + V3411.filteredSegs().length);

  /* ---------- 7: file baru mereset ruang lingkup mesin ---------- */
  S = setupState();
  S.listScope = 'via:Google Dict';
  const scopeEl2 = $('listSearchScope');
  scopeEl2.value = 'via:Google Dict';
  await w.loadFile(new w.File([FIX], 'baru.html', { type: 'text/html' }));
  check('D7 loadFile mereset S.listScope ke all', S.listScope === 'all', 'scope: ' + S.listScope);
  check('D7 loadFile mereset dropdown ke all', scopeEl2.value === 'all', 'value: ' + scopeEl2.value);

  console.log('\nV3411_ENGINE_FILTER: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
