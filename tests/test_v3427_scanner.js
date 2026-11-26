/* Test v3.4.27 — Perbaikan scanner anti-bocor kode (saran AI Studio,
   butir 2, 3, 4, 5).
   Jalankan: node tests/test_v3427_scanner.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook v3.4.27 + perbaikan belum ada),
   lalu perbaikan minimal.
   Spec (ide-scanner-v3427.md):
   2. Tutup celah blok kode: token <style>/<script> diperpanjang sampai
      penutup di segmentSugarCube; <<silently>> teks polos dilewati
      (badan macro DOM <<replace>>/<<append>>/<<prepend>> tetap
      dipindai); isCodePassage cek tags="script"/"stylesheet" +
      StorySettings; <svg> dikecualikan (isi <text> teks tampil).
   3. @@...@@: kupas prefix properti CSS (bukan hanya .kelas;);
      harlowePlainGap kenali hook bernama |nama> dan <nama|.
   4. Aturan keras CSS/JSON/ekspresi Twine di scanAccepts SEBELUM baris
      OR; emitPlainRunCore pecah per baris (baris kode dibuang, baris
      narasi berurutan tetap satu segmen).
   5. isCodePosition: console.*, add/removeEventListener (arg 1),
      createElement (arg 1), setAttribute (arg 1), classList.*,
      localStorage/sessionStorage get/set/remove (arg 1), new RegExp,
      nilai properti teknis (id/className/type/src/href/url/key/event/
      selector/storageKey) bila tanpa spasi.
   TIDAK ikut: butir 1 (lexer, v3.4.28), butir 6 (filter UI, backlog).
   A0: label versi naik ke v3.4.27. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 500) : '')); }
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

  const G = w.GTHTML;
  const V3427 = w.__GTHTML_V3427__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.27 tersedia', !!V3427 && typeof V3427.scanFile === 'function' && typeof V3427.scanAccepts === 'function' && typeof V3427.isCodePosition === 'function', 'hook: ' + typeof V3427);
  check('A0 label versi v3.4.27', html.includes('Game Translate HTML v3.4.27') && !html.includes('Game Translate HTML v3.4.26'));
  if (!V3427 || typeof V3427.scanFile !== 'function') { console.log('\nV3427_SCANNER: hook v3.4.27 belum ada — RED'); process.exit(1); }

  function setupState(fix, includeScript) {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = ' + (includeScript ? 'true' : 'false') + '; S.linkLabels = false; S.origDownloaded = false; S.needsReupload = false;');
    w.eval('doScan();');
    return V3427.state;
  }
  const texts = (S) => S.segments.map((s) => s.text);
  const has = (S, t) => texts(S).includes(t);
  const leaked = (S, words) => S.segments.filter((s) => words.some((b) => s.text.includes(b)));
  function twine(passages, format) {
    format = format || 'SugarCube';
    let body = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
      + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="' + format + '" format-version="2.37.3" options="" hidden>\n';
    passages.forEach((p, i) => {
      body += '<tw-passagedata pid="' + (i + 1) + '" name="' + p[0] + '" tags="' + (p[2] || '') + '" position="100,100" size="100,100">' + p[1] + '</tw-passagedata>\n';
    });
    return body + '</tw-storydata></body></html>';
  }
  function translateAll(S) {
    for (const seg of S.segments) {
      if (!seg.translatable || seg.skipped || seg.kind === 'link-target') continue;
      S.translations.set(seg.id, { text: 'ID: ' + seg.text, via: 'test' });
    }
  }

  /* ---------- B: butir 2 — celah blok kode ---------- */
  let S = setupState(twine([
    ['Style', '<style>color: #fff; margin-top: 8px;</style> Kalimat gaya.'],
    ['StyleAttr', '<style type="text/css">.a { color: red; }</style> Kalimat.'],
    ['Script', '<script>var x = 1; console.log("halo");</script> Kalimat skrip.'],
    ['ScriptNoEq', '<script>showMenu()</script> Kalimat kedua.'],
    ['Svg', '<svg><text>Teks di svg</text></svg> Kalimat biasa.'],
  ]));
  check('B1 isi <style> tidak jadi segmen', leaked(S, ['color:', '#fff', 'margin-top']).length === 0 && has(S, 'Kalimat gaya.'), JSON.stringify(texts(S)));
  check('B1 isi <style> ber-atribut tidak jadi segmen', leaked(S, ['.a { color']).length === 0 && has(S, 'Kalimat.'), JSON.stringify(texts(S)));
  check('B1 isi <script> tidak jadi segmen', leaked(S, ['var x', 'console.log', 'halo']).length === 0 && has(S, 'Kalimat skrip.'), JSON.stringify(texts(S)));
  check('B1 isi <script> tanpa =/; tidak jadi segmen', leaked(S, ['showMenu']).length === 0 && has(S, 'Kalimat kedua.'), JSON.stringify(texts(S)));
  check('B1 isi <text> SVG tetap jadi segmen (bukan bocor)', has(S, 'Teks di svg') && has(S, 'Kalimat biasa.'), JSON.stringify(texts(S)));

  S = setupState(twine([
    ['Sil1', '&lt;&lt;silently&gt;&gt;Catatan rahasia di sini.&lt;&lt;/silently&gt;&gt; Kalimat tampak.'],
    ['Sil2', '&lt;&lt;silently&gt;&gt;&lt;&lt;replace "#target"&gt;&gt;Teks ganti&lt;&lt;/replace&gt;&gt; Catatan rahasia.&lt;&lt;/silently&gt;&gt; Kalimat tampak.'],
    ['Sil3', '&lt;&lt;silently&gt;&gt;&lt;&lt;print "Teks cetak"&gt;&gt;&lt;&lt;/silently&gt;&gt; Sesudah cetak.'],
    ['Sil4', '&lt;&lt;silently&gt;&gt;&lt;&lt;link "Label tautan"&gt;&gt;Isi tautan&lt;&lt;/link&gt;&gt;&lt;&lt;/silently&gt;&gt; Sesudah tautan.'],
    ['Sil5', '&lt;&lt;silently&gt;&gt;&lt;&lt;if $x&gt;&gt;Teks kondisi&lt;&lt;/if&gt;&gt;&lt;&lt;/silently&gt;&gt; Sesudah kondisi.'],
    ['Sil6', '&lt;&lt;silently&gt;&gt;&lt;&lt;append "#log"&gt;&gt;Baris log baru.&lt;&lt;/append&gt;&gt;&lt;&lt;/silently&gt;&gt; Sesudah append.'],
    ['Sil7', '&lt;&lt;silently&gt;&gt;Catatan luar.&lt;&lt;silently&gt;&gt;Catatan dalam.&lt;&lt;/silently&gt;&gt;Catatan tengah.&lt;&lt;/silently&gt;&gt; Sesudah sarang.'],
    ['Sil8', '&lt;&lt;silently&gt;&gt;Catatan tanpa penutup. Kalimat sesudah.'],
  ]));
  check('B2 teks polos di <<silently>> dilewati', !has(S, 'Catatan rahasia di sini.') && has(S, 'Kalimat tampak.'), JSON.stringify(texts(S)));
  check('B2 badan <<replace>> di dalam silently TETAP dipindai', has(S, 'Teks ganti') && !has(S, 'Catatan rahasia.'), JSON.stringify(texts(S)));
  check('B2 argumen <<print>> di dalam silently dilewati', !has(S, 'Teks cetak') && has(S, 'Sesudah cetak.'), JSON.stringify(texts(S)));
  check('B2 <<link>> di dalam silently dilewati (label + badan)', !has(S, 'Label tautan') && !has(S, 'Isi tautan') && has(S, 'Sesudah tautan.'), JSON.stringify(texts(S)));
  check('B2 badan <<if>> di dalam silently dilewati', !has(S, 'Teks kondisi') && has(S, 'Sesudah kondisi.'), JSON.stringify(texts(S)));
  check('B2 badan <<append>> di dalam silently TETAP dipindai', has(S, 'Baris log baru.') && has(S, 'Sesudah append.'), JSON.stringify(texts(S)));
  check('B2 <<silently>> bersarang: semua catatan dilewati', !has(S, 'Catatan luar.') && !has(S, 'Catatan dalam.') && !has(S, 'Catatan tengah.') && has(S, 'Sesudah sarang.'), JSON.stringify(texts(S)));
  check('B2 <<silently>> tanpa penutup: sisa passage dilewati', !has(S, 'Catatan tanpa penutup.') && !has(S, 'Kalimat sesudah.'), JSON.stringify(texts(S)));

  S = setupState(twine([
    ['KodeTag', 'var secret = 1; Teks di passage script.', 'script'],
    ['KodeTag2', 'showMenu()\nTeks narasi di sini.', 'script'],
    ['GayaTag', 'color: red; Teks di passage stylesheet.', 'stylesheet'],
    ['StorySettings', 'saveSlots: 5\nautosave: on'],
    ['BiasaTag', 'Teks biasa.', 'story'],
    ['CampurTag', 'Teks campur.', 'utama cerita'],
  ]));
  check('B3 passage tags="script" dilewati utuh', S.segments.filter((s) => s.passage === 'KodeTag' || s.passage === 'KodeTag2').length === 0, JSON.stringify(texts(S)));
  check('B3 passage tags="stylesheet" dilewati utuh', S.segments.filter((s) => s.passage === 'GayaTag').length === 0, JSON.stringify(texts(S)));
  check('B3 passage StorySettings dilewati utuh', S.segments.filter((s) => s.passage === 'StorySettings').length === 0, JSON.stringify(texts(S)));
  check('B3 tag lain tetap dipindai', has(S, 'Teks biasa.') && has(S, 'Teks campur.'), JSON.stringify(texts(S)));

  /* B4: round-trip — isi <style>/<<silently>> utuh di file hasil */
  S = setupState(twine([
    ['A', '<style>color: #fff; margin-top: 8px;</style> Kalimat gaya.'],
    ['B', '&lt;&lt;silently&gt;&gt;Catatan rahasia di sini.&lt;&lt;/silently&gt;&gt; Kalimat tampak.'],
  ]));
  translateAll(S);
  const builtB = G.buildOutput();
  check('B4 <style> utuh di file hasil (tidak diterjemahkan)', builtB.text.includes('<style>color: #fff; margin-top: 8px;</style>'), '');
  check('B4 <<silently>> utuh di file hasil', builtB.text.includes('&lt;&lt;silently&gt;&gt;Catatan rahasia di sini.&lt;&lt;/silently&gt;&gt;'), '');
  check('B4 narasi diterjemahkan di file hasil', builtB.text.includes('ID: Kalimat gaya.') && builtB.text.includes('ID: Kalimat tampak.'), '');
  const checksB = G.verifyOutput(builtB.text);
  check('B4 pindai ulang jumlah segmen sama', checksB.some((c) => c.label === 'Jumlah segmen hasil pindai ulang sama' && c.ok), JSON.stringify(checksB.map((c) => c.label + ':' + c.ok)));

  /* ---------- C: butir 3 — @@...@@ dan hook Harlowe ---------- */
  S = setupState(twine([
    ['At1', '@@color:red;font-weight:bold;Teks bahaya@@ Kalimat biasa.'],
    ['At2', '@@.a;color:red;Teks campuran@@ Kalimat.'],
    ['At3', '@@#judul;Teks judul@@ Kalimat.'],
    ['At4', '@@.baik;Teks baik@@ Kalimat.'],
    ['At5', '@@.debug-text;Teks debug@@ Kalimat.'],
    ['At6', '@@.error;Teks error@@ Kalimat.'],
    ['At7', '@@Hello: world@@ Kalimat.'],
    ['At8', '&lt;&lt;print "@@color:red;Teks cetak@@"&gt;&gt; Kalimat.'],
  ]));
  check('C1 prefix CSS @@ dikupas, isi jadi segmen', has(S, 'Teks bahaya') && leaked(S, ['color:red', 'font-weight']).length === 0 && has(S, 'Kalimat biasa.'), JSON.stringify(texts(S)));
  check('C1 prefix kelas + CSS campuran dikupas', has(S, 'Teks campuran'), JSON.stringify(texts(S)));
  check('C1 prefix #id dikupas DAN isi tetap jadi segmen', has(S, 'Teks judul') && has(S, 'Kalimat.'), JSON.stringify(texts(S)));
  check('C1 prefix kelas lama tetap dikupas', has(S, 'Teks baik'), JSON.stringify(texts(S)));
  check('C1 span .debug-text tetap dilewati utuh', !has(S, 'Teks debug') && has(S, 'Kalimat.'), JSON.stringify(texts(S)));
  check('C1 span .error tetap dilewati utuh', !has(S, 'Teks error'), JSON.stringify(texts(S)));
  check('C1 isi @@ tanpa ; tidak dikupas sembarangan', has(S, 'Hello: world'), JSON.stringify(texts(S)));
  check('C1 argumen macro ber-@@ CSS dikupas', has(S, 'Teks cetak') && leaked(S, ['color:red']).length === 0, JSON.stringify(texts(S)));

  S = setupState(twine([
    ['H1', 'Teks sebelum. |status>[HP penuh] Teks sesudah.'],
    ['H2', '[HP penuh]<status| Teks sesudah.'],
    ['H3', '(if: $x)[Teks di dalam hook] Teks luar.'],
    ['H4', '|nama>[Isi hook] Teks luar.'],
  ], 'Harlowe'));
  check('C2 hook bernama |status> tidak bocor', has(S, 'Teks sebelum.') && has(S, 'HP penuh') && has(S, 'Teks sesudah.') && leaked(S, ['|status>']).length === 0, JSON.stringify(texts(S)));
  check('C2 penutup <status| tidak menghapus teks sesudahnya', has(S, 'HP penuh') && has(S, 'Teks sesudah.') && leaked(S, ['<status|']).length === 0, JSON.stringify(texts(S)));
  check('C2 hook biasa tetap bekerja', has(S, 'Teks di dalam hook') && has(S, 'Teks luar.'), JSON.stringify(texts(S)));
  check('C2 hook bernama di awal celah tidak bocor', has(S, 'Isi hook') && has(S, 'Teks luar.') && leaked(S, ['|nama>']).length === 0, JSON.stringify(texts(S)));

  /* ---------- D: butir 4 — aturan keras + pecah per baris ---------- */
  check('D0 scanAccepts menolak CSS murni', V3427.scanAccepts('color: #fff; margin-top: 8px;') === false);
  check('D0 scanAccepts menolak JSON objek', V3427.scanAccepts('{"name": "John", "hp": 100}') === false);
  check('D0 scanAccepts menolak JSON array', V3427.scanAccepts('[{"id": 1, "nama": "Budi"}]') === false);
  check('D0 scanAccepts menolak ekspresi Twine', V3427.scanAccepts('$hp lte 0') === false && V3427.scanAccepts("$day is 'Monday'") === false && V3427.scanAccepts('$hp = 5') === false);
  check('D0 scanAccepts menerima narasi biasa', V3427.scanAccepts('Hello world.') === true && V3427.scanAccepts('He said: go now; she stayed.') === true && V3427.scanAccepts('Note: bring the sword;') === true && V3427.scanAccepts('$name is here') === true && V3427.scanAccepts('$name smiles. "No," he says.') === true);

  S = setupState(twine([
    ['Css', 'color: #fff; margin-top: 8px;'],
    ['Json', '{"name": "John", "hp": 100}'],
    ['JsonArr', '[{"id": 1, "nama": "Budi"}]'],
    ['Tw1', '$hp lte 0'],
    ['Tw2', "$day is 'Monday'"],
    ['Tw3', '$hp = 5'],
    ['Campur1', 'Kalimat narasi.\n$x = 1\nKalimat kedua.'],
    ['Campur2', 'Kalimat narasi.\n$x = 1; foo();\nKalimat kedua.'],
    ['Campur3', 'Kalimat narasi.\ncolor: red;\nKalimat kedua.'],
    ['Campur4', 'Kalimat narasi.\n// komentar kode\nKalimat kedua.'],
    ['Campur5', 'Kalimat narasi.\nshowMenu()\nKalimat kedua.'],
    ['Nar1', 'He said: go now; she stayed.'],
    ['Nar2', 'Note: bring the sword;'],
    ['Nar3', '$name is here'],
    ['Nar4', '$name smiles. "No," he says.'],
    ['Nar5', 'Hello; world'],
    ['Nar6', 'Baris satu.\nBaris dua.'],
  ]));
  check('D1 CSS murni tidak jadi segmen', S.segments.filter((s) => s.passage === 'Css').length === 0, JSON.stringify(texts(S)));
  check('D1 JSON objek tidak jadi segmen', S.segments.filter((s) => s.passage === 'Json').length === 0, JSON.stringify(texts(S)));
  check('D1 JSON array tidak jadi segmen', S.segments.filter((s) => s.passage === 'JsonArr').length === 0, JSON.stringify(texts(S)));
  check('D1 ekspresi Twine tidak jadi segmen', ['Tw1', 'Tw2', 'Tw3'].every((p) => S.segments.filter((s) => s.passage === p).length === 0), JSON.stringify(texts(S)));
  check('D2 paragraf campuran: baris kode dibuang, narasi tetap', has(S, 'Kalimat narasi.') && has(S, 'Kalimat kedua.') && leaked(S, ['$x = 1', 'foo()']).length === 0, JSON.stringify(texts(S)));
  check('D2 paragraf campuran: baris CSS dibuang', has(S, 'Kalimat narasi.') && leaked(S, ['color: red']).length === 0, JSON.stringify(texts(S)));
  check('D2 paragraf campuran: baris // dibuang', leaked(S, ['// komentar']).length === 0, JSON.stringify(texts(S)));
  check('D2 paragraf campuran: baris panggil fungsi dibuang', leaked(S, ['showMenu']).length === 0, JSON.stringify(texts(S)));
  check('D3 narasi ber-; dan : tetap jadi segmen', has(S, 'He said: go now; she stayed.') && has(S, 'Note: bring the sword;') && has(S, 'Hello; world'), JSON.stringify(texts(S)));
  check('D3 narasi ber-variabel tetap jadi segmen', has(S, '$name is here') && has(S, '$name smiles. "No," he says.'), JSON.stringify(texts(S)));
  check('D3 narasi dua baris tetap SATU segmen (bukan per baris)', S.segments.filter((s) => s.passage === 'Nar6').length === 1 && has(S, 'Baris satu.\nBaris dua.'), JSON.stringify(texts(S).filter((t) => t.includes('Baris'))));

  /* ---------- E: butir 5 — pengecualian scan <script> ---------- */
  const FIX_JS = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + 'Body text here.\n'
    + '<script>\n'
    + 'console.log("Loading game...");\n'
    + 'console.warn("Perhatian!");\n'
    + 'el.addEventListener("click", handler);\n'
    + 'el.removeEventListener("mouseover", handler);\n'
    + 'const key = localStorage.getItem("save-slot-1");\n'
    + 'const s = sessionStorage.getItem("sesi-1");\n'
    + 'const cfg = { id: "my-panel", type: "button" };\n'
    + 'const re = new RegExp("a+b");\n'
    + 'const el2 = document.createElement("div");\n'
    + 'el.setAttribute("data-x", "1");\n'
    + 'el.classList.add("active");\n'
    + 'el.classList.toggle("hidden");\n'
    + 'showMessage("Selamat datang di permainan!");\n'
    + 'const title = "Judul Game";\n'
    + 'const cfg2 = { title: "Selamat datang" };\n'
    + 'el.setAttribute("title", "Tooltip teks");\n'
    + 'const cfg3 = { id: "my panel" };\n'
    + 'const css = css`color: red;`;\n'
    + '</script>\n'
    + '</body></html>';
  S = setupState(FIX_JS, true);
  check('E1 console.log/warn tidak jadi segmen', leaked(S, ['Loading game', 'Perhatian!']).length === 0, JSON.stringify(texts(S)));
  check('E1 add/removeEventListener arg 1 tidak jadi segmen', leaked(S, ['click', 'mouseover']).length === 0, JSON.stringify(texts(S)));
  check('E1 local/sessionStorage arg 1 tidak jadi segmen', leaked(S, ['save-slot-1', 'sesi-1']).length === 0, JSON.stringify(texts(S)));
  check('E1 nilai properti teknis tanpa spasi tidak jadi segmen', leaked(S, ['my-panel', 'button', 'data-x']).length === 0, JSON.stringify(texts(S)));
  check('E1 new RegExp tidak jadi segmen', leaked(S, ['a+b']).length === 0, JSON.stringify(texts(S)));
  check('E1 createElement arg 1 tidak jadi segmen', leaked(S, ['div']).length === 0, JSON.stringify(texts(S)));
  check('E1 classList tidak jadi segmen', leaked(S, ['active', 'hidden']).length === 0, JSON.stringify(texts(S)));
  check('E1 string tampil tetap jadi segmen', has(S, 'Body text here.') && has(S, 'Selamat datang di permainan!') && has(S, 'Judul Game'), JSON.stringify(texts(S)));
  check('E1 properti non-teknis tetap jadi segmen', has(S, 'Selamat datang'), JSON.stringify(texts(S)));
  check('E1 argumen ke-2 setAttribute tetap jadi segmen', has(S, 'Tooltip teks'), JSON.stringify(texts(S)));
  check('E1 nilai properti teknis BER-spasi tetap jadi segmen', has(S, 'my panel'), JSON.stringify(texts(S)));
  check('E1 tagged template tetap dilewati (v3.4.26)', leaked(S, ['color: red']).length === 0, JSON.stringify(texts(S)));
}

main().then(() => {
  console.log('\nV3427_SCANNER: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.log('ERROR main: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
