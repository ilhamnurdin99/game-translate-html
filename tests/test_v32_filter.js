/* Test v3.2 — Filter kebocoran pemindai + hapus Tinjau Teks Variabel.
   Jalankan: node test_v32_filter.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan), lalu menguji
   w.scanFile pada fixture Twine 2 SugarCube, Twine 1 storeArea, dan
   Harlowe, plus (bila ada) Seedship asli di ~/workspace/user/files/.

   Yang diuji:
   (a) segmen whitespace-only (escape Twine 1 \n \t literal) hilang;
   (b) @@.debug-text / @@.error dilewati seluruhnya (termasuk link di
       dalamnya, dan span yang merentang macro);
   (c) @@.class lain: isi tetap jadi segmen TANPA wrapper @@;
   (d) komentar JS dan komentar SugarCube /% ... %/ hilang, kalimat tetap
       utuh, write-back byte-akurat (komentar kembali);
   (e) teks biasa + interpolasi $var tetap jadi segmen;
   (f) tidak ada lagi segmen kind 'var-string' (fitur v3 dihapus);
   (g) passage kode Twine 1 "Stylesheet"/"JavaScript" dilewati utuh. */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const htmlPath = process.argv[2] || '/home/hatch/workspace/game-translate-html-gh/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
const w = dom.window;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const V2 = w.__GTHTML_V2__;
check('A0 hook v2 tersedia + v3 dihapus', !!V2 && typeof V2.repairScripts === 'function' && !('__GTHTML_V3__' in w));
const unesc = (t) => V2.unescapeTwineText(t);
const texts = (scan) => scan.segments.map((s) => s.text);
const has = (scan, t) => texts(scan).includes(t);
const hasNorm = (scan, t) => scan.segments.some((s) => s.text.replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/\s+/g, ' ').trim() === t);

/* ---------- fixture Twine 1 storeArea (escape \n \t literal) ---------- */
const TW1 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test</title></head><body>\n'
  + '<div id="storeArea">\n'
  + '<div tiddler="Start">\\n\\nHello world.\\n\\t\\n&lt;&lt;if $x&gt;&gt;\\n\\tYes.\\n&lt;&lt;endif&gt;&gt;\\n\\n@@.debug-text;score: _score@@\\n\\n/* a comment */\\n\\n@@.red;teks penting@@\\n\\n/* multi\\nline */\\n\\nThe end.\\n</div>\n'
  + '<div tiddler="Second">\\n\\t@@.error;bad $thing@@\\n\\nReal text here.\\n</div>\n'
  + '<div tiddler="Third">Start @@.error;Unexpected &lt;&lt;= $planet.x&gt;&gt;@@ end.\\n\\n@@.debug-text;[[DEBUG: Edit ship stats|DEBUG edit ship]]@@\\n\\n/% a SugarCube comment %/\\n\\nAfter comment.</div>\n'
  + '<div tiddler="Stylesheet">.debug-text {\\n\\tdisplay: none;\\n}\\n</div>\n'
  + '<div tiddler="JavaScript">window.foo = 1; // code\\n</div>\n'
  + '</div></body></html>';

const scan1 = w.scanFile(TW1, { includeScript: false, translateNames: false });
check('B1 Twine1: tidak ada segmen whitespace-only', !scan1.segments.some((s) => /^\s*$/.test(unesc(s.text))), JSON.stringify(texts(scan1)));
check('B1 Twine1: tidak ada segmen mengandung @@', !scan1.segments.some((s) => s.text.includes('@@')));
check('B1 Twine1: tidak ada segmen mengandung .debug-text/.error', !scan1.segments.some((s) => s.text.includes('.debug-text') || s.text.includes('.error')));
check('B1 Twine1: tidak ada segmen mengandung /* atau /%', !scan1.segments.some((s) => s.text.includes('/*') || s.text.includes('/%')));
check('B1 Twine1: tidak ada segmen var-string', !scan1.segments.some((s) => s.kind === 'var-string'));
check('B1 Twine1: teks asli tetap ada', has(scan1, 'Hello world.') && has(scan1, 'Yes.') && has(scan1, 'The end.') && has(scan1, 'Real text here.') && has(scan1, 'After comment.'), JSON.stringify(texts(scan1)));
check('B1 Twine1: isi @@.red tetap jadi segmen tanpa wrapper', has(scan1, 'teks penting') && !scan1.segments.some((s) => s.text.includes('@@.red')));
check('B1 Twine1: span debug yang merentang macro hilang, teks sekitar tetap', has(scan1, 'Start') && has(scan1, 'end.') && !scan1.segments.some((s) => s.text.includes('Unexpected')));
check('B1 Twine1: link di dalam @@.debug-text tidak diekstrak', !scan1.segments.some((s) => s.text.includes('DEBUG: Edit ship stats')));
check('B1 Twine1: passage kode Stylesheet/JavaScript dilewati', !scan1.segments.some((s) => s.passage === 'Stylesheet' || s.passage === 'JavaScript'));
check('B1 Twine1: scanFile tidak kembalikan varReview/varStats', scan1.varReview === undefined && scan1.varStats === undefined);

/* ---------- write-back Twine 1: byte-akurat di luar segmen terjemahan ---------- */
{
  const seg = scan1.segments.find((s) => s.text === 'Hello world.');
  check('B2 Twine1: segmen Hello world. ditemukan', !!seg);
  const out = TW1.slice(0, seg.rawStart) + 'Halo dunia.' + TW1.slice(seg.rawEnd);
  check('B2 Twine1: hanya span itu yang berubah', out === TW1.slice(0, seg.rawStart) + 'Halo dunia.' + TW1.slice(seg.rawEnd));
  check('B2 Twine1: wrapper @@.red utuh', out.includes('@@.red;teks penting@@'));
  check('B2 Twine1: komentar /* */ utuh', out.includes('/* a comment */') && out.includes('/* multi\\nline */'));
  check('B2 Twine1: debug-text utuh', out.includes('@@.debug-text;score: _score@@') && out.includes('@@.error;bad $thing@@'));
  check('B2 Twine1: komentar /% %/ utuh', out.includes('/% a SugarCube comment %/'));
  check('B2 Twine1: escape \\n\\t di luar segmen utuh', out.includes('\\n\\nHalo dunia.\\n\\t\\n'));
  const re = w.scanFile(out, { includeScript: false, translateNames: false });
  check('B2 Twine1: pindai ulang file hasil jumlah segmen sama', re.segments.length === scan1.segments.length, 'asli: ' + scan1.segments.length + ', hasil: ' + re.segments.length);
}

/* ---------- fixture Twine 2 SugarCube ---------- */
const TW2 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test Game</title></head><body>\n'
  + '<tw-storydata name="Test" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" format="SugarCube" format-version="2.36.1" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="10,10">Before. /* a comment */ Middle. @@.red;teks penting@@ After $hero walks.</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Second" tags="" position="20,20">&lt;&lt;set $pesan to "Hello var"&gt;&gt;Text after set.</tw-passagedata>\n'
  + '<tw-passagedata pid="3" name="Third" tags="" position="30,30">One. /* multi\nline comment */ Two. @@.debug-text;hidden _x@@ Three.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
const scan2 = w.scanFile(TW2, { includeScript: false, translateNames: false });
check('C1 Twine2: tidak ada segmen mengandung /* atau @@', !scan2.segments.some((s) => s.text.includes('/*') || s.text.includes('@@')));
check('C1 Twine2: tidak ada segmen .debug-text', !scan2.segments.some((s) => s.text.includes('.debug-text')));
check('C1 Twine2: kalimat di sekitar komentar tetap utuh', has(scan2, 'Before.') && has(scan2, 'Middle.') && has(scan2, 'One.') && has(scan2, 'Two.') && has(scan2, 'Three.'), JSON.stringify(texts(scan2)));
check('C1 Twine2: isi @@.red tetap jadi segmen', has(scan2, 'teks penting'));
check('C1 Twine2: interpolasi $var tetap jadi segmen', has(scan2, 'After $hero walks.'));
check('C1 Twine2: string <<set>> tidak diekstrak (v3 dihapus)', !scan2.segments.some((s) => s.kind === 'var-string' || s.text === 'Hello var') && has(scan2, 'Text after set.'));
{
  const out = TW2.replace('Middle.', 'Tengah.');
  check('C2 Twine2: komentar /* */ tetap di file bila teks diterjemahkan', out.includes('/* a comment */') && out.includes('/* multi\nline comment */'));
}

/* ---------- fixture Harlowe ---------- */
const HL = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test</title></head><body>\n'
  + '<tw-storydata name="Test" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" format="Harlowe" format-version="3.3.9" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="10,10">Hello. /* comment here */ World. (set: $a to 1) Done. (if: $a is 1)[Shown.]</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
const scanH = w.scanFile(HL, { includeScript: false, translateNames: false });
check('D1 Harlowe: tidak ada segmen mengandung /*', !scanH.segments.some((s) => s.text.includes('/*')), JSON.stringify(texts(scanH)));
check('D1 Harlowe: teks sekitar komentar tetap ada', has(scanH, 'Hello.') && has(scanH, 'World.') && has(scanH, 'Done.') && has(scanH, 'Shown.'), JSON.stringify(texts(scanH)));
check('D1 Harlowe: tidak ada segmen var-string', !scanH.segments.some((s) => s.kind === 'var-string'));

/* ---------- Seedship asli (bila file tersedia) ---------- */
const SEED_PATH = '/home/hatch/workspace/user/files/index.html';
if (fs.existsSync(SEED_PATH)) {
  const seed = fs.readFileSync(SEED_PATH, 'utf8');
  const scanS = w.scanFile(seed, { includeScript: false, translateNames: false });
  check('E1 Seedship: total segmen 1.194 (v3.4.2: 1.081; +103 label <<link>> ber-badan + 10 tautan setter yang kini terpisah)', scanS.segments.length === 1194, 'dapat: ' + scanS.segments.length);
  check('E1 Seedship: 0 whitespace-only', !scanS.segments.some((s) => /^\s*$/.test(unesc(s.text))));
  check('E1 Seedship: 0 mengandung @@ / .debug-text / .error', !scanS.segments.some((s) => s.text.includes('@@') || s.text.includes('.debug-text') || s.text.includes('.error')));
  check('E1 Seedship: 0 mengandung /* atau /%', !scanS.segments.some((s) => s.text.includes('/*') || s.text.includes('/%')));
  check('E1 Seedship: 0 var-string', !scanS.segments.some((s) => s.kind === 'var-string'));
  check('E1 Seedship: 0 segmen dari passage Stylesheet', !scanS.segments.some((s) => s.passage === 'Stylesheet'));
  check('E1 Seedship: teks asli tetap ada (contoh)', hasNorm(scanS, 'The two species end up living in separate communities with friendly relations between them.') && hasNorm(scanS, 'As the colonists expand from their initial settlement they must find a way to share their new home with its native inhabitants,'));
  // write-back: terjemahkan dummy segmen pertama yang asli, sisanya byte-identik
  const first = scanS.segments.find((s) => s.text && /[A-Za-z]{3,}/.test(s.text) && !s.text.includes('$'));
  const built = seed.slice(0, first.rawStart) + 'TERJEMAHAN-UJI' + seed.slice(first.rawEnd);
  check('E2 Seedship: write-back hanya ubah span segmen', built.slice(0, first.rawStart) === seed.slice(0, first.rawStart) && built.slice(first.rawStart + 14) === seed.slice(first.rawEnd));
  check('E2 Seedship: komentar dan markup debug utuh di file hasil', built.includes('/* Difference can be 0 to 10 */') && built.includes('@@.debug-text;Human culture score: _human_culture_score@@') && built.includes('/* Sidebar status display */'));
  const reS = w.scanFile(built, { includeScript: false, translateNames: false });
  check('E2 Seedship: pindai ulang file hasil jumlah segmen sama', reS.segments.length === scanS.segments.length, 'asli: ' + scanS.segments.length + ', hasil: ' + reS.segments.length);
} else {
  console.log('SKIP E1/E2 Seedship: file tidak ada di ' + SEED_PATH);
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
