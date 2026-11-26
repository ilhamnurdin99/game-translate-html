/* Test v3.4.7 — Isi definisi <<widget>> ikut dipindai (F5 Important).
   Jalankan: node test_v347_widget.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) kasus nyata Ilham: tujuh nama hari di dalam <<if $day = N>> di
       badan widget jadi segmen; Timpa menulis balik terjemahannya di
       dalam widget, macro + variabel + nama widget utuh;
   (b) badan widget campuran: teks tampil + <<set>> + <<print>> +
       <<script>> — teks tampil jadi segmen, kode tidak; Timpa utuh;
   (c) widget bersarang: teks luar + dalam jadi segmen;
   (d) widget tanpa penutup: kembali ke perilaku lama (lewati utuh);
   (e) widget berisi kode saja: tidak ada segmen;
   (f) sarang 12 tingkat: tidak crash, 10 tingkat luar terpindai.
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
const V347 = w.__GTHTML_V347__;
const $ = (id) => w.document.getElementById(id);

check('A0 hook v3.4.7 tersedia', !!V347 && typeof V347.scanFile === 'function' && typeof V347.buildOutput === 'function' && typeof V347.verifyOutput === 'function');
if (!V347) { console.log('\nV347_WIDGET: hook belum ada — RED'); process.exit(1); }

function twine2(passages) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + passages + '</tw-storydata></body></html>';
}
function setupState(fix) {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = [];');
  w.eval('segCounter = 0; doScan(); renderList();');
  return V347.state;
}
const texts = (S) => S.segments.filter((s) => s.translatable).map((s) => s.text);
const setTranslations = (S, map) => {
  for (const s of S.segments) {
    if (s.translatable && map[s.text]) S.translations.set(s.id, { text: map[s.text], via: 'manual' });
  }
};

async function main() {
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  w.confirm = () => true;

  /* ---------- (a) kasus nyata Ilham: tujuh nama hari ---------- */
  const FIX_DAYS = twine2('<tw-passagedata pid="1" name="DayWidget" tags="widget" position="100,100" size="100,100"><<widget "dayname">>\n'
    + '<<if $day = 1>>Sunday\n'
    + '<<elseif $day = 2>>Monday\n'
    + '<<elseif $day = 3>>Tuesday\n'
    + '<<elseif $day = 4>>Wednesday\n'
    + '<<elseif $day = 5>>Thursday\n'
    + '<<elseif $day = 6>>Friday\n'
    + '<<else>>Saturday\n'
    + '<</widget>></tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="Start" tags="" position="200,100" size="100,100">Welcome <<dayname>></tw-passagedata>\n');
  let S = setupState(FIX_DAYS);
  check('A1 tujuh nama hari jadi segmen', JSON.stringify(texts(S)) === JSON.stringify(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Welcome']), JSON.stringify(texts(S)));
  check('A1 tidak ada segmen kode ($day / if / widget)', S.segments.every((s) => !/\$day|<<|widget|elseif/.test(s.text)), JSON.stringify(texts(S)));
  setTranslations(S, { Sunday: 'Minggu', Monday: 'Senin', Tuesday: 'Selasa', Wednesday: 'Rabu', Thursday: 'Kamis', Friday: 'Jumat', Saturday: 'Sabtu', Welcome: 'Selamat datang' });
  let built = V347.buildOutput();
  check('A1 Timpa: nama hari diterjemahkan di dalam widget', built.text.includes('Minggu') && built.text.includes('Senin') && built.text.includes('Sabtu'));
  check('A1 Timpa: macro + variabel + nama widget utuh', built.text.includes('<<widget "dayname">>') && built.text.includes('<<if $day = 1>>') && built.text.includes('<<elseif $day = 2>>') && built.text.includes('<<else>>') && built.text.includes('<</widget>>'));
  const checksA = V347.verifyOutput(built.text);
  check('A1 verifikasi lolos semua (pindai ulang sama)', checksA.every((c) => c.ok), checksA.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label).join(' | '));

  /* ---------- (b) badan campuran ---------- */
  const FIX_MIX = twine2('<tw-passagedata pid="1" name="W" tags="" position="100,100" size="100,100"><<widget "greet">>Hello, $name! <<set $x to 1>>You have $Money gold. <<print "Done">> <<script>>var q = 1;<</script>> Bye.<</widget>></tw-passagedata>\n');
  S = setupState(FIX_MIX);
  check('B1 teks tampil jadi segmen', JSON.stringify(texts(S)) === JSON.stringify(['Hello, $name!', 'You have $Money gold.', 'Done', 'Bye.']), JSON.stringify(texts(S)));
  setTranslations(S, { 'Hello, $name!': 'Halo, $name!', 'You have $Money gold.': 'Kamu punya $Money emas.', 'Done': 'Selesai', 'Bye.': 'Dadah.' });
  built = V347.buildOutput();
  check('B1 Timpa: teks diterjemahkan, kode utuh', built.text.includes('Halo, $name!') && built.text.includes('Kamu punya $Money emas.') && built.text.includes('<<set $x to 1>>') && built.text.includes('<<script>>var q = 1;<</script>>') && built.text.includes('<<widget "greet">>') && built.text.includes('<<print "Selesai">>'), built.text);
  const checksB = V347.verifyOutput(built.text);
  check('B1 verifikasi lolos semua', checksB.every((c) => c.ok), checksB.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label).join(' | '));

  /* ---------- (c) widget bersarang ---------- */
  const FIX_NEST = twine2('<tw-passagedata pid="1" name="W" tags="" position="100,100" size="100,100"><<widget "outer">>Outer text <<widget "inner">>Inner text<</widget>> more<</widget>></tw-passagedata>\n');
  S = setupState(FIX_NEST);
  check('C1 teks luar + dalam jadi segmen', JSON.stringify(texts(S)) === JSON.stringify(['Outer text', 'Inner text', 'more']), JSON.stringify(texts(S)));

  /* ---------- (d) widget tanpa penutup: perilaku lama ---------- */
  const FIX_OPEN = twine2('<tw-passagedata pid="1" name="W" tags="" position="100,100" size="100,100"><<widget "broken">>Some text here\n\nAfter blank.</tw-passagedata>\n');
  S = setupState(FIX_OPEN);
  check('D1 widget tanpa penutup: isinya dilewati (perilaku lama)', texts(S).length === 0, JSON.stringify(texts(S)));

  /* ---------- (e) widget berisi kode saja ---------- */
  const FIX_CODE = twine2('<tw-passagedata pid="1" name="W" tags="" position="100,100" size="100,100"><<widget "code">><<set $a to 1>><<set $b to 2>><</widget>></tw-passagedata>\n');
  S = setupState(FIX_CODE);
  check('E1 widget berisi kode saja: tidak ada segmen', texts(S).length === 0, JSON.stringify(texts(S)));

  /* ---------- (f) sarang 12 tingkat: tidak crash ---------- */
  let deep = '';
  for (let i = 12; i >= 1; i--) deep = '<<widget "w' + i + '">>Level ' + i + ' text ' + deep + '<</widget>>';
  const FIX_DEEP = twine2('<tw-passagedata pid="1" name="W" tags="" position="100,100" size="100,100">' + deep + '</tw-passagedata>\n');
  let crashed = false;
  try { S = setupState(FIX_DEEP); } catch (e) { crashed = true; }
  check('F1 sarang 12 tingkat: tidak crash', !crashed);
  check('F1 10 tingkat luar terpindai, sisanya dilewati', !crashed && texts(S).filter((t) => /^Level \d+ text/.test(t)).length === 10, JSON.stringify(texts(S)));

  /* ---------- (g) baris kode ditolak filter ---------- */
  const FIX_CODELINE = twine2('<tw-passagedata pid="1" name="W" tags="" position="100,100" size="100,100"><<widget "doThing">>var q = 1; State.variables.x = q;<</widget>></tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="PlainCode" tags="" position="200,100" size="100,100">var q = 1; State.variables.x = q;</tw-passagedata>\n'
    + '<tw-passagedata pid="3" name="PlainMix" tags="" position="300,100" size="100,100">Some intro text here.\nvar q = 1; State.variables.x = q;\nMore text after.</tw-passagedata>\n');
  S = setupState(FIX_CODELINE);
  check('G1 baris kode (= + ;) di badan widget bukan segmen', S.segments.filter((s) => s.passage === 'W').length === 0, JSON.stringify(S.segments.filter((s) => s.passage === 'W').map((s) => s.text)));
  check('G1 baris kode murni di teks biasa juga bukan segmen', !texts(S).some((t) => /^var q = 1/.test(t)), JSON.stringify(texts(S)));
  // (v3.4.27) Perilaku lama v3.4.6 DIUBAH: paragraf campuran kini dipecah
  // per baris (butir 4 saran scanner) — baris kode dibuang, tiap baris
  // narasi jadi segmen sendiri (dulu satu segmen utuh berisi baris kode
  // di tengahnya).
  check('G1 paragraf campuran: baris kode dibuang, narasi jadi dua segmen (v3.4.27)', texts(S).includes('Some intro text here.') && texts(S).includes('More text after.') && !texts(S).some((t) => t.includes('var q = 1')), JSON.stringify(texts(S)));

  /* ---------- (h) fragmen markup/variabel dari <<print>> gabungan (kasus Seedship) ---------- */
  const FIX_FRAG = twine2('<tw-passagedata pid="1" name="W" tags="" position="100,100" size="100,100"><<widget "w1">>\n'
    + '<<print "@@.mediocre;" + $tech + " civilisation@@">>\n'
    + '<<print "@@.mediocre;Civilisation: " + $tech + "@@">>\n'
    + '<<print "<span style=\'color: rgb(" + _r + ", " + _g + ", " + _b + ")\'>" + $args[0] + "%</span>">>\n'
    + '<<print "<a href=\'" + $args[1] + "\' target=\'_blank\'>" + $args[0] + "</a>">>\n'
    + '@@.bad;$planet.atmosphere@@\n'
    + 'Atmosphere: <<print $planet.atmosphere>>\n'
    + '\n\'\'$args[0].final_score\'\'\n'
    + '\n\'\'Score\'\'\n'
    + '<</widget>></tw-passagedata>\n');
  S = setupState(FIX_FRAG);
  check('H1 tidak ada segmen mengandung @@', !texts(S).some((t) => t.includes('@@')), JSON.stringify(texts(S)));
  check('H1 tidak ada fragmen HTML (<span / <a / target=)', !texts(S).some((t) => /<span|<a href|target=|rgb\(/.test(t)), JSON.stringify(texts(S)));
  check('H1 isi span yang tampil tetap jadi segmen (civilisation / Civilisation:)', texts(S).some((t) => /civilisation/i.test(t)), JSON.stringify(texts(S)));
  check('H1 teks tampil biasa di badan widget tetap jadi segmen (Atmosphere:)', texts(S).some((t) => t.includes('Atmosphere:')), JSON.stringify(texts(S)));
  check('H1 variabel telanjang bukan segmen', !texts(S).some((t) => /^\$/.test(t.trim())), JSON.stringify(texts(S)));
  check('H1 variabel berbalut tebal \'\' juga bukan segmen', !texts(S).some((t) => /^\$/.test(t.trim().replace(/''/g, ''))), JSON.stringify(texts(S)));
  check('H1 teks berbalut tebal \'\' tetap jadi segmen (Score)', texts(S).some((t) => t.includes('Score')), JSON.stringify(texts(S)));
  setTranslations(S, { civilisation: 'peradaban', 'Civilisation:': 'Peradaban:', 'Atmosphere:': 'Atmosfer:' });
  built = V347.buildOutput();
  check('H1 Timpa: span + HTML utuh, hanya teks tampil diganti', built.text.includes('@@.mediocre;') && built.text.includes('<span style=\'color: rgb(') && built.text.includes('<a href=\'') && built.text.includes('Peradaban:'), built.text);
  const checksH = V347.verifyOutput(built.text);
  check('H1 verifikasi lolos semua', checksH.every((c) => c.ok), checksH.map((c) => (c.ok ? 'OK ' : 'FAIL ') + c.label).join(' | '));

  console.log('\nV347_WIDGET: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
