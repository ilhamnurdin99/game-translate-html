/* Test v3.4 — Pemulihan placeholder case-insensitive + penolakan sisa
   placeholder + pembersihan terjemahan lama (file game-translate-html).
   Jalankan: node test_v34_placeholder.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan). Latar:
   Google gratis mengecilkan {{{GL0}}} jadi {{{gl0}}} saat menerjemahkan;
   pemulihan case-sensitive lama tidak mengenalinya sehingga 23 label
   "Continue" di Afterimage bocor ke file hasil sebagai {{{gl0}}}.
   Kriteria: semua PASS, 0 FAIL. */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const htmlPath = process.argv[2] || '/home/hatch/workspace/game-translate-html-gh/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const gamePath = '/home/hatch/workspace/afterimage/Afterimage-Prologue.html';
const game = fs.readFileSync(gamePath, 'utf8');
let pass = 0, fail = 0;
let e2Promise = Promise.resolve(); // (v3.4.2) blok E2 async — ringkasan menunggu ini
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
const w = dom.window;
const G = w.GTHTML;
const GLOSSARY = [
  { en: 'Save', id: 'Simpan' }, { en: 'Load', id: 'Muat' },
  { en: 'Continue', id: 'Lanjutkan' }, { en: 'Settings', id: 'Pengaturan' },
  { en: 'Quit', id: 'Keluar' },
];
// init() jsdom berjalan async (DOMContentLoaded) — set glossary eksplisit
// supaya prepareForTranslate di bawah langsung melindungi istilah.
G._setState({ glossary: GLOSSARY });
const ev = (code) => w.eval(code);

check('A0 hook v3.4 tersedia', !!w.__GTHTML_V34__ && typeof w.__GTHTML_V34__.cleanPlaceholderTranslations === 'function' && typeof w.__GTHTML_V34__.hasLeftoverPlaceholder === 'function');
check('A0 label versi v3.4.6', html.includes('Game Translate HTML v3.4.6') && !html.includes('Game Translate HTML v3.4.5'));
check('A0 Cara pakai menyebut pemulihan placeholder v3.4', html.includes('Pemulihan placeholder (v3.4)'));
check('A0 GTHTML tersedia', !!G && typeof G.prepareForTranslate === 'function' && typeof G.restoreTranslated === 'function' && typeof G.buildOutput === 'function' && typeof G.verifyOutput === 'function');

/* ---------- (a) Glossary: huruf kecil / campuran tetap dipulihkan ---------- */
{
  const gp = ev(`protectGlossary('Continue', ${JSON.stringify(GLOSSARY)})`);
  check('A1 lindungi Continue -> {{{GL0}}}', gp.text === '{{{GL0}}}', gp.text);
  check('A1 pulihkan {{{gl0}}} (huruf kecil) -> Lanjutkan', ev(`unprotectGlossary('{{{gl0}}}', ${JSON.stringify(gp.slots)})`) === 'Lanjutkan');
  check('A1 pulihkan {{{Gl0}}} (campuran) -> Lanjutkan', ev(`unprotectGlossary('{{{Gl0}}}', ${JSON.stringify(gp.slots)})`) === 'Lanjutkan');
  check('A1 pulihkan {{{gL0}}} (campuran 2) -> Lanjutkan', ev(`unprotectGlossary('{{{gL0}}}', ${JSON.stringify(gp.slots)})`) === 'Lanjutkan');
  check('A1 pulihkan {{{GL0}}} (asli) tetap jalan', ev(`unprotectGlossary('{{{GL0}}}', ${JSON.stringify(gp.slots)})`) === 'Lanjutkan');
  // restoreTranslated ujung-ke-ujung dengan mesin yang mengecilkan huruf
  const prep = G.prepareForTranslate('Continue');
  check('A1 prepareForTranslate Continue -> {{{GL0}}}', prep.send === '{{{GL0}}}', prep.send);
  const restored = G.restoreTranslated(prep.send.toLowerCase(), prep, 'Continue');
  check('A1 restoreTranslated {{{gl0}}} -> Lanjutkan', restored === 'Lanjutkan', restored);
}

/* ---------- (b) Variabel $var: {{{GTn}}} huruf kecil tetap dipulihkan ---------- */
{
  const gp = ev(`protectPlaceholders('Atmosphere ($scanner_atmosphere_level):')`);
  check('B1 lindungi $var -> {{{GT0}}}', gp.text === 'Atmosphere ({{{GT0}}}):', gp.text);
  check('B1 pulihkan {{{gt0}}} (huruf kecil) -> $var asli', ev(`unprotectPlaceholders('{{{gt0}}}', ${JSON.stringify(gp.slots)})`) === '$scanner_atmosphere_level');
  check('B1 pulihkan {{{Gt0}}} (campuran) -> $var asli', ev(`unprotectPlaceholders('{{{Gt0}}}', ${JSON.stringify(gp.slots)})`) === '$scanner_atmosphere_level');
  const text = 'Atmosphere ($scanner_atmosphere_level):';
  const prep = G.prepareForTranslate(text);
  // Mesin mengecilkan HANYA placeholder-nya (kata lain tetap apa adanya).
  const engineOut = prep.send.replace(/\{\{\{GT\d+\}\}\}/gi, (m) => m.toLowerCase());
  const restored = G.restoreTranslated(engineOut, prep, text);
  check('B1 restoreTranslated utuh: $var kembali', restored === text, restored);
}

/* ---------- (c) validateOne menolak sisa placeholder ---------- */
{
  const v = (t, o) => ev(`validateOne(${JSON.stringify(t)}, ${JSON.stringify(o)})`);
  check('C1 validateOne tolak {{{gl0}}}', v('{{{gl0}}}', 'Continue') === 'placeholder tersisa', v('{{{gl0}}}', 'Continue'));
  check('C1 validateOne tolak {{{GL0}}}', v('{{{GL0}}}', 'Continue') === 'placeholder tersisa');
  check('C1 validateOne tolak {{{gt1}}}', v('{{{gt1}}}', 'x $y') === 'placeholder tersisa');
  check('C1 validateOne tolak {{{Gt2}}} campuran', v('teks {{{Gt2}}} akhir', 'teks $y akhir') === 'placeholder tersisa');
  check('C1 validateOne terima terjemahan bersih', v('Lanjutkan', 'Continue') === null);
  check('C1 validateOne tetap tolak kosong/sama', v('', 'Continue') === 'kosong' && v('Continue', 'Continue') === 'sama');
}

/* ---------- (d) Round-trip penuh Afterimage, mesin mock pengecil huruf ---------- */
{
  const scan = w.scanFile(game, { includeScript: false, translateNames: false });
  check('D0 pindai Afterimage: 247 segmen', scan.segments.length === 247, 'dapat ' + scan.segments.length);
  const continueSegs = scan.segments.filter((s) => s.text === 'Continue');
  check('D0 tepat 21 segmen "Continue"', continueSegs.length === 21, 'dapat ' + continueSegs.length);
  // 23 segmen mengandung istilah glossary: 21 "Continue" + 2 "Settings"
  // ("Settings" dan ":: Settings" di passage Settings) — sama dengan angka
  // 23 di laporan ChatGPT (tiap segmen memakai slot {{{GL0}}} sendiri).
  const termSegs = scan.segments.filter((s) => /\b(Continue|Save|Load|Settings|Quit)\b/.test(s.text));
  check('D0 tepat 23 segmen mengandung istilah glossary', termSegs.length === 23, 'dapat ' + termSegs.length);
  G._setState({
    fileName: 'Afterimage-Prologue.html', fileHash: 'test-hash', originalText: game,
    segments: scan.segments, passages: scan.passages, engine: scan.engine,
    encodeStyle: scan.encodeStyle, translations: new Map(), glossary: GLOSSARY,
    skipPassages: new Set(), includeScript: false, translateNames: false,
    needsReupload: false, outputText: '',
  });
  // Mock mesin: mengecilkan SEMUA huruf (seperti Google gratis); segmen yang
  // isinya murni placeholder dikembalikan apa adanya (hanya dikecilkan).
  const queue = scan.segments.filter((s) => s.translatable && !s.skipped);
  let stored = 0, failed = 0;
  for (const seg of queue) {
    const prep = G.prepareForTranslate(seg.text);
    const pure = /^\{\{\{(?:GL|GT)\d+\}\}\}$/.test(prep.send);
    const engineOut = pure ? prep.send.toLowerCase() : ('ID ' + prep.send.toLowerCase());
    const clean = G.restoreTranslated(engineOut, prep, seg.text);
    const bad = ev(`validateOne(${JSON.stringify(clean)}, ${JSON.stringify(seg.text)})`);
    if (bad) { G._state.translations.set(seg.id, { text: '', via: 'gagal:' + bad, failed: true }); failed++; }
    else { G._state.translations.set(seg.id, { text: clean, via: 'mock' }); stored++; }
  }
  check('D1 semua segmen diterjemahkan mock tanpa gagal placeholder', failed === 0, failed + ' gagal');
  check('D1 21 segmen Continue tersimpan sebagai "Lanjutkan"', continueSegs.every((s) => { const t = G._state.translations.get(s.id); return t && t.text === 'Lanjutkan'; }));
  check('D1 segmen "Settings" tersimpan sebagai "Pengaturan"', scan.segments.filter((s) => s.text === 'Settings').every((s) => { const t = G._state.translations.get(s.id); return t && t.text === 'Pengaturan'; }));
  const built = G.buildOutput();
  const leftover = (built.text.match(/\{\{\{(?:GL|GT)\d+\}\}\}/gi) || []).length;
  check('D2 0 placeholder GL/GT di file hasil', leftover === 0, leftover + ' tersisa');
  // Panah link di file asli ter-encode HTML: [[Continue-&gt;PRO_11_Printer]]
  check('D2 link [[Lanjutkan-&gt;PRO_11_Printer]] terbentuk benar', built.text.includes('[[Lanjutkan-&gt;PRO_11_Printer]]'));
  const countLanjutkan = (built.text.match(/Lanjutkan/g) || []).length;
  check('D2 tepat 21 "Lanjutkan" di file hasil', countLanjutkan === 21, 'dapat ' + countLanjutkan);
  check('D2 target link PRO_11_Printer tidak berubah', built.text.includes('PRO_11_Printer]]'));
  const targets = ['PRO_11_Printer', 'PRO_11_BinIt', 'PRO_11_StickIt', 'PRO_12_AdminBulletin'];
  check('D2 semua target link contoh utuh', targets.every((t) => built.text.includes(t)));
  const checks = G.verifyOutput(built.text);
  const ph = checks.find((c) => c.label.indexOf('placeholder') !== -1);
  check('D2 verifyOutput: cek "tidak ada placeholder" ada', !!ph, JSON.stringify(checks.map((c) => c.label)));
  check('D2 verifyOutput: cek placeholder LOLOS', !!ph && ph.ok === true, ph ? JSON.stringify(ph) : 'tidak ada');
  const segCheck = checks.find((c) => c.label.indexOf('Jumlah segmen') !== -1);
  check('D2 verifyOutput: jumlah segmen pindai ulang sama', !!segCheck && segCheck.ok === true);
}

/* ---------- (e) Cleanup: terjemahan tersimpan yang bocor dibersihkan ---------- */
{
  const scan = w.scanFile(game, { includeScript: false, translateNames: false });
  const badSeg = scan.segments.find((s) => s.text === 'Continue');
  const goodSeg = scan.segments.find((s) => s.text !== 'Continue' && s.translatable);
  const d = {
    v: 1, fileName: 'Afterimage-Prologue.html', fileHash: 'test-hash', originalText: game,
    segments: scan.segments, passages: scan.passages,
    translations: [
      [badSeg.id, { text: '{{{gl0}}}', via: 'Google' }],
      [goodSeg.id, { text: 'Terjemahan bersih.', via: 'Google' }],
    ],
    glossary: GLOSSARY, skipPassages: [], includeScript: false, translateNames: false,
    engine: scan.engine, encodeStyle: scan.encodeStyle, ts: Date.now(),
  };
  w.__GTHTML_V33__.restoreProject(d);
  const badAfter = G._state.translations.get(badSeg.id);
  const goodAfter = G._state.translations.get(goodSeg.id);
  check('E1 restoreProject: entri {{{gl0}}} ditandai gagal', !!badAfter && badAfter.failed === true && badAfter.text === '', JSON.stringify(badAfter));
  check('E1 restoreProject: alasan gagal placeholder tersisa', !!badAfter && badAfter.via === 'gagal:placeholder tersisa', badAfter && badAfter.via);
  check('E1 restoreProject: terjemahan bersih tidak tersentuh', !!goodAfter && goodAfter.text === 'Terjemahan bersih.' && !goodAfter.failed, JSON.stringify(goodAfter));
  // Jalur doBuild: entri bocor yang dimasukkan belakangan ikut dibersihkan
  // sebelum file hasil dibangun — segmennya kembali Inggris.
  // (v3.4.2) doBuild kini async — tunggu build selesai sebelum memeriksa.
  e2Promise = (async () => {
  const badSeg2 = scan.segments.filter((s) => s.text === 'Continue')[1];
  G._state.translations.set(badSeg2.id, { text: '{{{GL0}}}', via: 'Google' });
  const built2 = await ev('doBuild(false)');
  check('E2 doBuild jalan (tidak null)', !!built2);
  const bad2After = G._state.translations.get(badSeg2.id);
  check('E2 doBuild: entri {{{GL0}}} ditandai gagal sebelum build', !!bad2After && bad2After.failed === true && bad2After.text === '', JSON.stringify(bad2After));
  check('E2 doBuild: file hasil tidak mengandung {{{gl0}}}/{{{GL0}}}', !/\{\{\{(?:GL|GT)\d+\}\}\}/i.test(built2.text));
  check('E2 doBuild: segmen yang dibersihkan tetap Inggris di hasil', built2.text.includes('[[Continue-&gt;'));
  const checks2 = G.verifyOutput(built2.text);
  const ph2 = checks2.find((c) => c.label.indexOf('placeholder') !== -1);
  check('E2 doBuild: verifyOutput cek placeholder lolos', !!ph2 && ph2.ok === true);
  })();
}

e2Promise.then(() => {
  console.log('\nV34_PLACEHOLDER: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
});
