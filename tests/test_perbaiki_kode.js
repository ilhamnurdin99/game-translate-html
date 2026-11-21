/* Test v2 — Perbaiki Kode <<script>> (file game-translate-html).
   Jalankan: node test_perbaiki_kode.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan), lalu menguji
   extractScriptBlocks / analyzeScriptDamage / repairScripts /
   penjaga scan + doBuild, termasuk perbaikan nyata Seedship-ID. */
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
check('A0 hook v2 tersedia', !!V2 && typeof V2.repairScripts === 'function' && typeof V2.extractScriptBlocks === 'function');
check('A0 acorn tersedia', !!w.acorn && typeof w.acorn.parse === 'function');

/* ---------- fixture Twine 2 (SugarCube) ---------- */
const TW2_ORIG = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test Game</title></head><body>\n'
  + '<tw-storydata name="Test" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" format="SugarCube" format-version="2.36.1" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="10,10">Hello world. [[Continue|Next]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Next" tags="" position="20,20">You arrive at a new place. &lt;&lt;script&gt;&gt;if (x) { a(); } else { b(); }&lt;&lt;/script&gt;&gt; Then go home.</tw-passagedata>\n'
  + '<tw-passagedata pid="3" name="Third" tags="" position="30,30">Look! &lt;&lt;script&gt;&gt;$("#status").show();&lt;&lt;/script&gt;&gt; End.</tw-passagedata>\n'
  + '<tw-passagedata pid="4" name="Story JavaScript" tags="" position="40,40">window.myFlag = true; function helper() { return 1; }</tw-passagedata>\n'
  + '<tw-passagedata pid="5" name="WidgetPass" tags="" position="50,50">&lt;&lt;widget "doThing"&gt;&gt;var q = 1; State.variables.x = q;&lt;&lt;/widget&gt;&gt; Widget defined.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
const TW2_DMG = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test Game</title></head><body>\n'
  + '<tw-storydata name="Test" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" format="SugarCube" format-version="2.36.1" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="10,10">Halo dunia. [[Lanjut|Next]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Next" tags="" position="20,20">Kamu tiba di tempat baru. &lt;&lt;script&gt;&gt;jika (x) { a(); } kalau tidak { b(); }&lt;&lt;/script&gt;&gt; Setelah itu pulang.</tw-passagedata>\n'
  + '<tw-passagedata pid="3" name="Third" tags="" position="30,30">Lihat! &lt;&lt;script&gt;&gt;$("#status").tampilkan();&lt;&lt;/script&gt;&gt; Selesai.</tw-passagedata>\n'
  + '<tw-passagedata pid="4" name="Story JavaScript" tags="" position="40,40">window.myFlag = true; function helper() { return 1; }</tw-passagedata>\n'
  + '<tw-passagedata pid="5" name="WidgetPass" tags="" position="50,50">&lt;&lt;widget "doThing"&gt;&gt;var q = 1; State.variables.x = q;&lt;&lt;/widget&gt;&gt; Widget didefinisikan.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';

/* (a) Twine 2: perbaikan, dialog tidak disentuh, byte-akurat */
{
  const res = V2.repairScripts(TW2_ORIG, TW2_DMG);
  check('B1 Twine2: 2 blok dipulihkan', res.restored === 2, 'restored=' + res.restored);
  check('B1 Twine2: total blok 2', res.total === 2, 'total=' + res.total);
  check('B1 Twine2: dialog Indonesia tetap', res.text.includes('Kamu tiba di tempat baru') && res.text.includes('Halo dunia') && res.text.includes('Setelah itu pulang'));
  check('B1 Twine2: script asli kembali', res.text.includes('if (x) { a(); } else { b(); }') && res.text.includes('$("#status").show();'));
  check('B1 Twine2: kata rusak hilang', !res.text.includes('kalau tidak') && !res.text.includes('tampilkan'));
  const expected = TW2_DMG
    .replace('jika (x) { a(); } kalau tidak { b(); }', 'if (x) { a(); } else { b(); }')
    .replace('$("#status").tampilkan();', '$("#status").show();');
  check('B1 Twine2: byte-akurat (hanya isi script berubah)', res.text === expected);
  const rows = res.rows.filter((r) => r.status === 'Dipulihkan');
  check('B1 Twine2: laporan menyebut Next + Third', rows.some((r) => r.passage === 'Next') && rows.some((r) => r.passage === 'Third'));
  check('B1 Twine2: alasan menyebut kata Indonesia', rows.some((r) => /kalau|tidak|jika|tampilkan/.test(r.reason)), JSON.stringify(rows.map((r) => r.reason)));
  const after = V2.extractScriptBlocks(res.text);
  const allOk = after.blocks.every((b) => V2.tryParseJS(b.decodedBody).ok);
  check('B1 Twine2: semua blok hasil parse OK', allOk);
}

/* (d) file sudah benar -> tidak diubah */
{
  const res = V2.repairScripts(TW2_ORIG, TW2_ORIG);
  check('B2 file benar: 0 dipulihkan, teks identik', res.restored === 0 && res.text === TW2_ORIG);
  check('B2 file benar: semua baris Sudah benar', res.rows.length === 2 && res.rows.every((r) => r.status === 'Sudah benar'));
}

/* (f) penjaga scan: isi <<script>> + widget + Story JavaScript tidak masuk Daftar Teks */
{
  const scan = w.scanFile(TW2_ORIG, { includeScript: false, translateNames: false });
  const bad = scan.segments.filter((s) => /if \(x\)|a\(\);|tampilkan|setPageElement|myFlag|helper|State\.variables/.test(s.text));
  check('B3 scan: isi <<script>> tidak masuk Daftar Teks', bad.length === 0, JSON.stringify(bad.map((s) => s.text)));
  check('B3 scan: Story JavaScript tidak disegmen', scan.segments.filter((s) => s.passage === 'Story JavaScript').length === 0);
  check('B3 scan: isi <<widget>> tidak disegmen', scan.segments.filter((s) => /var q = 1|State\.variables/.test(s.text)).length === 0);
  check('B3 scan: dialog biasa tetap ketemu', scan.segments.some((s) => s.text.includes('Hello world')) && scan.segments.some((s) => s.text.includes('You arrive')));
  const scanDmg = w.scanFile(TW2_DMG, { includeScript: false, translateNames: false });
  check('B3 scan file rusak: tidak ada segmen kode', scanDmg.segments.filter((s) => /jika \(x\)|kalau tidak|tampilkan/.test(s.text)).length === 0);
}

/* ---------- fixture Twine 1 (storeArea, escape Twee) ---------- */
const TW1_ORIG = '<html><body><div id="store-area">'
  + '<div tiddler="Start" tags="" created="201703061900" modifier="twee">Hello world.</div>'
  + '<div tiddler="Next" tags="" created="201703061900" modifier="twee">You arrive. &lt;&lt;script&gt;&gt;\\n\\tif (x) { a(); } else { b(); }\\n\\t&lt;&lt;/script&gt;&gt; Done.</div>'
  + '</div></body></html>';
const TW1_DMG = '<html><body><div id="store-area">'
  + '<div tiddler="Start" tags="" created="201703061900" modifier="twee">Halo dunia.</div>'
  + '<div tiddler="Next" tags="" created="201703061900" modifier="twee">Kamu tiba. &lt;&lt;script&gt;&gt;\\n\\tif (x) { a(); } kalau tidak { b(); }\\n\\t&lt;&lt;/script&gt;&gt; Selesai.</div>'
  + '</div></body></html>';
{
  const res = V2.repairScripts(TW1_ORIG, TW1_DMG);
  check('C1 Twine1: 1 blok dipulihkan', res.restored === 1, 'restored=' + res.restored);
  check('C1 Twine1: dialog tetap, script asli kembali', res.text.includes('Kamu tiba') && res.text.includes('if (x) { a(); } else { b(); }') && !res.text.includes('kalau tidak'));
  const scan = w.scanFile(TW1_ORIG, { includeScript: false, translateNames: false });
  check('C1 Twine1 scan: isi script tidak masuk Daftar Teks', scan.segments.filter((s) => /if \(x\)|a\(\);/.test(s.text)).length === 0);
  check('C1 Twine1 scan: dialog ketemu', scan.segments.some((s) => s.text.includes('Hello world')));
}

/* ---------- fixture HTML <script> biasa ---------- */
const HTML_ORIG = '<!DOCTYPE html><html><head><title>G</title></head><body><p>Hello.</p>'
  + '<script>function greet() { return "Hello"; } Save.data = 1; var el = document.querySelector("#status-display");</script>'
  + '</body></html>';
const HTML_DMG_PARSE = HTML_ORIG.replace('function greet()', 'fungsi greet()');
const HTML_DMG_IDENT = HTML_ORIG.replace('Save.data = 1;', 'Simpan.data = 1;');
const HTML_DMG_STR = HTML_ORIG.replace('"Hello"', '"Halo"');
{
  const r1 = V2.repairScripts(HTML_ORIG, HTML_DMG_PARSE);
  check('D1 HTML script: parse gagal -> dipulihkan', r1.restored === 1 && r1.text === HTML_ORIG, 'restored=' + r1.restored);
  const r2 = V2.repairScripts(HTML_ORIG, HTML_DMG_IDENT);
  check('D2 HTML script: identifier diterjemahkan -> dipulihkan', r2.restored === 1 && r2.text === HTML_ORIG, 'restored=' + r2.restored);
  const r3 = V2.repairScripts(HTML_ORIG, HTML_DMG_STR);
  check('D3 HTML script: string tampilan diterjemahkan -> TIDAK dipulihkan', r3.restored === 0 && r3.text === HTML_DMG_STR, 'restored=' + r3.restored);
  const r4 = V2.repairScripts(HTML_ORIG, HTML_ORIG);
  check('D4 HTML script bersih: tidak diubah', r4.restored === 0 && r4.text === HTML_ORIG);
}

/* (e) kata 'jika'/'benar' di dalam string dialog TIDAK dianggap kode */
{
  const orig = '<!DOCTYPE html><html><body><p>She said "if you are right".</p>'
    + '<script>if (x) { say("if you are right"); }</script></body></html>';
  const dmg = '<!DOCTYPE html><html><body><p>Dia berkata "jika kamu benar".</p>'
    + '<script>if (x) { say("jika kamu benar"); }</script></body></html>';
  const res = V2.repairScripts(orig, dmg);
  check('E1 string dialog berisi jika/benar: blok script TIDAK dipulihkan', res.restored === 0, 'restored=' + res.restored + ' rows=' + JSON.stringify(res.rows));
  check('E1 dialog terjemahan tetap', res.text.includes('Dia berkata "jika kamu benar"'));
  const a = V2.analyzeScriptDamage(
    { decodedBody: 'if (x) { say("if you are right"); }', unescape: false, kind: 'html-script' },
    { decodedBody: 'if (x) { say("jika kamu benar"); }', unescape: false, kind: 'html-script' });
  check('E1 analyze: string saja bukan kerusakan', a.damaged === false, JSON.stringify(a));
}

/* ---------- guard doBuild (integrasi) ---------- */
{
  // Skenario: scan fixture Twine2, terjemahkan dialog, Timpa -> script utuh.
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(TW2_ORIG) + '; S.translations = new Map(); S.tm = new Map(); S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0 }; S.translateNames = false; S.includeScript = false;');
  w.eval('doScan();');
  const nSegs = w.eval('S.segments.length');
  check('F1 doBuild: scan fixture menemukan segmen dialog', nSegs > 0, 'segs=' + nSegs);
  const dlgId = w.eval('S.segments.find(function(s){ return s.text.indexOf("Hello world") >= 0; }) && S.segments.find(function(s){ return s.text.indexOf("Hello world") >= 0; }).id');
  if (dlgId) w.eval('S.translations.set(' + JSON.stringify(dlgId) + ', { text: "Halo dunia.", via: "test" });');
  const built = w.eval('doBuild(false) && S.outputText');
  check('F1 doBuild: output berisi terjemahan dialog', typeof built === 'string' && built.includes('Halo dunia.'));
  check('F1 doBuild: script asli utuh di output', typeof built === 'string' && built.includes('if (x) { a(); } else { b(); }'));
  // Penjaga: rusak output secara manual, guard harus memulihkan.
  const corrupted = built.replace('if (x) { a(); } else { b(); }', 'jika (x) { a(); } kalau tidak { b(); }');
  const g = V2.guardScriptsInOutput(corrupted, TW2_ORIG);
  check('F2 guard: script rusak di output dipulihkan', g.restored === 1 && g.text.includes('if (x) { a(); } else { b(); }') && g.text.includes('Halo dunia.'));
}

/* ---------- perbaikan nyata: Seedship-ID vs aslinya ---------- */
{
  const origSeed = fs.readFileSync('/home/hatch/workspace/user/files/index.html', 'utf8');
  const idSeed = fs.readFileSync('/home/hatch/workspace/seedship/Seedship-ID.html', 'utf8');
  const res = V2.repairScripts(origSeed, idSeed);
  console.log('   Seedship: total blok=' + res.total + ' dipulihkan=' + res.restored);
  check('G1 Seedship: >=30 blok dipulihkan', res.restored >= 30, 'restored=' + res.restored);
  const byPass = {};
  for (const r of res.rows) if (r.status === 'Dipulihkan') byPass[r.passage] = (byPass[r.passage] || 0) + 1;
  check('G1 Seedship: PassageFooter dipulihkan', (byPass['PassageFooter'] || 0) >= 1, JSON.stringify(byPass['PassageFooter']));
  check('G1 Seedship: StoryInit dipulihkan', (byPass['StoryInit'] || 0) >= 1);
  check('G1 Seedship: FC First Impression dipulihkan', (byPass['FC First Impression'] || 0) >= 1);
  const after = V2.extractScriptBlocks(res.text);
  let allOk = true, failCount = 0;
  for (const b of after.blocks) {
    const code = b.unescape ? V2.unescapeTwineText(b.decodedBody) : b.decodedBody;
    if (!V2.tryParseJS(code).ok) { allOk = false; failCount++; }
  }
  check('G2 Seedship hasil: semua 62 blok script lolos parse', allOk && after.blocks.length === 62, 'blocks=' + after.blocks.length + ' fail=' + failCount);
  check('G2 Seedship hasil: dialog terjemahan tetap ada', res.text.includes('Kapal benih berada di orbit'));
  check('G2 Seedship hasil: kata rusak hilang dari script', !after.blocks.some((b) => /kalau tidak|tampilkan\(\)|sembunyikan\(\)/.test(b.decodedBody)));
  // Byte-akurat: di luar blok script, hasil == file ID persis.
  function mask(text, blocks) {
    let out = text;
    const sorted = blocks.slice().sort((a, b) => b.rawStart - a.rawStart);
    for (const b of sorted) out = out.slice(0, b.rawStart) + '\0' + out.slice(b.rawEnd);
    return out;
  }
  const idBlocks = V2.extractScriptBlocks(idSeed).blocks;
  check('G3 Seedship: di luar script, hasil identik dengan file ID', mask(res.text, after.blocks) === mask(idSeed, idBlocks));
  // Tidak ada lagi kerusakan bila diperiksa ulang terhadap aslinya.
  const re2 = V2.repairScripts(origSeed, res.text);
  check('G3 Seedship: periksa ulang -> 0 dipulihkan', re2.restored === 0, 'restored=' + re2.restored);
}

/* ---------- regresi ringan scan ---------- */
{
  const origSeed = fs.readFileSync('/home/hatch/workspace/user/files/index.html', 'utf8');
  const scan = w.scanFile(origSeed, { includeScript: false, translateNames: false });
  console.log('   Seedship orig segmen: ' + scan.segments.length + ' (v1 baseline: 5171)');
  check('H1 regresi: segmen Seedship < 5171 (script tidak lagi bocor)', scan.segments.length < 5171, 'segs=' + scan.segments.length);
  check('H1 regresi: tidak ada segmen kode script', scan.segments.filter((s) => /setPageElement|tags\(\)|tampilkan|kalau tidak/.test(s.text)).length === 0);
  check('H1 regresi: dialog Seedship tetap ketemu', scan.segments.some((s) => s.text.indexOf("seedship's course") >= 0 || s.text.indexOf('The seedship') >= 0));
}

console.log('\nPERBAIKI_KODE: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
