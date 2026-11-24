/* Test v3.4.4 — Pencarian di Daftar Teks.
   Jalankan: node test_v344_search.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) kotak pencarian + pilihan cakupan + tombol hapus ada di DOM;
   (b) listFilterMatches: cocok di asli, di terjemahan, di keduanya,
       tidak cocok, tidak peduli huruf, kurung dicari harfiah,
       query kosong = semua tampil;
   (c) filteredSegs + renderList: hanya baris cocok yang tampil,
       pageInfo "X cocok dari N teks", tanpa cocok = pesan khusus;
   (d) edit manual tetap jalan di baris hasil filter;
   (e) tombol hapus + ganti cakupan lewat event DOM.
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
const G = w.GTHTML;
const V344 = w.__GTHTML_V344__;
const $ = (id) => w.document.getElementById(id);

check('A0 hook v3.4.4 tersedia', !!V344 && typeof V344.listFilterMatches === 'function' && typeof V344.filteredSegs === 'function' && typeof V344.renderList === 'function');
check('A0 label versi v3.4.19', html.includes('Game Translate HTML v3.4.19') && !html.includes('Game Translate HTML v3.4.13'));

const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Beach" tags="" position="100,100" size="100,100">'
  + '[[Hang Out (0:30)|Beach Hang Out]]\n'
  + '[[Brown|Hair Dyed][$Player.HairColorNew to "Brown"]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Walk" tags="" position="200,100" size="100,100">'
  + 'Keep walking here.\n\nRoll _randomRoll now.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
function setupState() {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all";');
  w.eval('doScan();');
  return V344.state;
}
const segByText = (S, t) => S.segments.find((s) => s.text === t);
const rows = () => [...w.document.querySelectorAll('#listBody .trow')].filter((r) => r.querySelector('textarea'));
const rowTexts = () => rows().map((r) => r.querySelector('.orig').textContent);
const fireInput = (el) => el.dispatchEvent(new w.Event('input', { bubbles: true }));
const fireChange = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));

async function main() {
  // Tunggu init() benar-benar selesai: di jsdom, readyState sudah
  // 'interactive' sebelum DOMContentLoaded jalan, jadi pola await
  // readyState langsung lolos padahal listener init belum terpasang.
  // Sinyal init selesai: log Acorn di akhir init().
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  const S = setupState();
  check('A1 4 segmen terpindai', S.segments.filter((s) => s.translatable).length === 4, JSON.stringify(S.segments.map((s) => s.text)));
  // Terjemahan: satu bocor placeholder, satu bersih, dua kosong.
  S.translations.set(segByText(S, 'Brown').id, { text: 'Cokelat {{GL1}}}', via: 'Google' });
  S.translations.set(segByText(S, 'Hang Out (0:30)').id, { text: 'Bersantai (0:30)', via: 'Google Dict' });

  /* ---------- (a) elemen UI ---------- */
  check('A2 kotak pencarian ada', !!$('listSearch') && $('listSearch').placeholder.indexOf('Cari') !== -1);
  check('A2 pilihan cakupan ada (Semua/Teks asli/Terjemahan + mesin v3.4.11)', !!$('listSearchScope') && [...$('listSearchScope').options].map((o) => o.value).join(',') === 'all,orig,tr,via:Custom,via:Google,via:Google Dict,via:Edge,via:MyMemory,via:Chrome,via:TM,via:salin');
  check('A2 cakupan default Semua', $('listSearchScope').value === 'all');
  check('A2 tombol hapus pencarian ada', !!$('btnClearSearch'));

  /* ---------- (b) listFilterMatches ---------- */
  const brown = segByText(S, 'Brown');
  const hang = segByText(S, 'Hang Out (0:30)');
  const walk = segByText(S, 'Keep walking here.');
  const m = V344.listFilterMatches;
  check('B1 cocok di teks asli (brown)', m(brown, 'brown', 'all') === true);
  check('B1 cocok di terjemahan (cokelat)', m(brown, 'cokelat', 'all') === true);
  check('B1 cakupan orig: terjemahan saja tidak cocok', m(brown, 'cokelat', 'orig') === false);
  check('B1 cakupan orig: teks asli cocok', m(brown, 'brown', 'orig') === true);
  check('B1 cakupan tr: teks asli saja tidak cocok', m(brown, 'brown', 'tr') === false);
  check('B1 cakupan tr: terjemahan cocok', m(brown, 'cokelat', 'tr') === true);
  check('B1 tidak peduli huruf (COKELAT)', m(brown, 'COKELAT', 'all') === true);
  check('B1 kurung dicari harfiah ({{GL1}}})', m(brown, '{{GL1}}}', 'all') === true);
  check('B1 kurung di teks asli yang bersih tidak cocok', m(hang, '{{GL1}}}', 'all') === false);
  check('B1 tidak cocok sama sekali', m(walk, 'zebra', 'all') === false);
  check('B1 query kosong = semua tampil', m(walk, '', 'all') === true && m(walk, '   ', 'all') === true);
  check('B1 cocok di keduanya (Hang Out / Bersantai)', m(hang, 'bersantai', 'all') === true && m(hang, 'hang out', 'all') === true);

  /* ---------- (c) filteredSegs + renderList ---------- */
  V344.state.listQuery = '{{GL1}}}'; V344.state.listScope = 'all'; V344.state.page = 0;
  V344.renderList();
  check('C1 cari {{GL1}}}: hanya 1 baris tampil', rows().length === 1, JSON.stringify(rowTexts()));
  check('C1 baris yang tampil adalah Brown', rowTexts()[0] === 'Brown', JSON.stringify(rowTexts()));
  check('C1 pageInfo "1 cocok dari 4 teks"', $('pageInfo').textContent.indexOf('1 cocok dari 4 teks') !== -1, $('pageInfo').textContent);
  V344.state.listQuery = 'bersantai';
  V344.renderList();
  check('C1 cari bersantai (terjemahan): 1 baris Hang Out', rows().length === 1 && rowTexts()[0] === 'Hang Out (0:30)', JSON.stringify(rowTexts()));
  V344.state.listQuery = 'zebra';
  V344.renderList();
  check('C1 tidak cocok: 0 baris + pesan khusus', rows().length === 0 && $('listBody').textContent.indexOf('Tidak ada yang cocok') !== -1, $('listBody').textContent);
  V344.state.listQuery = '';
  V344.renderList();
  check('C1 query kosong: semua 4 baris kembali', rows().length === 4, JSON.stringify(rowTexts()));
  check('C1 pageInfo kembali normal (4 teks)', $('pageInfo').textContent.indexOf('4 teks') !== -1 && $('pageInfo').textContent.indexOf('cocok') === -1, $('pageInfo').textContent);

  /* ---------- (d) edit manual di baris hasil filter ---------- */
  V344.state.listQuery = '{{GL1}}}'; V344.state.page = 0;
  V344.renderList();
  {
    const ta = rows()[0].querySelector('textarea');
    ta.value = 'Cokelat';
    fireInput(ta);
    const t = V344.state.translations.get(brown.id);
    check('D1 edit manual di baris terfilter tersimpan', !!t && t.text === 'Cokelat', JSON.stringify(t));
    check('D1 via jadi manual', !!t && t.via === 'manual', JSON.stringify(t));
  }
  V344.state.listQuery = ''; V344.renderList();

  /* ---------- (e) event DOM: ketik, ganti cakupan, hapus ---------- */
  $('listSearch').value = 'cokelat'; fireInput($('listSearch'));
  check('E1 ketik di kotak pencarian: query tersimpan + 1 baris', V344.state.listQuery === 'cokelat' && rows().length === 1 && rowTexts()[0] === 'Brown', JSON.stringify(rowTexts()));
  $('listSearchScope').value = 'orig'; fireChange($('listSearchScope'));
  check('E1 ganti cakupan ke orig: cokelat tidak cocok lagi', rows().length === 0, JSON.stringify(rowTexts()));
  $('listSearchScope').value = 'tr'; fireChange($('listSearchScope'));
  check('E1 ganti cakupan ke tr: cokelat cocok lagi', rows().length === 1, JSON.stringify(rowTexts()));
  $('btnClearSearch').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('E1 tombol hapus: query kosong + semua baris kembali', $('listSearch').value === '' && V344.state.listQuery === '' && rows().length === 4, JSON.stringify(rowTexts()));

  console.log('\nV344_SEARCH: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
