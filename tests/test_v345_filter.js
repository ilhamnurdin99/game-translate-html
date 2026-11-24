/* Test v3.4.5 — Filter "hanya yang belum diterjemahkan" di pencarian.
   Jalankan: node test_v345_filter.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) ceklis #chkOnlyUntr ada di DOM, default tidak dicentang;
   (b) filter aktif: hanya yang belum diterjemahkan tampil, pageInfo
       "X belum diterjemahkan dari N teks"; nonaktif: semua kembali;
   (c) kombinasi dengan query teks + tiap cakupan (Semua/Teks asli/
       Terjemahan), hitungan benar; tanpa cocok = pesan khusus;
   (d) edit manual tetap jalan di baris terfilter; setelah render ulang
       baris yang sudah diterjemahkan hilang dari filter;
   (e) tombol hapus juga membersihkan filter; loadFile me-reset filter.
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
const V345 = w.__GTHTML_V345__;
const $ = (id) => w.document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

check('A0 hook v3.4.5 tersedia', !!V345 && typeof V345.filteredSegs === 'function' && typeof V345.listFilterMatches === 'function' && typeof V345.untranslatedList === 'function' && typeof V345.renderList === 'function');
check('A0 label versi v3.4.18', html.includes('Game Translate HTML v3.4.18') && !html.includes('Game Translate HTML v3.4.13'));

const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Beach" tags="" position="100,100" size="100,100">'
  + '[[Hang Out (0:30)|Beach Hang Out]]\n'
  + '[[Brown|Hair Dyed][$Player.HairColorNew to "Brown"]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Walk" tags="" position="200,100" size="100,100">'
  + 'Keep walking here.\n\nRoll _randomRoll now.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
function setupState() {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false;');
  // Reset segCounter + render ulang supaya baris DOM selalu cocok dengan
  // segmen saat ini (lihat test_v345_qa.js — tanpa ini data-id jadi basi).
  w.eval('segCounter = 0; doScan(); renderList();');
  return V345.state;
}
const segByText = (S, t) => S.segments.find((s) => s.text === t);
const rows = () => [...w.document.querySelectorAll('#listBody .trow')].filter((r) => r.querySelector('textarea'));
const rowTexts = () => rows().map((r) => r.querySelector('.orig').textContent);
const fireInput = (el) => el.dispatchEvent(new w.Event('input', { bubbles: true }));
const fireChange = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
const setFilter = (on) => { $('chkOnlyUntr').checked = on; fireChange($('chkOnlyUntr')); };
const setQuery = (q) => { $('listSearch').value = q; fireInput($('listSearch')); };
const setScope = (v) => { $('listSearchScope').value = v; fireChange($('listSearchScope')); };

async function main() {
  // Tunggu init() benar-benar selesai (jebakan jsdom: readyState sudah
  // 'interactive' sebelum DOMContentLoaded jalan — sinyal init selesai:
  // log Acorn di akhir init()).
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  const S = setupState();
  // Dua diterjemahkan, dua belum.
  S.translations.set(segByText(S, 'Brown').id, { text: 'Cokelat {{GL1}}}', via: 'Google' });
  S.translations.set(segByText(S, 'Hang Out (0:30)').id, { text: 'Bersantai (0:30)', via: 'Google Dict' });

  /* ---------- (a) elemen UI ---------- */
  check('A1 ceklis hanya-belum ada', !!$('chkOnlyUntr') && $('chkOnlyUntr').type === 'checkbox');
  check('A1 label ceklis "Hanya yang belum diterjemahkan"', $('chkOnlyUntr').closest('label').textContent.indexOf('Hanya yang belum diterjemahkan') !== -1, $('chkOnlyUntr').closest('label').textContent);
  check('A1 default tidak dicentang', $('chkOnlyUntr').checked === false && V345.state.listOnlyUntr === false);
  check('A1 untranslatedList = 2 (yang belum)', V345.untranslatedList().length === 2, JSON.stringify(V345.untranslatedList().map((s) => s.text)));

  /* ---------- (b) filter aktif / nonaktif ---------- */
  setFilter(true);
  check('B1 filter aktif: hanya 2 baris tampil', rows().length === 2, JSON.stringify(rowTexts()));
  check('B1 baris yang tampil = yang belum diterjemahkan', rowTexts().includes('Keep walking here.') && rowTexts().includes('Roll _randomRoll now.'), JSON.stringify(rowTexts()));
  check('B1 pageInfo "2 belum diterjemahkan dari 4 teks"', $('pageInfo').textContent.indexOf('2 belum diterjemahkan dari 4 teks') !== -1, $('pageInfo').textContent);
  setFilter(false);
  check('B1 filter nonaktif: semua 4 baris kembali', rows().length === 4, JSON.stringify(rowTexts()));
  check('B1 pageInfo kembali normal (4 teks, tanpa "belum")', $('pageInfo').textContent.indexOf('4 teks') !== -1 && $('pageInfo').textContent.indexOf('belum') === -1, $('pageInfo').textContent);

  /* ---------- (c) kombinasi dengan query + cakupan ---------- */
  setFilter(true); setQuery('walking');
  check('C1 filter + query walking: 1 baris', rows().length === 1 && rowTexts()[0] === 'Keep walking here.', JSON.stringify(rowTexts()));
  check('C1 pageInfo "1 cocok dari 2 belum diterjemahkan"', $('pageInfo').textContent.indexOf('1 cocok dari 2 belum diterjemahkan') !== -1, $('pageInfo').textContent);
  setQuery('cokelat');
  check('C1 filter + query cokelat: 0 baris (Brown sudah diterjemahkan)', rows().length === 0, JSON.stringify(rowTexts()));
  check('C1 0 baris + pesan tidak cocok', $('listBody').textContent.indexOf('Tidak ada yang cocok') !== -1, $('listBody').textContent);
  setScope('tr'); setQuery('cokelat');
  check('C1 filter + cakupan tr + query cokelat: 0 baris', rows().length === 0, JSON.stringify(rowTexts()));
  setScope('orig'); setQuery('walking');
  check('C1 filter + cakupan orig + query walking: 1 baris', rows().length === 1 && rowTexts()[0] === 'Keep walking here.', JSON.stringify(rowTexts()));
  setScope('all'); setQuery('');
  check('C1 query dikosongkan, filter masih aktif: 2 baris', rows().length === 2, JSON.stringify(rowTexts()));

  /* ---------- (d) edit manual di baris terfilter ---------- */
  {
    const ta = rows().find((r) => r.querySelector('.orig').textContent === 'Keep walking here.').querySelector('textarea');
    ta.value = 'Terus berjalan di sini.';
    fireInput(ta);
    const t = V345.state.translations.get(segByText(V345.state, 'Keep walking here.').id);
    check('D1 edit manual di baris terfilter tersimpan (via manual)', !!t && t.text === 'Terus berjalan di sini.' && t.via === 'manual', JSON.stringify(t));
    V345.renderList();
    check('D1 setelah render ulang: baris yang sudah diterjemahkan hilang dari filter', rows().length === 1 && rowTexts()[0] === 'Roll _randomRoll now.', JSON.stringify(rowTexts()));
    check('D1 pageInfo "1 belum diterjemahkan dari 4 teks"', $('pageInfo').textContent.indexOf('1 belum diterjemahkan dari 4 teks') !== -1, $('pageInfo').textContent);
  }
  setFilter(false);

  /* ---------- (e) tombol hapus + loadFile me-reset filter ---------- */
  setFilter(true); setQuery('roll');
  check('E1 sebelum hapus: filter aktif + query roll = 1 baris', rows().length === 1, JSON.stringify(rowTexts()));
  $('btnClearSearch').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('E1 tombol hapus: ceklis lepas + query kosong + 4 baris', $('chkOnlyUntr').checked === false && V345.state.listOnlyUntr === false && V345.state.listQuery === '' && rows().length === 4, JSON.stringify(rowTexts()));
  setFilter(true); setQuery('roll');
  {
    const f = new w.File([FIX], 'baru.html', { type: 'text/html' });
    w.__f2 = f;
    await w.eval('loadFile(window.__f2)');
    check('E1 loadFile: ceklis lepas + query kosong', $('chkOnlyUntr').checked === false && V345.state.listOnlyUntr === false && V345.state.listQuery === '' && $('listSearch').value === '', 'checked=' + $('chkOnlyUntr').checked + ' q=' + JSON.stringify(V345.state.listQuery));
    check('E1 loadFile: daftar penuh 4 baris (terjemahan lama terhapus)', rows().length === 4, JSON.stringify(rowTexts()));
    check('E1 loadFile: filter mati = pageInfo normal', $('pageInfo').textContent.indexOf('4 teks') !== -1 && $('pageInfo').textContent.indexOf('belum') === -1, $('pageInfo').textContent);
  }
  // Semua sudah diterjemahkan + filter aktif = pesan khusus.
  {
    const S2 = V345.state;
    for (const s of S2.segments) if (s.translatable) S2.translations.set(s.id, { text: 'ID:' + s.text, via: 'Google' });
    V345.renderList();
    setFilter(true);
    check('E1 semua diterjemahkan + filter aktif: 0 baris + pesan khusus', rows().length === 0 && $('listBody').textContent.indexOf('Semua teks sudah diterjemahkan') !== -1, $('listBody').textContent);
    setFilter(false);
  }

  console.log('\nV345_FILTER: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
