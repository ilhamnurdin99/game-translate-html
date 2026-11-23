/* Test v3.4.4 — Placeholder cacat ({{GL1}}}, {{{GL1}}, {GL1}, dst).
   Jalankan: node test_v344_placeholder.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) unprotectGlossary / unprotectPlaceholders memulihkan tiap bentuk
       cacat (2/1 kurung, huruf kecil, spasi di dalam);
   (b) round-trip prepareForTranslate -> mesin mengacak kurung ->
       restoreTranslated memulihkan ke kata aslinya;
   (c) hasLeftoverPlaceholder menangkap bentuk cacat, tidak menangkap
       teks biasa;
   (d) validateOne menolak bentuk cacat;
   (e) cleanPlaceholderTranslations menandai terjemahan cacat sebagai gagal;
   (f) verifyOutput menandai placeholder cacat di file hasil;
   (g) slot di luar jangkauan tetap ditandai (tidak dipulihkan diam-diam).
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

check('A0 hook v3.4.4 tersedia', !!V344 && typeof V344.unprotectGlossary === 'function' && typeof V344.unprotectPlaceholders === 'function' && typeof V344.hasLeftoverPlaceholder === 'function' && typeof V344.validateOne === 'function' && typeof V344.cleanPlaceholderTranslations === 'function' && typeof V344.verifyOutput === 'function');
check('A0 label versi v3.4.11', html.includes('Game Translate HTML v3.4.11') && !html.includes('Game Translate HTML v3.4.10'));

const glossSlots = [{ en: 'Continue', id: 'Lanjutkan' }, { en: 'Settings', id: 'Pengaturan' }];
const varSlots = ['$Money', '_randomRoll'];

/* ---------- (a) unprotectGlossary: semua bentuk cacat ---------- */
const ug = (t) => V344.unprotectGlossary(t, glossSlots);
check('B1 {{{GL0}}} utuh dipulihkan', ug('{{{GL0}}}') === 'Lanjutkan', ug('{{{GL0}}}'));
check('B1 {{{gl0}}} huruf kecil dipulihkan', ug('{{{gl0}}}') === 'Lanjutkan', ug('{{{gl0}}}'));
check('B1 {{GL1}}} (kasus Ilham) dipulihkan', ug('{{GL1}}}') === 'Pengaturan', ug('{{GL1}}}'));
check('B1 {{{GL1}} kurung tutup hilang dipulihkan', ug('{{{GL1}}') === 'Pengaturan', ug('{{{GL1}}'));
check('B1 {GL0} satu kurung dipulihkan', ug('{GL0}') === 'Lanjutkan', ug('{GL0}'));
check('B1 {{{ GL1 }}} spasi di dalam dipulihkan', ug('{{{ GL1 }}}') === 'Pengaturan', ug('{{{ GL1 }}}'));
check('B1 {{ gl0 }} spasi + huruf kecil dipulihkan', ug('{{ gl0 }}') === 'Lanjutkan', ug('{{ gl0 }}'));
check('B1 dalam kalimat: Klik {{GL0}}} untuk lanjut', ug('Klik {{GL0}}} untuk lanjut') === 'Klik Lanjutkan untuk lanjut', ug('Klik {{GL0}}} untuk lanjut'));
check('B1 dua placeholder cacat sekaligus', ug('{{GL0}}} dan {GL1}') === 'Lanjutkan dan Pengaturan', ug('{{GL0}}} dan {GL1}'));
check('B1 teks tanpa placeholder tidak berubah', ug('Teks biasa saja.') === 'Teks biasa saja.');

/* ---------- (a) unprotectPlaceholders: setara GTn ---------- */
const up = (t) => V344.unprotectPlaceholders(t, varSlots);
check('B2 {{{GT0}}} utuh dipulihkan', up('{{{GT0}}}') === '$Money', up('{{{GT0}}}'));
check('B2 {{GT1}}} dipulihkan', up('{{GT1}}}') === '_randomRoll', up('{{GT1}}}'));
check('B2 {{{GT1}} dipulihkan', up('{{{GT1}}') === '_randomRoll', up('{{{GT1}}'));
check('B2 {GT0} dipulihkan', up('{GT0}') === '$Money', up('{GT0}'));
check('B2 {{{gt0}}} huruf kecil dipulihkan', up('{{{gt0}}}') === '$Money', up('{{{gt0}}}'));

/* ---------- (b) round-trip: mesin mengacak kurung ---------- */
w.eval('S.glossary = [{ en: "Continue", id: "Lanjutkan" }];');
{
  const prep = G.prepareForTranslate('Continue $Money.');
  check('B3 prepareForTranslate: {{{GL0}}} {{{GT0}}}.', prep.send === '{{{GL0}}} {{{GT0}}}.', prep.send);
  // Mesin mengecilkan huruf + menghilangkan satu kurung buka GL.
  const mangled = '{{GL0}}} {{{gt0}}}.';
  const restored = G.restoreTranslated(mangled, prep, 'Continue $Money.');
  check('B3 restoreTranslated memulihkan bentuk cacat', restored === 'Lanjutkan $Money.', restored);
  // Mesin menghilangkan kurung di kedua placeholder.
  const mangled2 = '{GL0} {GT0}.';
  check('B3 restoreTranslated memulihkan 1-kurung', G.restoreTranslated(mangled2, prep, 'Continue $Money.') === 'Lanjutkan $Money.', G.restoreTranslated(mangled2, prep, 'Continue $Money.'));
}

/* ---------- (c) hasLeftoverPlaceholder ---------- */
const hl = V344.hasLeftoverPlaceholder;
check('C1 {{GL1}}} tertangkap', hl('Ada {{GL1}}} di sini') === true);
check('C1 {{{GL1}} tertangkap', hl('Ada {{{GL1}} di sini') === true);
check('C1 {GL1} tertangkap', hl('Ada {GL1} di sini') === true);
check('C1 {{{GL1}}} utuh tertangkap', hl('Ada {{{GL1}}} di sini') === true);
check('C1 {{{gl0}}} huruf kecil tertangkap', hl('Ada {{{gl0}}} di sini') === true);
check('C1 {{GT0}}} tertangkap', hl('Ada {{GT0}}} di sini') === true);
check('C1 {{{ GT2 }}} spasi tertangkap', hl('Ada {{{ GT2 }}} di sini') === true);
check('C1 teks bersih tidak tertangkap', hl('Teks biasa saja.') === false);
check('C1 kurung biasa {a} tidak tertangkap', hl('kurung {a} dan {b} biasa') === false);
check('C1 $Money / _var tidak tertangkap', hl('Kamu punya $Money dan _ad.') === false);
check('C1 string kosong tidak tertangkap', hl('') === false && hl(null) === false);

/* ---------- (d) validateOne ---------- */
const val = V344.validateOne;
check('D1 {{GL1}}} ditolak', val('Klik {{GL1}}} dulu', 'Click Continue first') === 'placeholder tersisa', String(val('Klik {{GL1}}} dulu', 'Click Continue first')));
check('D1 {GT0} ditolak', val('Ada {GT0} di sini', 'You have $Money.') === 'placeholder tersisa', String(val('Ada {GT0} di sini', 'You have $Money.')));
check('D1 {{{gl0}}} ditolak', val('Ada {{{gl0}}} di sini', 'Continue') === 'placeholder tersisa');
check('D1 terjemahan bersih diterima', val('Lanjutkan $Money.', 'Continue $Money.') === null, String(val('Lanjutkan $Money.', 'Continue $Money.')));

/* ---------- (e) cleanPlaceholderTranslations ---------- */
w.eval('S.translations = new Map([["s1", { text: "Klik {{GL1}}} dulu", via: "Google" }], ["s2", { text: "Lanjutkan.", via: "Google" }], ["s3", { text: "Ada {GT0} di sini", via: "Edge" }]]);');
{
  const n = V344.cleanPlaceholderTranslations();
  const t1 = V344.state.translations.get('s1');
  const t2 = V344.state.translations.get('s2');
  const t3 = V344.state.translations.get('s3');
  check('E1 clean menandai 2 terjemahan cacat', n === 2, 'n=' + n);
  check('E1 s1 ({{GL1}}}) ditandai gagal + teks dikosongkan', !!t1 && t1.failed === true && t1.text === '', JSON.stringify(t1));
  check('E1 s3 ({GT0}) ditandai gagal', !!t3 && t3.failed === true, JSON.stringify(t3));
  check('E1 s2 bersih tidak disentuh', !!t2 && !t2.failed && t2.text === 'Lanjutkan.', JSON.stringify(t2));
}

/* ---------- (f) verifyOutput ---------- */
w.eval('S.originalText = "<html><body><p>Continue</p></body></html>"; S.segments = []; S.includeScript = false; S.translateNames = false;');
{
  const bad = V344.verifyOutput('<html><body><p>Klik {{GL1}}} dulu</p></body></html>');
  const phBad = bad.find((c) => c.label.indexOf('placeholder') !== -1);
  check('F1 verifyOutput menandai {{GL1}}} di file hasil', !!phBad && phBad.ok === false, JSON.stringify(phBad));
  const good = V344.verifyOutput('<html><body><p>Klik Lanjutkan dulu</p></body></html>');
  const phGood = good.find((c) => c.label.indexOf('placeholder') !== -1);
  check('F1 verifyOutput lolos bila tidak ada placeholder', !!phGood && phGood.ok === true, JSON.stringify(phGood));
}

/* ---------- (g) slot di luar jangkauan ---------- */
check('G1 {{GL9}}} slot tidak ada: tidak dipulihkan diam-diam', ug('{{GL9}}}') === '{{GL9}}}', ug('{{GL9}}}'));
check('G1 {{GL9}}} tetap tertangkap hasLeftoverPlaceholder', hl('{{GL9}}}') === true);
check('G1 {{GL9}}} ditolak validateOne', val('Ada {{GL9}}} di sini', 'Continue') === 'placeholder tersisa');

console.log('\nV344_PLACEHOLDER: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
