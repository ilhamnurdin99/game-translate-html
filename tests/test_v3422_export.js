/* Test v3.4.22 — Unduh bahan latihan TSV per ceklis + tanda "!" merah
   "sudah di-download" (ide Ilham 2026-11-25 00:04: ekspor TSV per ceklis
   dari Daftar Teks untuk bahan latihan Agen AI; tanda "!" merah di baris
   yang sudah pernah di-download supaya tidak ke-download dua kali).
   Jalankan: node tests/test_v3422_export.js (dari root repo).
   TDD: tes ditulis gagal dulu (exportSelectedTsv + S.downloaded + tanda
   "!" belum ada), lalu perbaikan minimal.
   Spec (ide-ekspor-bahan-latihan-v3422.md):
   1. Ekspor baris dicentang -> isi TSV benar (baris EN<TAB>ID).
   2. Baris tanpa terjemahan dilewati + dihitung di log.
   3. Baris bertanda dilewati + dihitung di log.
   4. Setelah ekspor, teks Inggris baris yang diekspor ada di
      S.downloaded dan barisnya menampilkan "!" merah.
   5. Penanda bertahan lewat saveProject/load (round-trip proyek).
   6. Segmen baru dengan teks Inggris persis sama menampilkan tanda,
      segmen dengan teks mirip tapi tidak sama TIDAK bertanda.
   7. Tombol nonaktif bila tidak ada yang dicentang.
   8. A0: label versi naik ke v3.4.22. */
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

  const V3422 = w.__GTHTML_V3422__;
  const V33 = w.__GTHTML_V33__;
  const V348 = w.__GTHTML_V348__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.22 tersedia', !!V3422 && typeof V3422.exportSelectedTsv === 'function', 'hook: ' + typeof V3422);
  check('A0 label versi v3.4.27', html.includes('Game Translate HTML v3.4.27') && !html.includes('Game Translate HTML v3.4.26'));
  check('A0 Cara pakai menyebut v3.4.22', html.includes('(v3.4.22)'));
  if (!V3422 || typeof V3422.exportSelectedTsv !== 'function') { console.log('\nV3422_EXPORT: exportSelectedTsv belum diekspos di hook v3.4.22 — RED'); process.exit(1); }

  /* ---------- tangkap download (pola v3.4.7 preview) ---------- */
  let capturedBlob = null, capturedName = null;
  w.URL.createObjectURL = (blob) => { capturedBlob = blob; return 'blob:tsv-test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { capturedName = this.download; };
  const blobText = async () => (capturedBlob ? await capturedBlob.text() : null);

  const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Rose\n\nHello world.\n\nJohn went home.\n\nHello $name.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="SkipMe" tags="" position="200,100" size="100,100">Skip this text.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  function setupState() {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(["SkipMe"]); S.outputText = ""; S.page = 0; S.selected = new Set(); S.downloaded = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = []; S.running = false; S.cancelled = false;');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  const segByText = (S, t) => S.segments.find((s) => s.text === t);
  const setTr = (S, en, id) => { const s = segByText(S, en); if (s) S.translations.set(s.id, { text: id, via: 'Custom' }); };
  const selectTexts = (S, texts) => {
    w.eval('S.selected = new Set(' + JSON.stringify(texts.map((t) => segByText(S, t).id)) + '); renderList();');
  };
  const rowMark = (segId) => {
    const row = w.document.querySelector('.trow[data-id="' + segId + '"]');
    return row ? row.querySelector('.dl-mark') : null;
  };

  /* ---------- D1: ekspor baris dicentang -> isi TSV benar ---------- */
  let S = setupState();
  setTr(S, 'Hello world.', 'Halo dunia.');
  setTr(S, 'John went home.', 'John pulang.');
  selectTexts(S, ['Hello world.', 'John went home.']);
  capturedBlob = null; capturedName = null;
  let r = V3422.exportSelectedTsv();
  let tsv = await blobText();
  check('D1 isi TSV benar (EN<TAB>ID per baris)', tsv === 'Hello world.\tHalo dunia.\nJohn went home.\tJohn pulang.\n', JSON.stringify(tsv));
  check('D1 nama file data-latihan-YYYYMMDD.tsv', /^data-latihan-\d{8}\.tsv$/.test(capturedName || ''), 'nama: ' + capturedName);
  check('D1 log hasil menyebut 2 diekspor 0 0', logText().includes('Unduh TSV: 2 pasangan diekspor, 0 dilewati (sudah di-download), 0 dilewati (belum ada terjemahan).'), logText().slice(-300));
  check('D1 hasil kembalian 2/0/0', r && r.exported === 2 && r.skippedDownloaded === 0 && r.skippedUntr === 0, JSON.stringify(r));
  check('D1 ceklis dipertahankan setelah ekspor', S.selected.size === 2, 'selected: ' + S.selected.size);

  /* ---------- D2: baris tanpa terjemahan dilewati + dihitung ---------- */
  S = setupState();
  setTr(S, 'Hello world.', 'Halo dunia.');
  selectTexts(S, ['Hello world.', 'John went home.']); // John belum ada terjemahan
  capturedBlob = null; capturedName = null;
  r = V3422.exportSelectedTsv();
  tsv = await blobText();
  check('D2 TSV hanya berisi baris yang punya terjemahan', tsv === 'Hello world.\tHalo dunia.\n', JSON.stringify(tsv));
  check('D2 log hasil 1 diekspor 0 1', logText().includes('Unduh TSV: 1 pasangan diekspor, 0 dilewati (sudah di-download), 1 dilewati (belum ada terjemahan).'), logText().slice(-300));
  check('D2 hasil kembalian 1/0/1', r && r.exported === 1 && r.skippedDownloaded === 0 && r.skippedUntr === 1, JSON.stringify(r));

  /* ---------- D3: baris bertanda dilewati + dihitung ---------- */
  S = setupState();
  setTr(S, 'Hello world.', 'Halo dunia.');
  setTr(S, 'John went home.', 'John pulang.');
  S.downloaded.add('Hello world.');
  selectTexts(S, ['Hello world.', 'John went home.']);
  capturedBlob = null; capturedName = null;
  r = V3422.exportSelectedTsv();
  tsv = await blobText();
  check('D3 TSV tidak berisi baris bertanda', tsv === 'John went home.\tJohn pulang.\n', JSON.stringify(tsv));
  check('D3 log hasil 1 diekspor 1 0', logText().includes('Unduh TSV: 1 pasangan diekspor, 1 dilewati (sudah di-download), 0 dilewati (belum ada terjemahan).'), logText().slice(-300));
  check('D3 hasil kembalian 1/1/0', r && r.exported === 1 && r.skippedDownloaded === 1 && r.skippedUntr === 0, JSON.stringify(r));

  /* ---------- D4: setelah ekspor, S.downloaded + "!" merah tampil ---------- */
  S = setupState();
  setTr(S, 'Hello world.', 'Halo dunia.');
  setTr(S, 'John went home.', 'John pulang.');
  selectTexts(S, ['Hello world.', 'John went home.']);
  V3422.exportSelectedTsv();
  check('D4 S.downloaded berisi kedua teks Inggris', S.downloaded.has('Hello world.') && S.downloaded.has('John went home.') && S.downloaded.size === 2, 'downloaded: ' + [...S.downloaded].join(' | '));
  w.eval('renderList();');
  const m1 = rowMark(segByText(S, 'Hello world.').id);
  const m2 = rowMark(segByText(S, 'John went home.').id);
  const m3 = rowMark(segByText(S, 'Hello $name.').id);
  check('D4 baris yang diekspor menampilkan "!"', !!m1 && m1.textContent === '!' && !!m2 && m2.textContent === '!', 'm1: ' + (m1 && m1.textContent) + ', m2: ' + (m2 && m2.textContent));
  check('D4 "!" punya title penjelas', !!m1 && (m1.getAttribute('title') || '').includes('Sudah di-download'), 'title: ' + (m1 && m1.getAttribute('title')));
  check('D4 baris yang tidak diekspor TIDAK bertanda', m3 === null, 'm3: ' + (m3 && m3.textContent));
  check('D4 stylesheet menandai .dl-mark merah', /\.dl-mark\s*\{[^}]*color\s*:\s*#c00/i.test(html) || /\.dl-mark\s*\{[^}]*color\s*:\s*red/i.test(html), 'css .dl-mark tidak ditemukan/merah');

  /* ---------- D5: penanda bertahan lewat save/load proyek ---------- */
  S = setupState();
  setTr(S, 'Hello world.', 'Halo dunia.');
  selectTexts(S, ['Hello world.']);
  V3422.exportSelectedTsv();
  V33.saveProject();
  const d = V33.readLocalStorageProject();
  check('D5 simpanan proyek memuat downloaded', d && Array.isArray(d.downloaded) && d.downloaded.includes('Hello world.'), 'downloaded tersimpan: ' + JSON.stringify(d && d.downloaded));
  w.eval('S.downloaded = new Set();');
  V33.restoreProject(d);
  S = V348.state;
  check('D5 setelah restore, S.downloaded berisi teksnya', S.downloaded.has('Hello world.'), 'downloaded: ' + [...S.downloaded].join(' | '));
  check('D5 setelah restore, baris menampilkan "!"', !!rowMark(segByText(S, 'Hello world.').id), 'mark setelah restore: ' + !!rowMark(segByText(S, 'Hello world.').id));

  /* ---------- D6: cocok persis, bukan mirip ---------- */
  S = setupState();
  S.downloaded.add('Hello world.');
  w.eval('S.segments.push({id:"s90",kind:"text",passage:"Start",text:"Hello world.",rawStart:9000,rawEnd:9012,translatable:true}); S.segments.push({id:"s91",kind:"text",passage:"Start",text:"Hello world!",rawStart:9013,rawEnd:9025,translatable:true}); renderList();');
  check('D6 segmen baru teks persis sama menampilkan tanda', !!rowMark('s90'), 'mark s90: ' + !!rowMark('s90'));
  check('D6 segmen teks mirip tapi tidak sama TIDAK bertanda', rowMark('s91') === null, 'mark s91: ' + !!rowMark('s91'));

  /* ---------- D7: tombol nonaktif bila tidak ada yang dicentang ---------- */
  S = setupState();
  check('D7 tombol nonaktif saat tidak ada pilihan', $('btnExportTsv') && $('btnExportTsv').disabled === true, 'disabled: ' + ($('btnExportTsv') && $('btnExportTsv').disabled));
  setTr(S, 'Hello world.', 'Halo dunia.');
  selectTexts(S, ['Hello world.']);
  check('D7 tombol aktif saat ada yang dicentang', $('btnExportTsv') && $('btnExportTsv').disabled === false, 'disabled: ' + ($('btnExportTsv') && $('btnExportTsv').disabled));
  capturedBlob = null; capturedName = null;
  $('btnExportTsv').dispatchEvent(new w.Event('click', { bubbles: true }));
  tsv = await blobText();
  check('D7 klik tombol mengunduh TSV', tsv === 'Hello world.\tHalo dunia.\n' && /^data-latihan-\d{8}\.tsv$/.test(capturedName || ''), 'tsv: ' + JSON.stringify(tsv) + ', nama: ' + capturedName);

  /* ---------- D8: tab/newline/CR diganti satu spasi ---------- */
  S = setupState();
  w.eval('S.segments.find(s=>s.text===' + JSON.stringify('Hello world.') + ').text=' + JSON.stringify('Hello\tworld.') + ';');
  const segTab = segByText(S, 'Hello\tworld.');
  S.translations.set(segTab.id, { text: 'Halo\r\ndunia.', via: 'Custom' });
  selectTexts(S, ['Hello\tworld.']);
  capturedBlob = null;
  V3422.exportSelectedTsv();
  tsv = await blobText();
  check('D8 tab/newline/CR di dalam teks diganti satu spasi', tsv === 'Hello world.\tHalo dunia.\n', JSON.stringify(tsv));

  console.log('\nV3422_EXPORT: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
