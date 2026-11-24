/* Test v3.4.7 — Prioritas 8, butir kecil (F10/F09/F19/F20/F11/F18/F04/F05/F07).
   TDD: tiap butir ditulis gagal dulu, lalu perbaikan minimal.
   Jalankan: node tests/test_v347_small.js (dari root repo).
   (v3.4.7) v3.4.6 -> v3.4.7: F10 hapus simpanan menunggu idbDelete. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); }
}
async function waitFor(fn, tries = 60) {
  for (let i = 0; i < tries; i++) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); }
  return false;
}
async function main() {
  check('A0 label versi v3.4.13', html.includes('Game Translate HTML v3.4.13') && !html.includes('Game Translate HTML v3.4.12'));

  /* ---------- F10: hapus simpanan menunggu idbDelete ---------- */
  // Seed proyek tersimpan di localStorage SEBELUM init jalan, supaya
  // banner + listener hapus ada. Di jsdom IndexedDB tidak ada, jadi
  // idbDelete() selesai lewat janji yang ditolak lalu ditangkap.
  const seed = { v: 1, fileName: 'test.html', ts: Date.now(), segments: [{ id: 's1', text: 'Halo' }], translations: [['s1', { text: 'Hello', via: 'Google' }]] };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) { window.localStorage.setItem('gthtml_v1', JSON.stringify(seed)); },
  });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  const logText = () => ($('logBox') || { textContent: '' }).textContent;
  await waitFor(() => logText().includes('Acorn'));
  const bannerShown = await waitFor(() => $('savedBanner') && !$('savedBanner').classList.contains('hidden'));
  check('F10 banner simpanan tampil dari seed localStorage', bannerShown, $('savedInfo') && $('savedInfo').textContent);
  if (bannerShown) {
    $('btnDeleteSaved').click();
    // Handler baru menunggu idbDelete() dulu: banner MASIH tampil
    // tepat setelah klik (yang lama menyembunyikannya seketika).
    check('F10 banner masih tampil tepat setelah klik (menunggu hapus)', !$('savedBanner').classList.contains('hidden'));
    check('F10 kunci localStorage masih ada tepat setelah klik', w.localStorage.getItem('gthtml_v1') !== null);
    await new Promise((r) => setTimeout(r, 50));
    check('F10 banner hilang setelah hapus selesai', $('savedBanner').classList.contains('hidden'));
    check('F10 kunci localStorage ikut terhapus', w.localStorage.getItem('gthtml_v1') === null);
    check('F10 log hapus muncul setelah selesai', logText().includes('Simpanan proyek dihapus.'));
  }

  /* ---------- F09: kunci keep-map doScan + rawStart ---------- */
  const FIX09 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Home\n\n[[Home]]</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="Home" tags="" position="200,100" size="100,100">You are home.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  const dom9 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w9 = dom9.window;
  const V347_9 = w9.__GTHTML_V347__;
  const log9 = () => (w9.document.getElementById('logBox') || { textContent: '' }).textContent;
  await waitFor(() => log9().includes('Acorn'));
  w9.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX09) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = true; S.linkNoBodyTargets = [];');
  w9.eval('segCounter = 0; doScan(); renderList();');
  const S9 = V347_9.state;
  const homes = S9.segments.filter((s) => s.text === 'Home' && s.passage === 'Start');
  check('F09 ada dua segmen "Home" (teks biasa + [[Home]]) di passage sama', homes.length === 2, JSON.stringify(S9.segments.map((s) => [s.text, s.kind, s.singleLink || false, s.rawStart])));
  const plain9 = homes.find((s) => !s.singleLink);
  const link9 = homes.find((s) => s.singleLink);
  check('F09 kedua segmen jenis sama tapi rawStart beda', !!plain9 && !!link9 && plain9.kind === link9.kind && plain9.rawStart !== link9.rawStart);
  if (plain9 && link9) {
    S9.translations.set(plain9.id, { text: 'Rumah', via: 'tes' });
    S9.translations.set(link9.id, { text: 'Beranda', via: 'tes' });
    w9.eval('doScan(); renderList();');
    const S9b = V347_9.state;
    const homes2 = S9b.segments.filter((s) => s.text === 'Home' && s.passage === 'Start');
    const plain2 = homes2.find((s) => !s.singleLink);
    const link2 = homes2.find((s) => s.singleLink);
    check('F09 pindai ulang: teks biasa tetap "Rumah"', !!(plain2 && S9b.translations.get(plain2.id) && S9b.translations.get(plain2.id).text === 'Rumah'), plain2 && S9b.translations.get(plain2.id) && S9b.translations.get(plain2.id).text);
    check('F09 pindai ulang: [[Home]] tetap "Beranda"', !!(link2 && S9b.translations.get(link2.id) && S9b.translations.get(link2.id).text === 'Beranda'), link2 && S9b.translations.get(link2.id) && S9b.translations.get(link2.id).text);
  }

  /* ---------- F19: throttle saveProject di translateSegments ---------- */
  const dom19 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w19 = dom19.window;
  const V31_19 = w19.__GTHTML_V31__;
  const V344_19 = w19.__GTHTML_V344__;
  const V347_19 = w19.__GTHTML_V347__;
  const log19 = () => (w19.document.getElementById('logBox') || { textContent: '' }).textContent;
  await waitFor(() => log19().includes('Acorn'));
  const okRes19 = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes19 = (status) => ({ ok: false, status, json: async () => ({}) });
  w19.fetch = async (url) => {
    const u = String(url);
    if (u.includes('translate.googleapis.com')) {
      const qs = new URL(u).searchParams.getAll('q');
      return okRes19([qs.map((t) => [['ID:' + t]])]);
    }
    return errRes19(500);
  };
  V31_19.setRetrySleep(() => Promise.resolve());
  w19.sleep = () => Promise.resolve(); // jeda antar batch 1200ms -> instan
  V344_19.setEngineSel({ custom: false, google: true, dict: false, edge: false, mymemory: false, chrome: false });
  V31_19.setCustomCfg({ enabled: false, baseUrl: '', apiKey: '', model: '' });
  V31_19.resetCircuitBreaker();
  let saves19 = 0;
  const origSave19 = w19.saveProject;
  w19.saveProject = (...a) => { saves19++; return origSave19(...a); };
  const setup19 = (n) => {
    const body = Array.from({ length: n }, (_, i) => 'Kalimat nomor ' + (i + 1) + ' untuk pengujian.').join('\n\n');
    const fix = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
      + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
      + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">' + body + '</tw-passagedata>\n'
      + '</tw-storydata></body></html>';
    w19.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = [];');
    w19.eval('segCounter = 0; doScan(); renderList();');
    return V347_19.state;
  };
  let S19 = setup19(105);
  check('F19 fixture 105 teks terpindai', S19.segments.length === 105, String(S19.segments.length));
  saves19 = 0;
  await V347_19.translateSegments(S19.segments.slice());
  const failed19 = S19.segments.filter((s) => { const t = S19.translations.get(s.id); return !t || t.failed; }).length;
  check('F19 105 teks: semua berhasil', failed19 === 0, failed19 + ' gagal');
  check('F19 105 teks (11 batch): saveProject 2x (batch ke-10 + akhir)', saves19 === 2, saves19 + 'x');
  S19 = setup19(25);
  check('F19 fixture 25 teks terpindai', S19.segments.length === 25, String(S19.segments.length));
  saves19 = 0;
  await V347_19.translateSegments(S19.segments.slice());
  check('F19 25 teks (3 batch): saveProject 1x (akhir saja)', saves19 === 1, saves19 + 'x');
  w19.saveProject = origSave19;

  /* ---------- F20: penjaga kedalaman + doScan aman ---------- */
  const dom20 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w20 = dom20.window;
  const V347_20 = w20.__GTHTML_V347__;
  const log20 = () => (w20.document.getElementById('logBox') || { textContent: '' }).textContent;
  await waitFor(() => log20().includes('Acorn'));
  const setup20 = (body, format) => {
    const fix = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
      + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="' + format + '" format-version="3.3.8" options="" hidden>\n'
      + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">' + body + '</tw-passagedata>\n'
      + '</tw-storydata></body></html>';
    w20.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = [];');
    w20.eval('segCounter = 0; doScan(); renderList();');
    return V347_20.state;
  };
  // F20a: 2000 hook Harlowe bersarang — tanpa penjaga kedalaman ini
  // melempar RangeError (tumpukan penuh). Dengan penjaga, pindai selesai:
  // 50 level pertama tetap jadi segmen; sisanya dirutekan sebagai teks
  // biasa (lump 22KB-nya ditolak aturan lama "teks >3000 karakter" —
  // bukan salah penjaga; pada 60 level lump-nya kecil dan ikut jadi segmen).
  const nest20 = (n) => {
    let b = '';
    for (let i = 1; i <= n; i++) b += '[Teks ' + i + ' ';
    return b + 'Teks dalam.' + ']'.repeat(n);
  };
  let S20, threw20 = null;
  try { S20 = setup20(nest20(2000), 'Harlowe'); }
  catch (e) { threw20 = e; }
  check('F20a 2000 hook bersarang tidak menumpuk stack', threw20 === null, threw20 && threw20.message);
  check('F20a 50 level pertama tetap jadi segmen', !!S20 && S20.segments.length === 50 && S20.segments[0].text === 'Teks 1' && S20.segments[49].text === 'Teks 50', S20 && S20.segments.length + ' segmen');
  let S20c = null;
  try { S20c = setup20(nest20(60), 'Harlowe'); } catch (e) { /* sudah dipin di atas */ }
  check('F20a teks dalam sarang 60 level tetap jadi segmen', !!S20c && S20c.segments.some((s) => s.text.includes('Teks dalam.')), S20c && JSON.stringify(S20c.segments.slice(-1).map((s) => s.text.slice(0, 80))));
  // F20b: bila scanFile melempar, doScan tidak meruntuhkan handler —
  // segmen lama dipertahankan dan ada log gagal.
  const S20b = setup20('Teks biasa untuk pengujian.', 'SugarCube');
  const keepCount = S20b.segments.length;
  const keepFirst = S20b.segments[0] && S20b.segments[0].id;
  S20b.translations.set(keepFirst, { text: 'Terjemahan lama', via: 'tes' });
  const origScan20 = w20.scanFile;
  w20.scanFile = () => { throw new Error('pindai rusak'); };
  let threw20b = null;
  try { w20.eval('doScan();'); } catch (e) { threw20b = e; }
  w20.scanFile = origScan20;
  check('F20b doScan tidak melempar saat scanFile gagal', threw20b === null, threw20b && threw20b.message);
  check('F20b segmen lama dipertahankan', V347_20.state.segments.length === keepCount && V347_20.state.segments[0].id === keepFirst);
  check('F20b terjemahan lama dipertahankan', V347_20.state.translations.get(keepFirst) && V347_20.state.translations.get(keepFirst).text === 'Terjemahan lama');
  check('F20b log pindai gagal muncul', log20().includes('Pindai gagal'));
  // F20c: emitPlainRun dengan kedalaman berlebih -> isi diperlakukan
  // sebagai teks biasa (bukan rekursi lagi), teks tetap jadi segmen.
  check('F20c emitPlainRun + harloweWalk diekspos untuk pengujian', typeof V347_20.emitPlainRun === 'function' && typeof V347_20.harloweWalk === 'function');
  if (typeof V347_20.emitPlainRun === 'function') {
    const runText = '@@.a;Teks dalam.@@';
    const map20 = Array.from({ length: runText.length + 1 }, (_, i) => i);
    const parts20 = [];
    V347_20.emitPlainRun(parts20, runText, 0, map20, 0, { kind: 'twine', passage: 'Start', engineKind: 'sugarcube', atSpan: false }, 60);
    check('F20c isi span pada kedalaman 60 tetap jadi segmen', parts20.some((s) => s.text === 'Teks dalam.'), JSON.stringify(parts20.map((s) => s.text)));
  }
  // F20d: batas kedalaman didefinisikan sekali dan dipakai ketiga fungsi.
  check('F20d konstanta batas kedalaman ada (50)', /SCAN_MAX_DEPTH\s*=\s*50/.test(html));
  check('F20d penjaga dipakai di harloweWalk/harlowePlainGap/emitPlainRun', (html.match(/SCAN_MAX_DEPTH/g) || []).length >= 4);

  /* ---------- F11: hapus extractPlaceholders yang mati ---------- */
  check('F11 extractPlaceholders sudah dihapus (tidak ada pemanggil)', !html.includes('extractPlaceholders'));

  /* ---------- F18: pelari tes ---------- */
  const pkg18 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  check('F18 package.json ada + script test memanggil runner', pkg18.scripts && pkg18.scripts.test === 'node tests/run_tests.js' && pkg18.version === '3.4.7');
  check('F18 tests/run_tests.js ada', fs.existsSync(path.join(__dirname, 'run_tests.js')));

  /* ---------- F04: qaCollect bersama untuk qaAll/qaAllChunked ---------- */
  const qaCallSites = html.split('\n').filter((l) => l.includes('qaSegment(seg)') && !l.trim().startsWith('function qaSegment')).length;
  check('F04 helper qaCollect ada dan loop qaSegment hanya sekali', html.includes('function qaCollect') && qaCallSites === 1, qaCallSites + ' situs panggil');
  const dom04 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w04 = dom04.window;
  const V342_04 = w04.__GTHTML_V342__;
  const log04 = () => (w04.document.getElementById('logBox') || { textContent: '' }).textContent;
  await waitFor(() => log04().includes('Acorn'));
  const FIX04 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Halo $nama, selamat datang.\n\nTeks biasa kedua.\n\nTeks ketiga yang dilewati.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  w04.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX04) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = [];');
  w04.eval('segCounter = 0; doScan(); renderList();');
  const S04 = V342_04.state;
  const s04a = S04.segments.find((s) => s.text.includes('$nama'));
  const s04c = S04.segments.find((s) => s.text.includes('dilewati'));
  check('F04 fixture terpindai (3 segmen)', S04.segments.length === 3 && !!s04a && !!s04c, S04.segments.length + ' segmen');
  if (s04a && s04c) {
    S04.translations.set(s04a.id, { text: 'Halo, selamat datang.', via: 'tes' }); // $nama hilang
    s04c.skipped = true;
    const rowsSync = V342_04.qaAll();
    const rowsChunked = await V342_04.qaAllChunked();
    const key = (rows) => JSON.stringify(rows.map((r) => [r.seg.id, r.issues]));
    check('F04 qaAll menemukan 2 masalah (variabel hilang + belum diterjemahkan)', rowsSync.length === 2 && rowsSync[0].issues.some((i) => i.includes('variabel hilang')) && rowsSync[1].issues.includes('belum diterjemahkan'), key(rowsSync));
    check('F04 qaAllChunked hasilnya identik dengan qaAll', key(rowsChunked) === key(rowsSync), key(rowsChunked));
  }

  /* ---------- F05: ENGINE_SEL_DEFAULT ---------- */
  const defLit05 = (html.match(/\{ custom: true, google: true, dict: true, edge: true, mymemory: true, chrome: true \}/g) || []).length;
  check('F05 konstanta ENGINE_SEL_DEFAULT ada', html.includes('const ENGINE_SEL_DEFAULT = { custom: true, google: true, dict: true, edge: true, mymemory: true, chrome: true }'));
  check('F05 literal default hanya sekali (di definisi konstanta)', defLit05 === 1, defLit05 + ' kemunculan');
  check('F05 CB_LABEL sudah tidak ada (dihapus di F02)', !html.includes('CB_LABEL'));
  const dom05 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w05 = dom05.window;
  const V344_05 = w05.__GTHTML_V344__;
  const log05 = () => (w05.document.getElementById('logBox') || { textContent: '' }).textContent;
  await waitFor(() => log05().includes('Acorn'));
  // Default parsial dari localStorage: kunci yang hilang ikut default true.
  w05.localStorage.setItem('gthtml_engines_v1', JSON.stringify({ google: false }));
  V344_05.loadEngineSel();
  const sel05 = V344_05.state.engineSel;
  check('F05 loadEngineSel: kunci tersimpan dihormati, sisanya default', sel05.google === false && sel05.custom === true && sel05.dict === true && sel05.edge === true && sel05.mymemory === true && sel05.chrome === true, JSON.stringify(sel05));
  V344_05.setEngineSel({ dict: false });
  check('F05 setEngineSel patch parsial tidak merusak default lain', V344_05.state.engineSel.dict === false && V344_05.state.engineSel.google === false && V344_05.state.engineSel.custom === true, JSON.stringify(V344_05.state.engineSel));

  /* ---------- F07: looksLikeText boolean ---------- */
  const llBody = (html.split('function looksLikeText(s) {')[1] || '').split('\nfunction ')[0];
  check('F07 looksLikeText mengembalikan boolean (tanpa 0/1/2)', !/return [012];/.test(llBody) && /return true;/.test(llBody) && /return false;/.test(llBody));
  check('F07 scanAccepts memakai looksLikeText langsung (tanpa > 0)', !html.includes('looksLikeText(s) > 0') && html.includes('return looksLikeText(s);'));
  const dom07 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w07 = dom07.window;
  const log07 = () => (w07.document.getElementById('logBox') || { textContent: '' }).textContent;
  await waitFor(() => log07().includes('Acorn'));
  const sa07 = w07.GTHTML.scanAccepts;
  check('F07 scanAccepts: teks biasa diterima', sa07('Halo dunia, apa kabar?') === true);
  check('F07 scanAccepts: string kosong ditolak', sa07('') === false);
  check('F07 scanAccepts: karakter kontrol ditolak', sa07('Halo\x01dunia.') === false);
  check('F07 scanAccepts: teks >8000 karakter ditolak', sa07('a '.repeat(5000)) === false);
  check('F07 scanAccepts: res:// ditolak', sa07('res://gambar.png teks') === false);

  console.log('\nV347_SMALL: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
