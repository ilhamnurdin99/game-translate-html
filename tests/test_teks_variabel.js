/* Test v3 — Tinjau Teks Variabel (file game-translate-html).
   Jalankan: node test_teks_variabel.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan), lalu menguji
   ekstraksi + klasifikasi string variabel (Harlowe & SugarCube),
   write-back byte-akurat, escape, dan penjaga v2. */
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
const V3 = w.__GTHTML_V3__;
check('A0 hook v3 tersedia', !!V3 && typeof V3.analyzeVarUsage === 'function' && typeof V3.processVarCandidates === 'function' && typeof V3.extractVarAssignments === 'function');
check('A0 acorn tersedia', !!w.acorn && typeof w.acorn.parse === 'function');
check('A0 label versi v3.1', html.includes('Game Translate HTML v3.1') && !html.includes('Game Translate HTML v3.0'));
check('A0 seksi Tinjau Teks Variabel ada', html.includes('id="secVarReview"') && html.includes('id="varSummary"') && html.includes('id="varReviewBody"'));
check('A0 seksi Cara pakai ada', html.includes('id="secHow"') && html.includes('Tinjau Teks Variabel (v3)'));

function tw2(format, version, passages) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test Game</title></head><body>\n'
    + '<tw-storydata name="Test" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" format="' + format + '" format-version="' + version + '" options="" hidden>\n'
    + passages.join('\n') + '\n</tw-storydata></body></html>';
}
function pd(pid, name, content) {
  return '<tw-passagedata pid="' + pid + '" name="' + name + '" tags="" position="10,10">' + content + '</tw-passagedata>';
}

/* ---------- (a) Harlowe ---------- */
const H_ORIG = tw2('Harlowe', '3.3.9', [
  pd(1, 'Start', '(set: $nama to "Anya")\nHalo, (print: $nama)!'),
  pd(2, 'Key', '(set: $kunci to "pintu-besi")\n(if: $kunci is "pintu-besi")[Pintu terbuka.]'),
  pd(3, 'Mixed', '(set: $pesan to "Selamat datang di stasiun")\n(print: $pesan)\n(if: $pesan is "Selamat datang di stasiun")[Lagi.]'),
  pd(4, 'Short', '(set: $x to "OK")\n(print: $x)'),
  pd(5, 'Unused', '(set: $takdipakai to "Halo dunia")\nTidak ada yang memakai variabel ini.'),
  pd(6, 'Put', '(put: "Selamat pagi" into $salam)\n(print: $salam)'),
]);
{
  const scan = w.scanFile(H_ORIG, { includeScript: false, translateNames: false });
  const varSegs = scan.segments.filter((s) => s.kind === 'var-string');
  check('A1 Harlowe: 2 segmen var-string otomatis', varSegs.length === 2, JSON.stringify(varSegs.map((s) => s.varName + '=' + s.text)));
  check('A1 Harlowe: $nama "Anya" otomatis', varSegs.some((s) => s.varName === 'nama' && s.text === 'Anya'));
  check('A1 Harlowe: $salam "Selamat pagi" otomatis (put:)', varSegs.some((s) => s.varName === 'salam' && s.text === 'Selamat pagi'));
  check('A1 Harlowe: tinjau 3 ($pesan, $x, $takdipakai)', scan.varReview.length === 3, JSON.stringify(scan.varReview.map((c) => c.varName)));
  check('A1 Harlowe: $pesan ditinjau (campuran)', scan.varReview.some((c) => c.varName === 'pesan' && c.varClass === 'campuran'));
  check('A1 Harlowe: $x ditinjau (pendek)', scan.varReview.some((c) => c.varName === 'x' && c.text === 'OK'));
  check('A1 Harlowe: $takdipakai ditinjau (tak dipakai)', scan.varReview.some((c) => c.varName === 'takdipakai' && c.varClass === 'takdipakai'));
  check('A1 Harlowe: $kunci KODE — tidak diekstrak', !varSegs.some((s) => s.varName === 'kunci') && !scan.varReview.some((c) => c.varName === 'kunci'));
  check('A1 Harlowe: "pintu-besi" tidak jadi segmen sama sekali', !scan.segments.some((s) => s.text === 'pintu-besi') && !scan.varReview.some((c) => c.text === 'pintu-besi'));
  check('A1 Harlowe: statistik auto 2 / tinjau 3 / kode 1',
    scan.varStats.auto === 2 && scan.varStats.tinjau === 3 && scan.varStats.kode === 1, JSON.stringify(scan.varStats));
  check('A1 Harlowe: ringkasan pemakaian $pesan menyebut tampil + kode',
    (scan.varReview.find((c) => c.varName === 'pesan') || {}).usage
    && /ditampilkan 1/.test(w.__GTHTML_V3__.varUsageSummary(scan.varReview.find((c) => c.varName === 'pesan').usage)));
  // unit: analisis pemakaian langsung
  const u = V3.analyzeVarUsage([{ contentRaw: '(set: $a to "Hi")\n(print: $a)', isCodePassage: false }], 'harlowe');
  check('A1 unit: (print: $a) = tampil', u.get('a') && u.get('a').display === 1 && u.get('a').code === 0);
  const u2 = V3.analyzeVarUsage([{ contentRaw: '(display: $p)', isCodePassage: false }], 'harlowe');
  check('A1 unit: (display: $p) = kode (nama passage, bukan teks)', u2.get('p') && u2.get('p').code === 1 && u2.get('p').display === 0);
  const u3 = V3.analyzeVarUsage([{ contentRaw: 'Halo $nama, apa kabar?', isCodePassage: false }], 'harlowe');
  check('A1 unit: $var di teks biasa = tampil', u3.get('nama') && u3.get('nama').display === 1);
}

/* ---------- (b) SugarCube ---------- */
const SC_ORIG = tw2('SugarCube', '2.36.1', [
  pd(1, 'Start', '&lt;&lt;set $pesan to "Halo dunia"&gt;&gt;\n&lt;&lt;print $pesan&gt;&gt;'),
  pd(2, 'Key', '&lt;&lt;set $id to "pintu-besi"&gt;&gt;\n&lt;&lt;if $id is "pintu-besi"&gt;&gt;Pintu terbuka.&lt;&lt;/if&gt;&gt;'),
  pd(3, 'Mixed', '&lt;&lt;set $campur to "Selamat datang"&gt;&gt;\n&lt;&lt;print $campur&gt;&gt;\n&lt;&lt;if $campur is "Selamat datang"&gt;&gt;Lagi.&lt;&lt;/if&gt;&gt;'),
  pd(4, 'Esc', '&lt;&lt;set $kutip to "Dia berkata \\"halo\\" padaku"&gt;&gt;\n&lt;&lt;print $kutip&gt;&gt;'),
  pd(5, 'Script', 'Teks biasa. &lt;&lt;script&gt;&gt;var s = "Jangan terjemahkan ini"; State.variables.x = 1;&lt;&lt;/script&gt;&gt; Selesai.'),
]);
{
  const scan = w.scanFile(SC_ORIG, { includeScript: false, translateNames: false });
  const varSegs = scan.segments.filter((s) => s.kind === 'var-string');
  check('B1 SC: 2 segmen var-string otomatis', varSegs.length === 2, JSON.stringify(varSegs.map((s) => s.varName + '=' + s.text)));
  check('B1 SC: $pesan "Halo dunia" otomatis', varSegs.some((s) => s.varName === 'pesan' && s.text === 'Halo dunia'));
  check('B1 SC: $kutip otomatis (escape diurai)', varSegs.some((s) => s.varName === 'kutip' && s.text === 'Dia berkata "halo" padaku'));
  check('B1 SC: tinjau 1 ($campur)', scan.varReview.length === 1 && scan.varReview[0].varName === 'campur', JSON.stringify(scan.varReview.map((c) => c.varName)));
  check('B1 SC: $campur campuran (print + if)', scan.varReview[0] && scan.varReview[0].varClass === 'campuran');
  check('B1 SC: $id KODE — tidak diekstrak', !varSegs.some((s) => s.varName === 'id') && !scan.varReview.some((c) => c.varName === 'id'));
  check('B1 SC: statistik auto 2 / tinjau 1 / kode 1',
    scan.varStats.auto === 2 && scan.varStats.tinjau === 1 && scan.varStats.kode === 1, JSON.stringify(scan.varStats));
  // unit: <<set $a = "...">> (bentuk =) juga dikenali
  const assigns = V3.extractVarAssignments('<<set $a = "Hai semua">>', w.quotedArgs('<<set $a = "Hai semua">>'));
  check('B1 unit: <<set $a = "...">> dikenali', assigns.length === 1 && assigns[0].varName === 'a' && assigns[0].arg.text === 'Hai semua', JSON.stringify(assigns));
  const assigns2 = V3.extractVarAssignments('(set: $a to "satu", $b to "dua")', w.quotedArgs('(set: $a to "satu", $b to "dua")'));
  check('B1 unit: dua penugasan dalam satu (set:) dikenali', assigns2.length === 2 && assigns2[0].varName === 'a' && assigns2[1].varName === 'b', JSON.stringify(assigns2.map((a) => a.varName)));
}

/* ---------- (c) write-back byte-akurat + keputusan tinjauan ---------- */
function setupState(orig) {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(orig) + '; S.translations = new Map(); S.tm = new Map(); S.skipPassages = new Set(); S.varDecisions = new Set(); S.varSkipped = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0 }; S.translateNames = false; S.includeScript = false;');
  w.eval('doScan();');
}
function setTranslationByText(text, tr) {
  const id = w.eval('S.segments.find(function(s){ return s.text === ' + JSON.stringify(text) + '; }) && S.segments.find(function(s){ return s.text === ' + JSON.stringify(text) + '; }).id');
  if (!id) return false;
  w.eval('S.translations.set(' + JSON.stringify(id) + ', { text: ' + JSON.stringify(tr) + ', via: "test" });');
  return true;
}
{
  // Harlowe: terjemahkan hanya segmen otomatis; tinjauan + kode tetap Inggris.
  setupState(H_ORIG);
  check('C1 Harlowe: setup menemukan segmen var-string', setTranslationByText('Selamat pagi', 'Selamat pagi!'));
  const builtH = w.eval('doBuild(false) && S.outputText');
  check('C1 Harlowe: output string', typeof builtH === 'string');
  check('C1 Harlowe: var otomatis mendarat byte-akurat', builtH.includes('(put: "Selamat pagi!" into $salam)'));
  check('C1 Harlowe: tinjauan belum disetujui tetap Inggris', builtH.includes('(set: $pesan to "Selamat datang di stasiun")'));
  check('C1 Harlowe: kode tetap Inggris', builtH.includes('(set: $kunci to "pintu-besi")'));
  check('C1 Harlowe: pendek + tak dipakai tetap Inggris', builtH.includes('(set: $x to "OK")') && builtH.includes('(set: $takdipakai to "Halo dunia")'));
  check('C1 Harlowe: nama tetap Inggris (tidak diterjemahkan)', builtH.includes('(set: $nama to "Anya")'));
  check('C1 Harlowe: di luar string variabel, output identik dengan asli',
    builtH.replace('(put: "Selamat pagi!" into $salam)', '(put: "Selamat pagi" into $salam)') === H_ORIG);
}
{
  // SugarCube: terjemahkan otomatis + setujui tinjauan; cek byte-akurat total.
  setupState(SC_ORIG);
  check('C2 SC: setup menemukan segmen var-string', setTranslationByText('Halo dunia', 'Hai dunia!'));
  check('C2 SC: setup menemukan segmen escape', setTranslationByText('Dia berkata "halo" padaku', 'Dia bilang "halo" padaku'));
  // Setujui $campur (tinjauan) lalu terjemahkan.
  const campurKey = w.eval('S.varReview.find(function(c){ return c.varName === "campur"; }) && S.varReview.find(function(c){ return c.varName === "campur"; }).key');
  check('C2 SC: kunci tinjauan $campur ada', !!campurKey);
  if (campurKey) w.eval('approveVarItem(' + JSON.stringify(campurKey) + ');');
  check('C2 SC: sesudah disetujui, tinjauan kosong', w.eval('S.varReview.length') === 0);
  check('C2 SC: sesudah disetujui, segmen $campur masuk Daftar Teks',
    w.eval('S.segments.some(function(s){ return s.kind === "var-string" && s.varName === "campur"; })') === true);
  check('C2 SC: terjemahan $campur bisa dipasang', setTranslationByText('Selamat datang', 'Selamat datang!'));
  const built = w.eval('doBuild(false) && S.outputText');
  check('C2 SC: output string', typeof built === 'string');
  check('C2 SC: $pesan mendarat byte-akurat', built.includes('&lt;&lt;set $pesan to "Hai dunia!"&gt;&gt;'));
  check('C2 SC: $campur (disetujui) mendarat byte-akurat', built.includes('&lt;&lt;set $campur to "Selamat datang!"&gt;&gt;'));
  check('C2 SC: string (if:) $campur TIDAK ikut berubah', built.includes('&lt;&lt;if $campur is "Selamat datang"&gt;&gt;'));
  check('C2 SC: $id kode tetap Inggris', built.includes('&lt;&lt;set $id to "pintu-besi"&gt;&gt;'));
  const expected = SC_ORIG
    .replace('"Halo dunia"', '"Hai dunia!"')
    .replace('"Selamat datang"', '"Selamat datang!"')
    .replace('"Dia berkata \\"halo\\" padaku"', '"Dia bilang \\"halo\\" padaku"');
  check('C2 SC: byte-akurat (hanya 3 string berubah)', built === expected,
    'selisih: ' + (built === expected ? '-' : JSON.stringify({ got: built.slice(0, 400), exp: expected.slice(0, 400) })));
  // Pindai ulang: keputusan bertahan, segmen $campur tetap ada.
  w.eval('doScan();');
  check('C2 SC: pindai ulang — $campur tetap segmen (keputusan tersimpan)',
    w.eval('S.segments.some(function(s){ return s.kind === "var-string" && s.varName === "campur"; })') === true);
  check('C2 SC: pindai ulang — tinjauan tetap kosong',
    w.eval('S.varReview.length') === 0);
  // Biarkan (kode): $campur di fixture baru -> dibiarkan, tidak jadi segmen.
  setupState(SC_ORIG);
  const k2 = w.eval('S.varReview.find(function(c){ return c.varName === "campur"; }) && S.varReview.find(function(c){ return c.varName === "campur"; }).key');
  if (k2) w.eval('skipVarItem(' + JSON.stringify(k2) + ');');
  check('C2 SC: sesudah Biarkan, $campur tidak jadi segmen',
    w.eval('S.segments.some(function(s){ return s.kind === "var-string" && s.varName === "campur"; })') === false);
  w.eval('doScan();');
  check('C2 SC: pindai ulang — $campur yang dibiarkan tetap tidak jadi segmen',
    w.eval('S.segments.some(function(s){ return s.kind === "var-string" && s.varName === "campur"; })') === false
    && w.eval('S.varReview.length') === 0);
}

/* ---------- (d) escape tetap valid sesudah Timpa ---------- */
{
  setupState(SC_ORIG);
  setTranslationByText('Dia berkata "halo" padaku', 'Dia bilang "halo" padaku');
  const built = w.eval('doBuild(false) && S.outputText');
  check('D1 escape: kutip di dalam string tetap ter-escape di output', built.includes('Dia bilang \\"halo\\" padaku'));
  const re = w.scanFile(built, { includeScript: false, translateNames: false });
  const seg = re.segments.find((s) => s.kind === 'var-string' && s.varName === 'kutip');
  check('D1 escape: pindai ulang menemukan string hasil dengan teks utuh', !!seg && seg.text === 'Dia bilang "halo" padaku', JSON.stringify(seg && seg.text));
  check('D1 escape: offset segmen menunjuk isi string (kutip utuh)',
    !!seg && built.slice(seg.rawStart, seg.rawEnd) === 'Dia bilang \\"halo\\" padaku');
}

/* ---------- (e) penjaga v2 tidak rusak ---------- */
{
  const scan = w.scanFile(SC_ORIG, { includeScript: false, translateNames: false });
  check('E1 penjaga: isi <<script>> tidak masuk Daftar Teks',
    scan.segments.filter((s) => /Jangan terjemahkan ini|State\.variables/.test(s.text)).length === 0);
  check('E1 penjaga: teks biasa di sekitar script tetap ketemu',
    scan.segments.some((s) => s.text.includes('Teks biasa')) && scan.segments.some((s) => s.text.includes('Selesai')));
  check('E1 penjaga: tidak ada kandidat variabel dari dalam <<script>>',
    scan.varReview.filter((c) => /Jangan/.test(c.text)).length === 0);
}

/* ---------- Seedship asli: hitungan per kelas + regresi segmen ----------
   Baseline v2 (test_perbaiki_kode.js H1 / ukur langsung): 5134 segmen.
   v3: 4441 segmen = 5134 - 693 segmen kode yang bocor di v2 + 0 segmen
   variabel otomatis. Ke-693 itu BUKAN teks tampil: semuanya berada di
   dalam blok <<script>>/<<widget>> dan lolos di v2 karena bug
   segmentSugarCube (setelah blok kode, `last = te` mengembalikan
   pemindaian ke DALAM blok sehingga spasi/komentar/kode ikut disegmen).
   v3 memperbaiki lompatan itu (re.lastIndex = endPos) sehingga blok kode
   dilewati utuh — diverifikasi di bawah: tidak ada lagi segmen yang
   isinya sampah escape/komentar JS/marker @@. */
{
  const origSeed = fs.readFileSync('/home/hatch/workspace/user/files/index.html', 'utf8');
  const scan = w.scanFile(origSeed, { includeScript: false, translateNames: false });
  console.log('   Seedship: segmen=' + scan.segments.length + ' varStats=' + JSON.stringify(scan.varStats) + ' tinjau=' + scan.varReview.length);
  check('F1 Seedship: jumlah segmen 4441 (= 5134 baseline v2 - 693 kode bocor)', scan.segments.length === 4441, 'segs=' + scan.segments.length);
  check('F1 Seedship: varStats auto 0 / tinjau 6 / kode 11',
    scan.varStats.auto === 0 && scan.varStats.tinjau === 6 && scan.varStats.kode === 11, JSON.stringify(scan.varStats));
  check('F1 Seedship: 6 tinjauan = $hiscore "Move on" x2, "Destroyed in space", $system "sleep chambers" x2, $event_planet "Rich"',
    scan.varReview.length === 6
    && scan.varReview.filter((c) => c.varName === 'hiscore' && c.text === 'Move on').length === 2
    && scan.varReview.some((c) => c.varName === 'hiscore' && c.text === 'Destroyed in space')
    && scan.varReview.filter((c) => c.varName === 'system' && c.text === 'sleep chambers').length === 2
    && scan.varReview.some((c) => c.varName === 'event_planet' && c.text === 'Rich'),
    JSON.stringify(scan.varReview.map((c) => c.varName + '=' + c.text)));
  check('F1 Seedship: semua tinjauan kelas campuran (kunci yang juga tampil)',
    scan.varReview.every((c) => c.varClass === 'campuran'));
  check('F1 Seedship: tidak ada segmen var-string (auto 0)', scan.segments.filter((s) => s.kind === 'var-string').length === 0);
  check('F1 Seedship: tidak ada segmen di dalam blok <<script>>/<<widget>>/<<stylesheet>> (bukti langsung perbaikan lompatan blok kode)',
    (() => {
      const ranges = [];
      const reBlock = /&lt;&lt;\s*(script|widget|stylesheet|javascript)\b[\s\S]*?&lt;&lt;\s*\/\s*\1\s*&gt;&gt;/g;
      let bm;
      while ((bm = reBlock.exec(origSeed))) ranges.push([bm.index, bm.index + bm[0].length]);
      const leaked = scan.segments.filter((s) => ranges.some(([a, b]) => s.rawStart >= a && s.rawEnd <= b));
      return leaked.length === 0;
    })());
  check('F1 Seedship: segmen escape-murni (pemisah \\n\\t file Twine 1, sudah ada di v2) berkurang: 3191 dari 3662 di v2',
    scan.segments.filter((s) => /^[\\nt\s]+$/.test(s.text)).length === 3191);
  check('F1 Seedship: dialog tetap ketemu', scan.segments.some((s) => s.text.indexOf("seedship's course") >= 0 || s.text.indexOf('The seedship') >= 0));
}

console.log('\nTEKS_VARIABEL: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
