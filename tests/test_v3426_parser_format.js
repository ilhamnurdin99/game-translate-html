/* Test v3.4.26 (tema parser + penulisan balik & format) — klaim review
   Gemini 1, 2, 7, 8, 9, 10, 11, 12, 14, 15.
   Jalankan: node tests/test_v3426_parser_format.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook v3.4.26 + perbaikan belum ada),
   lalu perbaikan minimal.
   Spec (ide-perbaikan-gemini-v3426.md):
   1. (a) escape &<> di cabang <<link>>; (b) segmen argumen macro
      ditandai macroArg + escaper gabungan saat Timpa (bukan untuk
      teks biasa); (c) target [[...]] di-encode.
   2. repairTranslations menyisipkan variabel di posisi aman (batas
      kata / akhir kalimat), tolak bila jatuh di tengah kata/tag.
   7. verifyOutput: cek target <<link>>/<<button>> + keseimbangan
      << >> juga untuk bentuk ter-encode; strip textNoMacro untuk
      bentuk ter-encode.
   8. Pencocok macro sadar-tanda-kutip (>> di dalam "..." tidak
      memotong macro).
   9. LINK_TOKEN_RE mengizinkan setter array bersarang satu tingkat +
      setter ber-kutip berisi ].
   10. parsePo memakai parser satu-per-satu (round-trip \\n \\t \\" \\\\).
   11. ctx.atSpan disimpan/dipulihkan di sekitar rekursi <<widget>>.
   12. extractJsStrings melewati tagged template; escapeJsString /
      escapeTemplateText meng-escape </script>.
   14. translateBatch memecah batch Google/Dict bila URL > ~7.000.
   15. parseCustomResponse mencoba semua fence sebelum menyerah. */
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

  const V3426 = w.__GTHTML_V3426__;
  const V342 = w.__GTHTML_V342__;
  const V343 = w.__GTHTML_V343__;
  const V348 = w.__GTHTML_V348__;
  const GT = w.GTHTML;

  /* ---------- A0: hook ---------- */
  check('A0 hook v3.4.26 tersedia', !!V3426 && typeof V3426.parseCustomResponse === 'function' && typeof V3426.repairTranslations === 'function', 'hook: ' + typeof V3426);
  if (!V3426 || typeof V3426.parseCustomResponse !== 'function') { console.log('\nV3426_PARSER_FORMAT: hook v3.4.26 belum ada — RED'); process.exit(1); }

  const HEAD = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n';
  const TAIL = '</tw-storydata></body></html>';
  const P = (pid, name, body) => '<tw-passagedata pid="' + pid + '" name="' + name + '" tags="" position="100,100" size="100,100">' + body + '</tw-passagedata>\n';
  function setupState(fix, extra) {
    const opts = Object.assign({ translateNames: false, linkLabels: false }, extra || {});
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.downloaded = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = ' + opts.translateNames + '; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = ' + opts.linkLabels + '; S.linkNoBodyTargets = []; S.running = false; S.cancelled = false;');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  const segByText = (S, t) => S.segments.find((s) => s.text === t);
  const textsOf = (S) => S.segments.map((s) => s.text);

  /* ---------- klaim 8 + 9: fixture lampiran laporan ---------- */
  const FIX89 = HEAD
    + P(1, 'Start', 'Hello world. [[Lanjut][$arr[0] = 1]] More text here.')
    + P(2, 'Lanjut', 'Second passage text here.')
    + P(3, 'Set', '&lt;&lt;set $x = &quot;a &gt;&gt; b&quot;&gt;&gt; After set text here.')
    + TAIL;
  let S = setupState(FIX89);
  check('K9 tautan setter array tidak tertelan jadi satu segmen', !textsOf(S).some((t) => t.includes('[[')), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K9 kalimat sebelum + sesudah tautan setter array jadi segmen', segByText(S, 'Hello world.') && segByText(S, 'More text here.'), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K8 macro terpotong tidak menghasilkan segmen sisa', !textsOf(S).some((t) => t.includes('b">>')), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K8 teks sesudah macro <<set "a >> b">> tetap jadi segmen', !!segByText(S, 'After set text here.'), 'segmen: ' + JSON.stringify(textsOf(S)));

  // Setter array bersarang variabel + setter ber-kutip berisi ].
  const FIX9B = HEAD
    + P(1, 'Start', 'Before text. [[Lanjut][$arr[$i] = 1]] After text.')
    + P(2, 'Lanjut', 'Second passage text here.')
    + TAIL;
  S = setupState(FIX9B);
  check('K9 setter [$arr[$i] = 1] dikenali (bukan segmen)', !textsOf(S).some((t) => t.includes('[[')) && !!segByText(S, 'Before text.') && !!segByText(S, 'After text.'), 'segmen: ' + JSON.stringify(textsOf(S)));
  const FIX9C = HEAD
    + P(1, 'Start', 'Before text. [[Lanjut][$x to "a]b"]] After text.')
    + P(2, 'Lanjut', 'Second passage text here.')
    + TAIL;
  S = setupState(FIX9C);
  check('K9 setter ber-kutip berisi ] dikenali (bukan segmen)', !textsOf(S).some((t) => t.includes('[[')) && !!segByText(S, 'Before text.') && !!segByText(S, 'After text.'), 'segmen: ' + JSON.stringify(textsOf(S)));
  // Regex langsung.
  check('K9 LINK_TOKEN_RE cocok setter array', V3426.LINK_TOKEN_RE.test('[[Lanjut][$arr[0] = 1]]') && V3426.LINK_TOKEN_RE.test('[[Lanjut][$arr[$i] = 1]]') && V3426.LINK_TOKEN_RE.test('[[Lanjut][$x to "a]b"]]'), 're: ' + V3426.LINK_TOKEN_RE);
  check('K9 LINK_TOKEN_RE tetap cocok setter sederhana + tanpa setter', V3426.LINK_TOKEN_RE.test('[[Lanjut][$x = 1]]') && V3426.LINK_TOKEN_RE.test('[[Lanjut]]') && V3426.LINK_TOKEN_RE.test('[[Label|Target]]'));
  check('K9 LINK_TOKEN_RE tidak cocok teks biasa', !V3426.LINK_TOKEN_RE.test('plain text here'));

  // Label ">> Lanjut" + operator > tunggal (regresi).
  const FIX8B = HEAD
    + P(1, 'Start', '&lt;&lt;link &quot;&gt;&gt; Lanjut&quot;&gt;&gt;Body text here.&lt;&lt;/link&gt;&gt;')
    + P(2, 'Next', '&lt;&lt;if $a &gt; $b&gt;&gt;Yes text here.&lt;&lt;/if&gt;&gt;')
    + TAIL;
  S = setupState(FIX8B);
  check('K8 label ">> Lanjut" jadi segmen utuh', !!segByText(S, '>> Lanjut'), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K8 badan link ">> Lanjut" tetap jadi segmen', !!segByText(S, 'Body text here.'), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K8 tidak ada segmen sisa potongan macro link', !textsOf(S).some((t) => t.includes('Lanjut">>')), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K8 operator > tunggal di <<if>> tidak merusak pindai', !!segByText(S, 'Yes text here.') && !textsOf(S).some((t) => t.includes('$a')), 'segmen: ' + JSON.stringify(textsOf(S)));
  // Pencocok macro langsung.
  const mTok = '<<set $x = "a >> b">> sisa'.match(new RegExp(V3426.MACRO_TOKEN_RE.source, 'g'));
  check('K8 MACRO_TOKEN_RE tidak berhenti di >> dalam kutip', mTok && mTok.length === 1 && mTok[0] === '<<set $x = "a >> b">>', JSON.stringify(mTok));

  /* ---------- klaim 11: ctx.atSpan tidak bocor dari <<widget>> ---------- */
  const FIX11 = HEAD
    + P(1, 'Start', 'Before widget text. &lt;&lt;widget &quot;w&quot;&gt;&gt;@@.x;teks widget&lt;&lt;/widget&gt;&gt; After widget text. [[Label|Target]] End text.')
    + P(2, 'Target', 'Target passage text.')
    + TAIL;
  S = setupState(FIX11);
  check('K11 label [[Label|Target]] sesudah widget tetap jadi segmen', !!segByText(S, 'Label'), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K11 teks sesudah widget tetap jadi segmen', !!segByText(S, 'After widget text.') && !!segByText(S, 'End text.'), 'segmen: ' + JSON.stringify(textsOf(S)));
  check('K11 teks di dalam span @@ widget tetap bukan segmen', !textsOf(S).some((t) => t.includes('teks widget')), 'segmen: ' + JSON.stringify(textsOf(S)));

  /* ---------- klaim 7: verifyOutput bentuk ter-encode ---------- */
  const FIX7 = HEAD
    + P(1, 'Start', 'Some text. &lt;&lt;link &quot;Go&quot; &quot;Elsewhere&quot;&gt;&gt; More text.')
    + P(2, 'Elsewhere', 'Elsewhere passage text.')
    + TAIL;
  S = setupState(FIX7);
  const checkByLabel = (checks, labelStart) => checks.find((c) => c.label.indexOf(labelStart) === 0);
  let checks = V342.verifyOutput(FIX7);
  const tgtOk = checkByLabel(checks, 'Target tautan statis');
  check('K7 target <<link>> ter-encode yang ada lolos cek', !!tgtOk && tgtOk.ok === true, JSON.stringify(tgtOk));
  const balOk = checkByLabel(checks, 'Tanda << dan >> seimbang');
  check('K7 keseimbangan &lt;&lt; &gt;&gt; utuh lolos cek', !!balOk && balOk.ok === true, JSON.stringify(balOk));
  const FIX7_BAD_TARGET = FIX7.replace('name="Elsewhere"', 'name="Other"');
  checks = V342.verifyOutput(FIX7_BAD_TARGET);
  const tgtBad = checkByLabel(checks, 'Target tautan statis');
  check('K7 target <<link>> ter-encode yang hilang GAGAL cek', !!tgtBad && tgtBad.ok === false, JSON.stringify(tgtBad));
  const FIX7_BAD_BAL = FIX7.replace('&gt;&gt; More text.', '&gt; More text.');
  checks = V342.verifyOutput(FIX7_BAD_BAL);
  const balBad = checkByLabel(checks, 'Tanda << dan >> seimbang');
  check('K7 satu &gt;&gt; yang dihapus GAGAL cek keseimbangan', !!balBad && balBad.ok === false, JSON.stringify(balBad));
  // [[Home]] di dalam argumen macro ter-encode bukan target navigasi.
  const FIX7C = HEAD
    + P(1, 'Start', 'Some text here. &lt;&lt;addToLoc &quot;[[Home]]&quot;&gt;&gt; More text.')
    + TAIL;
  S = setupState(FIX7C);
  checks = V342.verifyOutput(FIX7C);
  const tgtC = checkByLabel(checks, 'Target tautan statis');
  check('K7 [[...]] di dalam argumen macro ter-encode bukan target', !tgtC, JSON.stringify(tgtC));

  /* ---------- klaim 1: encoding penulisan balik ---------- */
  // (a) cabang <<link>>: &<> di-escape.
  const linkRep = V3426.singleLinkReplacement({ macro: 'link', quote: '"' }, 'A < B & C', 'Target', true);
  check('K1a label <<link>> ber-< dan & di-escape', linkRep.includes('A &lt; B &amp; C') && !linkRep.includes('A < B'), JSON.stringify(linkRep));
  // (b) argumen macro: segmen ditandai macroArg + escaper gabungan.
  const FIX1B = HEAD
    + P(1, 'Start', '&lt;&lt;dialog &quot;Hello there&quot;&gt;&gt; He said "hi".')
    + TAIL;
  S = setupState(FIX1B);
  const dlgSeg = segByText(S, 'Hello there');
  check('K1b segmen argumen macro ditandai macroArg', !!dlgSeg && dlgSeg.macroArg === true && dlgSeg.macro === 'dialog', JSON.stringify(dlgSeg));
  S.translations.set(dlgSeg.id, { text: 'Katakan "halo"', via: 'manual' });
  const txtSeg = segByText(S, 'He said "hi".');
  S.translations.set(txtSeg.id, { text: 'Dia berkata "halo".', via: 'manual' });
  const built1 = V342.buildOutput().text;
  check('K1b kutip di terjemahan argumen macro di-escape gaya-JS', built1.includes('Katakan \\"halo\\"'), JSON.stringify(built1));
  check('K1b kutip di teks biasa TIDAK di-escape gaya-JS', !built1.includes('Dia berkata \\"halo\\"') && built1.includes('Dia berkata &quot;halo&quot;.'), JSON.stringify(built1));
  // (c) target [[...]] di-encode.
  const FIX1C = HEAD
    + P(1, 'Start', 'Go there. [[Visit|Cafe &amp; Bar]]')
    + P(2, 'Cafe &amp; Bar', 'Cafe passage text.')
    + TAIL;
  S = setupState(FIX1C, { translateNames: true });
  const nameSeg = S.segments.find((s) => s.kind === 'passage-name' && s.text === 'Cafe & Bar');
  check('K1c segmen nama passage "Cafe & Bar" ada', !!nameSeg, 'segmen: ' + JSON.stringify(textsOf(S)));
  S.translations.set(nameSeg.id, { text: 'Kafe & Bar', via: 'manual' });
  const built1c = V342.buildOutput().text;
  check('K1c target [[...]] ber-& ditulis ter-encode', built1c.includes('[[Visit|Kafe &amp; Bar]]') && !built1c.includes('Kafe & Bar]]'), JSON.stringify(built1c));

  /* ---------- klaim 2: repairTranslations posisi aman ---------- */
  const FIX2 = HEAD
    + P(1, 'Start', 'Goodbye, $name.')
    + P(2, 'P2', 'You are $name, my friend.')
    + P(3, 'P3', 'Click $name now.')
    + P(4, 'P4', '$name smiled.')
    + TAIL;
  S = setupState(FIX2);
  const setTr2 = (en, id) => S.translations.set(segByText(S, en).id, { text: id, via: 'manual' });
  setTr2('Goodbye, $name.', 'Selamat tinggal.');
  setTr2('You are $name, my friend.', 'Kamu adalah temanku.');
  setTr2('Click $name now.', 'Klik <b>tautan</b> sekarang.');
  setTr2('$name smiled.', 'Dia tersenyum.');
  const rep2 = await V342.repairTranslations();
  const trOf = (en) => S.translations.get(segByText(S, en).id);
  check('K2 variabel akhir kalimat disisipkan sebelum tanda baca akhir', trOf('Goodbye, $name.').text === 'Selamat tinggal $name.', JSON.stringify(trOf('Goodbye, $name.')));
  check('K2 variabel tengah disisipkan di batas kata (bukan tengah kata)', trOf('You are $name, my friend.').text === 'Kamu adalah $name temanku.', JSON.stringify(trOf('You are $name, my friend.')));
  check('K2 variabel awal kalimat disisipkan di awal + spasi', trOf('$name smiled.').text === '$name Dia tersenyum.', JSON.stringify(trOf('$name smiled.')));
  check('K2 posisi di dalam tag <...> ditolak (revert)', trOf('Click $name now.').failed === true, JSON.stringify(trOf('Click $name now.')));
  check('K2 hitungan repaired/reverted benar', rep2.repaired.length === 3 && rep2.reverted.length === 1, JSON.stringify({ repaired: rep2.repaired.length, reverted: rep2.reverted.length }));

  /* ---------- klaim 10: parsePo round-trip ---------- */
  const poDirect = 'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n'
    + 'msgid "C:\\\\new"\nmsgstr "C:\\\\baru"\n\n'
    + 'msgid "a\\\\tb"\nmsgstr "a\\\\tb-id"\n\n'
    + 'msgid "say \\"hi\\""\nmsgstr "kata \\"halo\\""\n\n'
    + 'msgid "a\\\\\\\\b"\nmsgstr "a\\\\\\\\b-id"\n';
  const mapPo = V3426.parsePo(poDirect);
  check('K10 \\\\n harfiah tidak jadi newline', mapPo.get('C:\\new') === 'C:\\baru', JSON.stringify([...mapPo.entries()]));
  check('K10 \\\\t harfiah tidak jadi tab', mapPo.get('a\\tb') === 'a\\tb-id', JSON.stringify([...mapPo.entries()]));
  check('K10 \\\\" tetap jadi kutip', mapPo.get('say "hi"') === 'kata "halo"', JSON.stringify([...mapPo.entries()]));
  check('K10 \\\\\\\\ tetap dua backslash', mapPo.get('a\\\\b') === 'a\\\\b-id', JSON.stringify([...mapPo.entries()]));
  // Round-trip buildPo -> parsePo.
  const FIX10 = HEAD
    + P(1, 'Start', 'Path C:\\new folder.')
    + P(2, 'P2', 'Say "hi" now.')
    + TAIL;
  S = setupState(FIX10);
  S.translations.set(segByText(S, 'Path C:\\new folder.').id, { text: 'Jalur C:\\baru folder.', via: 'manual' });
  S.translations.set(segByText(S, 'Say "hi" now.').id, { text: 'Katakan "halo" sekarang.', via: 'manual' });
  const poBuilt = V3426.buildPo();
  const mapRt = V3426.parsePo(poBuilt);
  check('K10 round-trip .po: backslash+n utuh', mapRt.get('Path C:\\new folder.') === 'Jalur C:\\baru folder.', JSON.stringify([...mapRt.entries()]));
  check('K10 round-trip .po: kutip utuh', mapRt.get('Say "hi" now.') === 'Katakan "halo" sekarang.', JSON.stringify([...mapRt.entries()]));

  /* ---------- klaim 12: tagged template + </script> ---------- */
  const jsRes = GT.extractJsStrings('const s = css`color: red;`;\nconst t = "Hello world";\nconst u = `Hello template`;', 0);
  check('K12 tagged template css`...` bukan segmen', !jsRes.strings.some((s) => s.text.includes('color: red')), JSON.stringify(jsRes.strings.map((s) => s.text)));
  check('K12 string biasa + template tanpa tag tetap segmen', jsRes.strings.some((s) => s.text === 'Hello world') && jsRes.strings.some((s) => s.text === 'Hello template'), JSON.stringify(jsRes.strings.map((s) => s.text)));
  const escJs = GT.escapeJsString('a</script>b', '"');
  check('K12 escapeJsString meng-escape </script>', escJs.includes('<\\/script>') && !escJs.includes('</script>'), JSON.stringify(escJs));
  const escTpl = GT.escapeTemplateText('a</script>b');
  check('K12 escapeTemplateText meng-escape </script>', escTpl.includes('<\\/script>') && !escTpl.includes('</script>'), JSON.stringify(escTpl));

  /* ---------- klaim 14: pecah batch Google/Dict ---------- */
  const urls = [];
  w.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('translate.googleapis.com')) {
      const params = new URLSearchParams(u.split('?')[1]);
      const qs = params.getAll('q');
      return { ok: true, status: 200, json: async () => [qs.map((q) => [['TR:' + q.slice(0, 4), q]])] };
    }
    if (u.includes('clients5.google.com')) {
      const params = new URLSearchParams(u.split('?')[1]);
      return { ok: true, status: 200, json: async () => params.getAll('q').map((q) => 'DICT:' + q.slice(0, 4)) };
    }
    throw new Error('fetch tak dikenal: ' + u);
  };
  const long10 = Array.from({ length: 10 }, (_, i) => 'x'.repeat(2000) + i);
  urls.length = 0;
  const gOut = await V3426.googleBatch(long10, 'en', 'id');
  check('K14 batch Google 10x2000 dipecah jadi beberapa request', urls.length >= 3, 'requests: ' + urls.length);
  check('K14 tiap URL Google di bawah batas', urls.every((u) => u.length <= 7100), 'max: ' + Math.max(...urls.map((u) => u.length)));
  check('K14 hasil Google tetap 10 + urut', gOut.length === 10 && gOut.every((t, i) => t === 'TR:xxxx'), JSON.stringify(gOut.slice(0, 3)));
  urls.length = 0;
  const dOut = await V3426.googleDictBatch(long10, 'en', 'id');
  check('K14 batch Dict 10x2000 dipecah jadi beberapa request', urls.length >= 3, 'requests: ' + urls.length);
  check('K14 tiap URL Dict di bawah batas', urls.every((u) => u.length <= 7100), 'max: ' + Math.max(...urls.map((u) => u.length)));
  check('K14 hasil Dict tetap 10 + urut', dOut.length === 10 && dOut.every((t) => t === 'DICT:xxxx'), JSON.stringify(dOut.slice(0, 3)));
  // Marker: mock mengembalikan marker per chunk (indeks global).
  let markerSeen = 0;
  w.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('translate.googleapis.com')) {
      const params = new URLSearchParams(u.split('?')[1]);
      const q = params.getAll('q')[0] || '';
      const parts = q.split('\n');
      const n = (parts.length - 1) / 2; // jumlah teks di chunk ini
      let joined = '';
      const MARKER = (i) => 'ZXQSEP' + String(i).padStart(5, '0') + 'QXZ';
      for (let i = 0; i < n; i++) joined += MARKER(i) + 'TR' + (markerSeen + i);
      joined += MARKER(n);
      markerSeen += n;
      return { ok: true, status: 200, json: async () => [[[[joined, '']]]] };
    }
    throw new Error('fetch tak dikenal: ' + u);
  };
  urls.length = 0;
  const mOut = await V3426.googleBatchMarkers(long10, 'en', 'id');
  check('K14 batch marker 10x2000 dipecah jadi beberapa request', urls.length >= 3, 'requests: ' + urls.length);
  check('K14 tiap URL marker di bawah batas', urls.every((u) => u.length <= 7100), 'max: ' + Math.max(...urls.map((u) => u.length)));
  check('K14 hasil marker tetap 10 + urut', mOut.length === 10 && mOut.every((t, i) => t === 'TR' + i), JSON.stringify(mOut));

  /* ---------- klaim 15: parseCustomResponse semua fence ---------- */
  const pc = V3426.parseCustomResponse;
  check('K15 fence contoh dulu lalu fence jawaban', JSON.stringify(pc('Contoh:\n```json\n["contoh"]\n```\nJawaban:\n```json\n["Satu", "Dua"]\n```', 2)) === JSON.stringify(['Satu', 'Dua']), JSON.stringify(pc('Contoh:\n```json\n["contoh"]\n```\nJawaban:\n```json\n["Satu", "Dua"]\n```', 2)));
  check('K15 fence pertama bukan JSON, kedua valid', JSON.stringify(pc('```\nbukan json\n```\n```json\n["A", "B"]\n```', 2)) === JSON.stringify(['A', 'B']));
  check('K15 tanpa fence tetap jalan (regresi)', JSON.stringify(pc('["A", "B"]', 2)) === JSON.stringify(['A', 'B']));
  check('K15 fence berisi bukan-array, jawaban di luar fence', JSON.stringify(pc('```\n[1, 2]\n```\nHasil: ["A", "B"]', 2)) === JSON.stringify(['A', 'B']));
  check('K15 satu fence valid tetap jalan (regresi)', JSON.stringify(pc('```json\n["A", "B"]\n```', 2)) === JSON.stringify(['A', 'B']));

  console.log('\nV3426_PARSER_FORMAT: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
