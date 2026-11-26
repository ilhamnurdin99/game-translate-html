/* Test v3.4.12 — Jumlah pilihan terlihat & ceklis dibersihkan setelah
   terjemah ulang (laporan bug Ilham 2026-11-24: ceklis baris sudah
   dihilangkan tapi klik "Terjemahan custom" tetap menjalankan proses).
   Penyebab: S.selected berlaku global (semua halaman + filter), sementara
   ceklis yang terlihat hanya halaman aktif — pilihan di halaman/filter
   lain tidak kelihatan, tapi tombol tetap aktif dan antrean tetap jalan
   (di screenshot Ilham: "Menerjemahkan ulang 10/15").
   Perbaikan: (1) jumlah "N teks dipilih" tampil di samping tombol
   Terjemahan custom; (2) ceklis dibersihkan setelah terjemah ulang
   selesai (seperti salin di v3.4.9).
   Jalankan: node tests/test_v3412_selection.js (dari root repo).
   Spec:
   1. Hook V3412 + label versi v3.4.12 + Cara pakai menyebut v3.4.12.
   2. 2 baris diceklis -> "2 teks dipilih" tampil, tombol aktif.
   3. Filter pencarian menyembunyikan semua baris -> tidak ada ceklis
      terlihat, tapi jumlah tetap "2 teks dipilih" dan tombol tetap aktif
      (jebakan lama kini kelihatan, bukan diam-diam jalan).
   4. Semua ceklis terlihat dihilangkan -> jumlah hilang, tombol nonaktif.
   5. Terjemah ulang sukses -> ceklis dibersihkan, jumlah hilang, tombol
      nonaktif (klik kedua tidak mengulang teks yang sama).
   6. Terjemah ulang ditolak (semua mesin mati) -> ceklis dipertahankan,
      supaya bisa diperbaiki lalu diulang.
   7. Tombol "Hapus pilihan" membersihkan semua pilihan di semua halaman
      (nonaktif bila tidak ada yang dipilih). */
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

  const V3412 = w.__GTHTML_V3412__;
  const V3410 = w.__GTHTML_V3410__;
  const V348 = w.__GTHTML_V348__;
  const V344 = w.__GTHTML_V344__;
  const V31 = w.__GTHTML_V31__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.12 tersedia', !!V3412 && typeof V3412.updateSelCount === 'function', 'hook: ' + typeof V3412);
  check('A0 hook v3.4.12 mengekspos clearSelection', !!V3412 && typeof V3412.clearSelection === 'function', 'hook: ' + typeof V3412);
  check('A0 label versi v3.4.27', html.includes('Game Translate HTML v3.4.27') && !html.includes('Game Translate HTML v3.4.26'));
  check('A0 Cara pakai menyebut v3.4.12', html.includes('(v3.4.12)'));
  if (!V3412 || typeof V3412.updateSelCount !== 'function') { console.log('\nV3412_SELECTION: updateSelCount belum diekspos di hook v3.4.12 — RED'); process.exit(1); }

  /* ---------- mock fetch (pola v3.4.10, minimal: hanya Google sukses) ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('translate.googleapis.com')) {
      const qs = new URL(u).searchParams.getAll('q');
      return okRes([qs.map((t) => [['ID:' + t]])]);
    }
    if (u.includes('localhost:3001')) return errRes(500);
    if (u.includes('clients5.google.com')) return errRes(500);
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };
  V31.setRetrySleep(() => Promise.resolve());
  function setEngines(sel) {
    V344.setEngineSel(Object.assign({ custom: false, google: false, dict: false, edge: false, mymemory: false, chrome: false }, sel));
    V31.setCustomCfg({ enabled: !!sel.custom, baseUrl: 'http://localhost:3001/v1', apiKey: 'k-test', model: 'm-test' });
    V31.resetCircuitBreaker();
  }

  const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Rose\n\nHello world.\n\nJohn went home.\n\nHello $name.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="SkipMe" tags="" position="200,100" size="100,100">Skip this text.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  function setupState() {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(["SkipMe"]); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = []; S.running = false; S.cancelled = false;');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  const segByText = (S, t) => S.segments.find((s) => s.text === t);
  const trOf = (S, t) => { const s = segByText(S, t); return s ? S.translations.get(s.id) : undefined; };
  const selectIds = (S, texts) => {
    w.eval('S.selected = new Set(' + JSON.stringify(texts.map((t) => segByText(S, t).id)) + '); renderList();');
  };
  const visibleChecked = () => [...w.document.querySelectorAll('.sel:checked')].length;
  const selCountText = () => ($('selCount') || { textContent: '' }).textContent;

  /* ---------- 2: jumlah tampil saat ada yang diceklis ---------- */
  let S = setupState();
  check('B2 awal: tidak ada yang dipilih, jumlah kosong, tombol nonaktif', S.selected.size === 0 && selCountText() === '' && $('btnRetranslate').disabled === true, 'count: "' + selCountText() + '"');
  selectIds(S, ['Hello world.', 'John went home.']);
  check('B2 2 diceklis: jumlah "2 teks dipilih"', selCountText() === '2 teks dipilih', 'count: "' + selCountText() + '"');
  check('B2 2 diceklis: tombol Terjemahan custom aktif', $('btnRetranslate').disabled === false, 'disabled: ' + $('btnRetranslate').disabled);
  check('B2 2 diceklis: 2 ceklis terlihat di halaman', visibleChecked() === 2, 'terlihat: ' + visibleChecked());

  /* ---------- 3: filter menyembunyikan baris -> jebakan lama kini kelihatan ---------- */
  w.eval('S.listQuery = "zzzz-tidak-cocok"; renderList();');
  check('B3 filter aktif: tidak ada ceklis terlihat di halaman', visibleChecked() === 0, 'terlihat: ' + visibleChecked());
  check('B3 filter aktif: jumlah tetap "2 teks dipilih"', selCountText() === '2 teks dipilih', 'count: "' + selCountText() + '"');
  check('B3 filter aktif: tombol tetap aktif (pilihan tersembunyi masih ada)', $('btnRetranslate').disabled === false, 'disabled: ' + $('btnRetranslate').disabled);
  w.eval('S.listQuery = ""; renderList();');
  check('B3 filter dihapus: 2 ceklis terlihat lagi', visibleChecked() === 2, 'terlihat: ' + visibleChecked());

  /* ---------- 4: semua ceklis terlihat dihilangkan -> tombol mati ---------- */
  for (const cb of [...w.document.querySelectorAll('.sel:checked')]) {
    cb.checked = false;
    cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  check('B4 semua dihilangkan: S.selected kosong', S.selected.size === 0, 'selected: ' + S.selected.size);
  check('B4 semua dihilangkan: jumlah kosong', selCountText() === '', 'count: "' + selCountText() + '"');
  check('B4 semua dihilangkan: tombol Terjemahan custom nonaktif', $('btnRetranslate').disabled === true, 'disabled: ' + $('btnRetranslate').disabled);

  /* ---------- 5: terjemah ulang sukses -> ceklis dibersihkan ---------- */
  S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  S.translations.set(segByText(S, 'John went home.').id, { text: 'John pulang.', via: 'Google' });
  setEngines({ google: true });
  selectIds(S, ['Hello world.', 'John went home.']);
  check('B5 pra-syarat: 2 dipilih sebelum terjemah ulang', S.selected.size === 2 && selCountText() === '2 teks dipilih', 'count: "' + selCountText() + '"');
  const r5 = await V3410.retranslateSelected();
  check('B5 terjemah ulang: 2 diganti', !!r5 && r5.replaced === 2 && r5.kept === 0, JSON.stringify(r5));
  check('B5 setelah selesai: ceklis dibersihkan', S.selected.size === 0, 'selected: ' + S.selected.size);
  check('B5 setelah selesai: jumlah kosong', selCountText() === '', 'count: "' + selCountText() + '"');
  check('B5 setelah selesai: tombol nonaktif (klik kedua tidak mengulang)', $('btnRetranslate').disabled === true, 'disabled: ' + $('btnRetranslate').disabled);
  check('B5 terjemahan tetap diganti', trOf(S, 'Hello world.') && trOf(S, 'Hello world.').text === 'ID:Hello world.', JSON.stringify(trOf(S, 'Hello world.')));

  /* ---------- 6: ditolak (semua mesin mati) -> ceklis dipertahankan ---------- */
  S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  setEngines({});
  selectIds(S, ['Hello world.']);
  const r6 = await V3410.retranslateSelected();
  check('B6 mesin mati: 0 diganti, 0 dipertahankan', !!r6 && r6.replaced === 0 && r6.kept === 0, JSON.stringify(r6));
  check('B6 mesin mati: ceklis dipertahankan untuk diulang nanti', S.selected.size === 1 && selCountText() === '1 teks dipilih', 'selected: ' + S.selected.size + ' count: "' + selCountText() + '"');

  /* ---------- 7: tombol Hapus pilihan membersihkan semua ---------- */
  S = setupState();
  check('B7 awal: Hapus pilihan nonaktif saat tidak ada yang dipilih', $('btnClearSel').disabled === true, 'disabled: ' + $('btnClearSel').disabled);
  selectIds(S, ['Hello world.', 'John went home.']);
  check('B7 pra-syarat: 2 dipilih, Hapus pilihan aktif', S.selected.size === 2 && $('btnClearSel').disabled === false && selCountText() === '2 teks dipilih', 'selected: ' + S.selected.size + ' disabled: ' + $('btnClearSel').disabled);
  $('btnClearSel').click();
  check('B7 setelah klik: semua pilihan hilang', S.selected.size === 0, 'selected: ' + S.selected.size);
  check('B7 setelah klik: jumlah kosong', selCountText() === '', 'count: "' + selCountText() + '"');
  check('B7 setelah klik: Hapus pilihan nonaktif lagi', $('btnClearSel').disabled === true, 'disabled: ' + $('btnClearSel').disabled);
  check('B7 setelah klik: tombol Salin + Terjemahan custom nonaktif', $('btnCopyOrig').disabled === true && $('btnRetranslate').disabled === true, 'copy: ' + $('btnCopyOrig').disabled + ' retranslate: ' + $('btnRetranslate').disabled);

  console.log('\nV3412_SELECTION: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
