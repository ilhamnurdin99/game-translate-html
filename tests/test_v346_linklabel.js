/* Test v3.4.6 — Terjemahkan label tautan satu argumen [[...]] (opt-in).
   Jalankan: node test_v346_linklabel.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) hook v3.4.6 + label v3.4.6 + bullet Cara pakai + ceklis ada, default mati;
   (b) ceklis MATI: [[Home]] / [[Shop]] / <<link "Shop">> tanpa badan BUKAN
       segmen (perilaku lama); tautan dua argumen + <<link>> ber-badan tetap
       segmen; linkNoBodyTargets mencatat "Shop";
   (c) ceklis HIDUP: "Home"/"Shop" jadi segmen (flag singleLink), linkNoBodyTargets kosong;
   (d) Timpa: [[Rumah|Home]], [[Toko|Shop]], <<link "Toko" "Shop">>,
       target + setter utuh, <<addToLoc "[[Home]]">> dan visited("Home")
       tidak berubah, name= utuh; doBuild(false) verifikasi 6/6;
   (e) validateOne menolak terjemahan label yang mengandung '|';
   (f) QA menandai label ber-'|' (edit manual) + buildOutput membuangnya
       (pipeSkipped) tanpa merusak tautan;
   (g) mode nama passage (optNames) + label tautan AKTIF: target ikut
       diganti nama (label diterjemahkan maupun tidak), verifikasi 6/6,
       tanpa peringatan tumpang tindih;
   (h) mode nama passage AKTIF + label tautan MATI: peringatan log untuk
       <<link "Shop">> tanpa badan yang tidak ikut diganti nama;
   (i) ceklis tersimpan per proyek (collect/restoreProject) + default
       lintas proyek di localStorage + reset saat file baru;
   (j) Harlowe: [[Home]] ikut jadi segmen bila ceklis hidup.
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
const V346 = w.__GTHTML_V346__;
const V343 = w.__GTHTML_V343__;
const G = w.GTHTML;
const $ = (id) => w.document.getElementById(id);
const fireChange = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));

check('A0 hook v3.4.6 tersedia', !!V346 && typeof V346.buildOutput === 'function' && typeof V346.verifyOutput === 'function' && typeof V346.doBuild === 'function' && typeof V346.validateOne === 'function' && typeof V346.readLinkLabelsDefault === 'function' && typeof V346.scanFile === 'function');
check('A0 label versi v3.4.17', html.includes('Game Translate HTML v3.4.17') && !html.includes('Game Translate HTML v3.4.13'));
check('A0 Cara pakai menyebut v3.4.6', html.includes('Label tautan satu argumen (v3.4.6)'));

const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Home" tags="" position="100,100" size="100,100">or you can go <span class="next">[[Home]]</span>\n'
  + '<<addToLoc "[[Home]]">></tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Shop" tags="" position="200,100" size="100,100">[[Shop]]\n'
  + '[[Buy Sword|Shop Buy]]\n'
  + '<<link "Shop">>\n'
  + '<<link "Keep walking">>Walk on.<</link>>\n'
  + '[[Go Home|Home][$Money -= 8]]</tw-passagedata>\n'
  + '<tw-passagedata pid="3" name="StoryMenu" tags="" position="0,100" size="100,100"><<if visited("Home")>><<link "Player Wears">>Outfit here.<</link>></tw-passagedata>\n'
  + '<tw-passagedata pid="4" name="Shop Buy" tags="" position="400,100" size="100,100"></tw-passagedata>\n' // (v3.4.7) passage target [[Buy Sword|Shop Buy]] — fixture harus utuh agar cek target lolos
  + '</tw-storydata></body></html>';
const FIXH = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="Harlowe" format-version="3.3.0" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Go [[Home]] now.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
function setupState(linkLabels, translateNames, fix) {
  w.localStorage.removeItem('gthtml_linklabels_v1');
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix || FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = ' + (!!translateNames) + '; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = ' + (!!linkLabels) + '; S.linkNoBodyTargets = [];');
  $('optLinkLabels').checked = !!linkLabels;
  $('optNames').checked = !!translateNames;
  // Reset segCounter + render ulang supaya baris DOM selalu cocok dengan
  // segmen saat ini (lihat test_v345_qa.js — tanpa ini data-id jadi basi).
  w.eval('segCounter = 0; doScan(); renderList();');
  return V346.state;
}
const segsByText = (S, t) => S.segments.filter((s) => s.text === t);
const translatableTexts = (S) => S.segments.filter((s) => s.translatable).map((s) => s.text);
const setTranslations = (S, map) => {
  for (const s of S.segments) {
    if (s.translatable && map[s.text]) S.translations.set(s.id, { text: map[s.text], via: 'manual' });
  }
};
const TR = { 'or you can go': 'atau kamu bisa pergi', 'Home': 'Rumah', 'Buy Sword': 'Beli Pedang', 'Shop': 'Toko', 'Keep walking': 'Terus berjalan', 'Walk on.': 'Jalan terus.', 'Go Home': 'Pulang', 'Player Wears': 'pemain memakai', 'Outfit here.': 'Pakaian di sini.' };

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
  // doBuild meminta konfirmasi bila mode nama passage aktif — jsdom tidak
  // punya confirm yang mengembalikan true, jadi stub di sini.
  w.confirm = () => true;

  /* ---------- (a) elemen UI ---------- */
  check('A1 ceklis label tautan ada', !!$('optLinkLabels'));
  check('A1 ceklis default MATI', $('optLinkLabels').checked === false && V346.state.linkLabels === false);

  /* ---------- (b) ceklis MATI = perilaku lama ---------- */
  let S = setupState(false, false);
  check('B1 ceklis mati: 7 segmen (tanpa label tautan)', JSON.stringify(translatableTexts(S)) === JSON.stringify(['or you can go', 'Buy Sword', 'Keep walking', 'Walk on.', 'Go Home', 'Player Wears', 'Outfit here.']), JSON.stringify(translatableTexts(S)));
  check('B1 ceklis mati: tidak ada segmen singleLink', S.segments.filter((s) => s.singleLink).length === 0);
  check('B1 ceklis mati: [[Home]] bukan segmen', segsByText(S, 'Home').length === 0);
  check('B1 ceklis mati: [[Shop]] bukan segmen', segsByText(S, 'Shop').length === 0);
  check('B1 ceklis mati: tautan dua argumen tetap segmen', segsByText(S, 'Buy Sword').length === 1 && segsByText(S, 'Go Home').length === 1);
  check('B1 ceklis mati: <<link>> ber-badan tetap segmen', segsByText(S, 'Keep walking').length === 1 && segsByText(S, 'Player Wears').length === 1);
  check('B1 ceklis mati: linkNoBodyTargets mencatat Shop', JSON.stringify(S.linkNoBodyTargets) === JSON.stringify(['Shop']), JSON.stringify(S.linkNoBodyTargets));

  /* ---------- (c) ceklis HIDUP ---------- */
  S = setupState(true, false);
  check('C1 ceklis hidup: 10 segmen', JSON.stringify(translatableTexts(S)) === JSON.stringify(['or you can go', 'Home', 'Shop', 'Buy Sword', 'Shop', 'Keep walking', 'Walk on.', 'Go Home', 'Player Wears', 'Outfit here.']), JSON.stringify(translatableTexts(S)));
  check('C1 ceklis hidup: 3 segmen singleLink', S.segments.filter((s) => s.singleLink).length === 3, JSON.stringify(S.segments.filter((s) => s.singleLink).map((s) => s.text + '@' + s.passage + (s.macro ? ' macro=' + s.macro : ''))));
  check('C1 [[Home]] jadi segmen singleLink', segsByText(S, 'Home').length === 1 && segsByText(S, 'Home')[0].singleLink === true && segsByText(S, 'Home')[0].linkLabel === true);
  check('C1 [[Shop]] + <<link "Shop">> jadi 2 segmen singleLink', segsByText(S, 'Shop').length === 2 && segsByText(S, 'Shop').every((s) => s.singleLink === true) && segsByText(S, 'Shop').filter((s) => s.macro === 'link').length === 1);
  check('C1 ceklis hidup: linkNoBodyTargets kosong', JSON.stringify(S.linkNoBodyTargets) === JSON.stringify([]), JSON.stringify(S.linkNoBodyTargets));
  check('C1 <<addToLoc "[[Home]]">> tetap bukan segmen', S.segments.filter((s) => s.passage === 'Home').length === 2, JSON.stringify(S.segments.filter((s) => s.passage === 'Home').map((s) => s.text)));

  /* ---------- (d) Timpa ---------- */
  setTranslations(S, TR);
  let built = V346.buildOutput();
  check('D1 Timpa: 10 string diganti, pipeSkipped 0', built.replaced === 10 && built.pipeSkipped === 0, 'replaced=' + built.replaced + ' pipeSkipped=' + built.pipeSkipped);
  check('D1 kalimat + [[Rumah|Home]]', built.text.includes('atau kamu bisa pergi <span class="next">[[Rumah|Home]]</span>'));
  check('D1 <<addToLoc "[[Home]]">> tidak berubah', built.text.includes('<<addToLoc "[[Home]]">>'));
  check('D1 [[Toko|Shop]]', built.text.includes('[[Toko|Shop]]'));
  check('D1 [[Beli Pedang|Shop Buy]] (target utuh)', built.text.includes('[[Beli Pedang|Shop Buy]]'));
  check('D1 <<link "Toko" "Shop">>', built.text.includes('<<link "Toko" "Shop">>'));
  check('D1 <<link>> ber-badan: label + isi diterjemahkan', built.text.includes('<<link "Terus berjalan">>Jalan terus.<</link>>') && built.text.includes('<<link "pemain memakai">>Pakaian di sini.<</link>>'));
  check('D1 setter utuh: [[Pulang|Home][$Money -= 8]]', built.text.includes('[[Pulang|Home][$Money -= 8]]'));
  check('D1 visited("Home") + name= tidak berubah', built.text.includes('<<if visited("Home")>>') && built.text.includes('name="Home"') && built.text.includes('name="Shop"'));
  check('D1 tidak ada [[Beranda|Home]] (bukan terjemahan fitur ini)', !built.text.includes('Beranda'));

  /* ---------- (e) doBuild 6/6 ---------- */
  const res = await V346.doBuild(false);
  check('E1 doBuild(false) mengembalikan built', !!res && res.replaced === 10, 'replaced=' + (res && res.replaced));
  check('E1 buildInfo verifikasi 9/9', $('buildInfo').textContent.includes('Verifikasi: 9/9 cek lolos'), $('buildInfo').textContent);

  /* ---------- (f) validateOne menolak '|' pada label tautan ---------- */
  const v = V346.validateOne;
  check('F1 validateOne: label ber-| ditolak', v('Ru|mah', 'Home', { singleLink: true }) === 'label mengandung |', v('Ru|mah', 'Home', { singleLink: true }));
  check('F1 validateOne: label bersih lolos', v('Rumah', 'Home', { singleLink: true }) === null);
  check('F1 validateOne: segmen biasa ber-| tidak ditolak', v('A|B', 'A B', {}) === null && v('A|B', 'A B') === null);
  check('F1 validateOne: label <<link>> ber-| ditolak', v('To|ko', 'Shop', { singleLink: true, macro: 'link' }) === 'label mengandung |');

  /* ---------- (g) QA + penjaga buildOutput untuk '|' (edit manual) ---------- */
  S = setupState(true, false);
  {
    const homeSeg = segsByText(S, 'Home')[0];
    S.translations.set(homeSeg.id, { text: 'Ru|mah', via: 'manual' });
    const qaRows = V343.qaAll();
    const homeRow = qaRows.find((r) => r.seg.id === homeSeg.id);
    check('G1 QA menandai label ber-|', !!homeRow && homeRow.issues.some((i) => i.indexOf('label mengandung |') !== -1), JSON.stringify(homeRow && homeRow.issues));
    const b2 = V346.buildOutput();
    check('G1 buildOutput membuang label ber-| (pipeSkipped 1)', b2.pipeSkipped === 1 && b2.replaced === 0, 'pipeSkipped=' + b2.pipeSkipped + ' replaced=' + b2.replaced);
    check('G1 tautan dibiarkan [[Home]] (tidak rusak)', b2.text.includes('[[Home]]') && !b2.text.includes('Ru|mah'));
  }

  /* ---------- (h) mode nama passage + label tautan AKTIF ---------- */
  // H-A: label + nama passage sama-sama diterjemahkan.
  S = setupState(true, true);
  {
    for (const s of S.segments) {
      if (s.kind === 'passage-name' && s.text === 'Home') S.translations.set(s.id, { text: 'Rumah', via: 'manual' });
      if (s.kind === 'passage-name' && s.text === 'Shop') S.translations.set(s.id, { text: 'Toko', via: 'manual' });
    }
    setTranslations(S, TR);
    const logBeforeA = $('logBox').textContent;
    const bA = V346.buildOutput();
    check('H-A name= diganti nama', bA.text.includes('name="Rumah"') && bA.text.includes('name="Toko"'));
    check('H-A [[Rumah|Rumah]] (label + target diganti nama)', bA.text.includes('[[Rumah|Rumah]]'));
    check('H-A [[Toko|Toko]] + <<link "Toko" "Toko">>', bA.text.includes('[[Toko|Toko]]') && bA.text.includes('<<link "Toko" "Toko">>'));
    check('H-A [[Pulang|Rumah][$Money -= 8]] (target dua argumen ikut diganti nama)', bA.text.includes('[[Pulang|Rumah][$Money -= 8]]'));
    check('H-A tanpa peringatan tumpang tindih', !$('logBox').textContent.slice(logBeforeA.length).includes('tumpang tindih'));
    const checksA = V346.verifyOutput(bA.text);
    check('H-A verifikasi 8/8', checksA.length === 8 && checksA.every((c) => c.ok), checksA.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label + (c.detail ? ' (' + c.detail + ')' : '')).join(' | '));
  }
  // H-B: label TIDAK diterjemahkan, nama passage diterjemahkan.
  S = setupState(true, true);
  {
    for (const s of S.segments) {
      if (s.kind === 'passage-name' && s.text === 'Home') S.translations.set(s.id, { text: 'Rumah', via: 'manual' });
      if (s.kind === 'passage-name' && s.text === 'Shop') S.translations.set(s.id, { text: 'Toko', via: 'manual' });
    }
    const trB = Object.assign({}, TR);
    delete trB.Home; delete trB.Shop;
    setTranslations(S, trB);
    const bB = V346.buildOutput();
    check('H-B [[Home|Rumah]] (label asli, target diganti nama)', bB.text.includes('[[Home|Rumah]]'));
    check('H-B [[Shop|Toko]] + <<link "Shop" "Toko">>', bB.text.includes('[[Shop|Toko]]') && bB.text.includes('<<link "Shop" "Toko">>'));
    check('H-B name= diganti nama', bB.text.includes('name="Rumah"') && bB.text.includes('name="Toko"'));
    const checksB = V346.verifyOutput(bB.text);
    check('H-B verifikasi 8/8', checksB.length === 8 && checksB.every((c) => c.ok), checksB.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label + (c.detail ? ' (' + c.detail + ')' : '')).join(' | '));
  }

  /* ---------- (i) peringatan: nama passage AKTIF + label tautan MATI ---------- */
  S = setupState(false, true);
  {
    for (const s of S.segments) {
      if (s.kind === 'passage-name' && s.text === 'Shop') S.translations.set(s.id, { text: 'Toko', via: 'manual' });
    }
    const before = $('logBox').textContent;
    const resI = await V346.doBuild(false);
    const delta = $('logBox').textContent.slice(before.length);
    check('I1 doBuild tetap selesai', !!resI);
    check('I1 peringatan <<link>> tanpa badan tercatat', delta.includes('tidak ikut diganti nama') && delta.includes('"Shop" → "Toko"'), delta.slice(0, 300));
    check('I1 verifikasi tetap 8/8', $('buildInfo').textContent.includes('Verifikasi: 8/8 cek lolos'), $('buildInfo').textContent);
  }

  /* ---------- (j) persistensi + default + reset file baru ---------- */
  S = setupState(false, false);
  check('J1 default localStorage kosong = mati', V346.readLinkLabelsDefault() === false);
  w.localStorage.setItem('gthtml_linklabels_v1', 'true');
  check('J1 default localStorage true dibaca', V346.readLinkLabelsDefault() === true);
  w.localStorage.setItem('gthtml_linklabels_v1', 'false');
  check('J1 default localStorage false dibaca', V346.readLinkLabelsDefault() === false);
  w.localStorage.removeItem('gthtml_linklabels_v1');
  // Event DOM: centang -> state + localStorage + pindai ulang (7 -> 10 segmen).
  $('optLinkLabels').checked = true; fireChange($('optLinkLabels'));
  check('J2 centang via DOM: state hidup + localStorage true + 10 segmen', S.linkLabels === true && w.localStorage.getItem('gthtml_linklabels_v1') === 'true' && translatableTexts(V346.state).length === 10, 'linkLabels=' + S.linkLabels + ' ls=' + w.localStorage.getItem('gthtml_linklabels_v1') + ' n=' + translatableTexts(V346.state).length);
  $('optLinkLabels').checked = false; fireChange($('optLinkLabels'));
  check('J2 hapus centang via DOM: state mati + localStorage false + 7 segmen', S.linkLabels === false && w.localStorage.getItem('gthtml_linklabels_v1') === 'false' && translatableTexts(V346.state).length === 7);
  // Round-trip proyek: simpan -> ubah -> pulihkan.
  $('optLinkLabels').checked = true; fireChange($('optLinkLabels'));
  const saved = w.eval('collectProjectData()');
  check('J3 collectProjectData menyimpan linkLabels', saved.linkLabels === true, JSON.stringify(saved.linkLabels));
  $('optLinkLabels').checked = false; fireChange($('optLinkLabels'));
  check('J3 sebelum pulih: mati', V346.state.linkLabels === false);
  w.eval('restoreProject(' + JSON.stringify(saved).replace(/</g, '\\u003c') + ')');
  check('J3 restoreProject memulihkan linkLabels + ceklis', V346.state.linkLabels === true && $('optLinkLabels').checked === true, 'linkLabels=' + V346.state.linkLabels + ' checked=' + $('optLinkLabels').checked);
  // Reset saat file baru: kembali ke default lintas proyek.
  w.localStorage.setItem('gthtml_linklabels_v1', 'true');
  w.eval('S.linkLabels = false;');
  $('optLinkLabels').checked = false;
  w.__testFile = new w.File([FIX], 'baru.html', { type: 'text/html' });
  await w.eval('loadFile(__testFile)');
  check('J4 file baru: kembali ke default localStorage (hidup)', V346.state.linkLabels === true && $('optLinkLabels').checked === true, 'linkLabels=' + V346.state.linkLabels);
  w.localStorage.setItem('gthtml_linklabels_v1', 'false');
  w.__testFile = new w.File([FIX], 'baru2.html', { type: 'text/html' });
  await w.eval('loadFile(__testFile)');
  check('J4 file baru: default mati -> ceklis mati', V346.state.linkLabels === false && $('optLinkLabels').checked === false);
  w.localStorage.removeItem('gthtml_linklabels_v1');

  /* ---------- (k) Harlowe ---------- */
  S = setupState(false, false, FIXH);
  check('K1 Harlowe terdeteksi', S.engine && S.engine.kind === 'harlowe', JSON.stringify(S.engine && S.engine.kind));
  check('K1 Harlowe ceklis mati: [[Home]] bukan segmen', segsByText(S, 'Home').length === 0);
  S = setupState(true, false, FIXH);
  check('K1 Harlowe ceklis hidup: [[Home]] jadi segmen singleLink', segsByText(S, 'Home').length === 1 && segsByText(S, 'Home')[0].singleLink === true);
  setTranslations(S, { 'Home': 'Rumah' });
  const builtH = V346.buildOutput();
  check('K1 Harlowe Timpa: [[Rumah->Home]]', builtH.text.includes('[[Rumah->Home]]')); // (v3.4.7) pemisah Harlowe '->', bukan '|'

  console.log('\nV346_LINKLABEL: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
