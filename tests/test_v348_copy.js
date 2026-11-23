/* Test v3.4.8 — Salin teks asli ke terjemahan, bulk (ide Ilham).
   Jalankan: node tests/test_v348_copy.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook V348 + tombol + label v3.4.8 belum ada),
   lalu perbaikan minimal.
   Spec (ide-salin-teks-asli.md):
   1. Salin mengisi yang kosong/gagal saja; yang sudah ada terjemahan bagus
      tidak ditimpa.
   2. Segmen skipped tidak ikut disalin.
   3. qaSegment tidak menandai baris via:'salin' sebagai "sama persis",
      tapi tetap menandai variabel hilang di baris salinan (dan tetap
      menandai baris NON-salin yang sama persis).
   4. Tombol nonaktif saat tidak ada yang diceklis; klik tombol menyalin
      dan log menyebut jumlah yang disalin.
   5. Setelah disalin, segmen tidak masuk untranslatedList() dan tidak
      diterjemahkan ulang oleh run. */
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

  const V348 = w.__GTHTML_V348__;
  const V347 = w.__GTHTML_V347__;
  const V344 = w.__GTHTML_V344__;
  const V31 = w.__GTHTML_V31__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.8 tersedia', !!V348 && typeof V348.copySelectedOriginals === 'function' && typeof V348.qaSegment === 'function' && typeof V348.untranslatedList === 'function', 'hook: ' + typeof V348);
  check('A0 label versi v3.4.11', html.includes('Game Translate HTML v3.4.11') && !html.includes('Game Translate HTML v3.4.10'));
  check('A0 Cara pakai menyebut v3.4.8', html.includes('Salin teks asli ke terjemahan (v3.4.8)'));
  if (!V348 || typeof V348.copySelectedOriginals !== 'function') { console.log('\nV348_COPY: copySelectedOriginals belum diekspos di hook v3.4.8 — RED'); process.exit(1); }

  /* ---------- mock fetch + mesin (pola v3.4.4 / test_v347_gaps.js) ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('translate.googleapis.com')) {
      const qs = new URL(u).searchParams.getAll('q');
      if (qs.length === 1 && qs[0].includes('ZXQSEP')) return okRes([[['x ' + qs[0] + ' y']]]);
      return okRes([qs.map((t) => [['ID:' + t]])]);
    }
    if (u.includes('clients5.google.com')) return errRes(500);
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };
  V31.setRetrySleep(() => Promise.resolve());
  function resetEngines() {
    V344.setEngineSel({ custom: false, google: true, dict: false, edge: false, mymemory: false, chrome: false });
    V31.setCustomCfg({ enabled: false, baseUrl: '', apiKey: '', model: '' });
    V31.resetCircuitBreaker();
  }

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
  const trOf = (S, t) => { const s = segByText(S, t); return s ? S.translations.get(s.id) : undefined; };

  /* ---------- 1: isi kosong/gagal saja, jangan timpa yang bagus ---------- */
  let S = setupState();
  const rose = segByText(S, 'Rose'), hello = segByText(S, 'Hello world.'), john = segByText(S, 'John went home.');
  check('B1 fixture: 5 segmen terpindai', S.segments.length === 5, JSON.stringify(S.segments.map((s) => s.text)));
  S.translations.set(hello.id, { text: 'Halo dunia.', via: 'Google' });
  S.translations.set(john.id, { text: '', via: 'gagal', failed: true });
  w.eval('S.selected = new Set(' + JSON.stringify([rose.id, hello.id, john.id]) + ');');
  const n1 = V348.copySelectedOriginals();
  check('B1 salin mengembalikan jumlah 2 (kosong + gagal)', n1 === 2, 'dapat: ' + n1);
  const roseTr = trOf(S, 'Rose');
  check('B1 Rose kosong terisi teks asli via salin', !!roseTr && roseTr.text === 'Rose' && roseTr.via === 'salin' && !roseTr.failed, JSON.stringify(roseTr));
  const johnTr = trOf(S, 'John went home.');
  check('B1 John yang gagal terisi teks asli via salin', !!johnTr && johnTr.text === 'John went home.' && johnTr.via === 'salin' && !johnTr.failed, JSON.stringify(johnTr));
  const helloTr = trOf(S, 'Hello world.');
  check('B1 Hello yang sudah bagus TIDAK ditimpa', !!helloTr && helloTr.text === 'Halo dunia.' && helloTr.via === 'Google', JSON.stringify(helloTr));

  /* ---------- 2: skipped tidak ikut ---------- */
  S = setupState();
  const skip = segByText(S, 'Skip this text.');
  check('B2 segmen SkipMe memang skipped', !!skip && skip.skipped === true);
  w.eval('S.selected = new Set(' + JSON.stringify([skip.id, segByText(S, 'Rose').id]) + ');');
  const n2 = V348.copySelectedOriginals();
  check('B2 salin menghitung 1 (skipped tidak dihitung)', n2 === 1, 'dapat: ' + n2);
  check('B2 segmen skipped tetap tanpa terjemahan', trOf(S, 'Skip this text.') === undefined, JSON.stringify(trOf(S, 'Skip this text.')));

  /* ---------- 3: QA — salin dikecualikan dari "sama persis" saja ---------- */
  S = setupState();
  const roseSeg = segByText(S, 'Rose');
  S.translations.set(roseSeg.id, { text: 'Rose', via: 'salin' });
  const roseIssues = V348.qaSegment(roseSeg);
  check('B3 QA: baris salin TIDAK ditandai "sama persis"', !roseIssues.includes('sama persis dengan aslinya'), JSON.stringify(roseIssues));
  check('B3 QA: baris salin tanpa masalah lain', roseIssues.length === 0, JSON.stringify(roseIssues));
  const helloSeg = segByText(S, 'Hello world.');
  S.translations.set(helloSeg.id, { text: 'Hello world.', via: 'Google' });
  check('B3 QA: baris NON-salin yang sama persis TETAP ditandai', V348.qaSegment(helloSeg).includes('sama persis dengan aslinya'), JSON.stringify(V348.qaSegment(helloSeg)));
  const varSeg = segByText(S, 'Hello $name.');
  S.translations.set(varSeg.id, { text: 'Hello.', via: 'salin' });
  const varIssues = V348.qaSegment(varSeg);
  check('B3 QA: baris salin tetap ditandai variabel hilang', varIssues.some((i) => i.indexOf('variabel hilang') === 0), JSON.stringify(varIssues));
  check('B3 QA: baris salin variabel hilang TIDAK ditandai "sama persis"', !varIssues.includes('sama persis dengan aslinya'), JSON.stringify(varIssues));

  /* ---------- 4: tombol nonaktif + klik nyata + log ---------- */
  S = setupState();
  const btn = $('btnCopyOrig');
  check('B4 tombol Salin ada di DOM', !!btn, 'btnCopyOrig: ' + typeof btn);
  check('B4 tombol nonaktif saat tidak ada yang diceklis', !!btn && btn.disabled === true, 'disabled: ' + (btn && btn.disabled));
  const r2 = segByText(S, 'Rose'), j2 = segByText(S, 'John went home.');
  w.eval('S.selected = new Set(' + JSON.stringify([r2.id, j2.id]) + '); renderList();');
  check('B4 tombol aktif setelah ada yang diceklis', btn.disabled === false, 'disabled: ' + btn.disabled);
  const before = logText().length;
  btn.click();
  check('B4 klik tombol menyalin 2 teks', trOf(S, 'Rose') && trOf(S, 'Rose').text === 'Rose' && trOf(S, 'Rose').via === 'salin' && trOf(S, 'John went home.') && trOf(S, 'John went home.').via === 'salin', JSON.stringify([trOf(S, 'Rose'), trOf(S, 'John went home.')]));
  check('B4 log menyebut jumlah yang disalin', logText().slice(before).includes('Disalin 2 teks asli ke terjemahan.'), logText().slice(before).slice(0, 300));

  /* ---------- 5: tidak masuk antrean ulang ---------- */
  resetEngines();
  S = setupState();
  const r5 = segByText(S, 'Rose');
  S.translations.set(r5.id, { text: 'Rose', via: 'salin' });
  const untr = V348.untranslatedList();
  check('B5 baris salin tidak masuk untranslatedList()', !untr.some((s) => s.id === r5.id), 'untr: ' + JSON.stringify(untr.map((s) => s.text)));
  await V347.runTranslate('all');
  const roseAfter = trOf(S, 'Rose');
  check('B5 run tidak mengubah baris salin', !!roseAfter && roseAfter.text === 'Rose' && roseAfter.via === 'salin', JSON.stringify(roseAfter));
  const helloAfter = trOf(S, 'Hello world.');
  check('B5 run tetap menerjemahkan yang belum disalin', !!helloAfter && helloAfter.text === 'ID:Hello world.' && helloAfter.failed !== true, JSON.stringify(helloAfter));

  /* ---------- 6 (v3.4.9): ceklis dibersihkan setelah salin ---------- */
  S = setupState();
  const r6 = segByText(S, 'Rose'), j6 = segByText(S, 'John went home.');
  w.eval('S.selected = new Set(' + JSON.stringify([r6.id, j6.id]) + '); renderList();');
  check('B6 pra-syarat: 2 diceklis, tombol aktif', S.selected.size === 2 && $('btnCopyOrig').disabled === false, 'selected: ' + S.selected.size);
  const n6 = V348.copySelectedOriginals();
  check('B6 salin berhasil (n=2)', n6 === 2, 'dapat: ' + n6);
  check('B6 ceklis dibersihkan setelah salin', S.selected.size === 0, 'selected: ' + S.selected.size);
  check('B6 "Pilih semua di halaman" tidak tercentang lagi', $('chkAll').checked === false, 'checked: ' + $('chkAll').checked);
  check('B6 tombol salin nonaktif lagi setelah salin', $('btnCopyOrig').disabled === true, 'disabled: ' + $('btnCopyOrig').disabled);
  // Bila tidak ada yang disalin (semua sudah bagus), ceklis dipertahankan.
  S = setupState();
  const h6 = segByText(S, 'Hello world.');
  S.translations.set(h6.id, { text: 'Halo dunia.', via: 'Google' });
  w.eval('S.selected = new Set(' + JSON.stringify([h6.id]) + '); renderList();');
  const n6b = V348.copySelectedOriginals();
  check('B6 tidak ada yang disalin (n=0)', n6b === 0, 'dapat: ' + n6b);
  check('B6 ceklis dipertahankan bila tidak ada yang disalin', S.selected.size === 1 && S.selected.has(h6.id), 'selected: ' + S.selected.size);

  console.log('\nV348_COPY: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
