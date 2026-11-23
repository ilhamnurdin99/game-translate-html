/* Test v3.4.7 — Pratinjau aman + segar (F13 Critical + F4 Important).
   Jalankan: node test_v347_preview.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) hook v3.4.7 + helper pratinjau tersedia (buildPreviewWrapper,
       previewGameHtml, previewStorageShim);
   (b) shim penyimpanan: sisip setelah <head>, sebelum <script> game;
       bila localStorage/sessionStorage melempar (origin opaque), shim
       menggantinya dengan penyimpanan memori yang berfungsi;
   (c) wrapper pratinjau: <iframe sandbox="allow-scripts" srcdoc>,
       tanpa allow-same-origin, tanpa window.open; payload JSON kembali
       utuh saat di-parse; tidak ada literal </script> di dalam JSON;
   (d) klik Pratinjau SELALU membangun ulang (F4): edit terjemahan
       setelah Timpa terakhir -> pratinjau berisi terjemahan BARU;
   (e) klik Pratinjau tanpa file: tidak membuka apa pun (doBuild menolak).
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
const V346 = w.__GTHTML_V346__;
const $ = (id) => w.document.getElementById(id);
const logText = () => ($('logBox') || { textContent: '' }).textContent;

check('A0 hook v3.4.7 tersedia', !!V347 && typeof V347.buildPreviewWrapper === 'function' && typeof V347.previewGameHtml === 'function' && typeof V347.previewStorageShim === 'function' && typeof V347.doBuild === 'function');
if (!V347) { console.log('\nV347_PREVIEW: hook belum ada — RED (fitur belum dibangun)'); process.exit(1); }

const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Home" tags="" position="100,100" size="100,100">or you can go <span class="next">[[Home]]</span>\n'
  + '<<addToLoc "[[Home]]">></tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Shop" tags="" position="200,100" size="100,100">[[Shop]]\n'
  + '[[Buy Sword|Shop Buy]]\n'
  + '<<link "Shop">>\n'
  + '<<link "Keep walking">>Walk on.<</link>>\n'
  + '[[Go Home|Home][$Money -= 8]]</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
function setupState(linkLabels) {
  w.localStorage.removeItem('gthtml_linklabels_v1');
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = ' + (!!linkLabels) + '; S.linkNoBodyTargets = [];');
  $('optLinkLabels').checked = !!linkLabels;
  w.eval('segCounter = 0; doScan(); renderList();');
  return V347.state;
}
const TR = { 'or you can go': 'atau kamu bisa pergi', 'Home': 'Rumah', 'Buy Sword': 'Beli Pedang', 'Shop': 'Toko', 'Keep walking': 'Terus berjalan', 'Walk on.': 'Jalan terus.', 'Go Home': 'Pulang' };
const setTranslations = (S, map) => {
  for (const s of S.segments) {
    if (s.translatable && map[s.text]) S.translations.set(s.id, { text: map[s.text], via: 'manual' });
  }
};
const waitFor = async (cond, ms) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > (ms || 3000)) return false;
    await new Promise((r) => w.setTimeout(r, 10));
  }
  return true;
};

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
  w.confirm = () => true;

  /* ---------- (b) shim penyimpanan ---------- */
  const shim = V347.previewStorageShim();
  check('B1 shim berupa satu tag <script> utuh', shim.startsWith('<script>') && shim.endsWith('</script>') && (shim.match(/<\/script>/g) || []).length === 1, shim.slice(0, 80));
  check('B1 shim menyebut localStorage + sessionStorage + defineProperty', shim.includes('localStorage') && shim.includes('sessionStorage') && shim.includes('defineProperty'));
  const gameWithHead = '<!DOCTYPE html><html><head><title>T</title><script>var x = 1;</script></head><body>hi</body></html>';
  const withShim = V347.previewGameHtml(gameWithHead);
  check('B2 shim disisip tepat setelah <head>', withShim.indexOf('<script>(function') > withShim.indexOf('<head>') && withShim.indexOf('<script>(function') < withShim.indexOf('<script>var x'));
  check('B2 teks game utuh setelah shim', withShim.includes('var x = 1;') && withShim.includes('hi</body>'));
  const gameNoHead = '<html><body>hi</body></html>';
  check('B2 tanpa <head>: shim di depan', V347.previewGameHtml(gameNoHead).startsWith('<script>(function'));
  // Shim harus berfungsi bila storage melempar (origin opaque): ganti
  // localStorage/sessionStorage window dengan objek yang melempar, jalankan
  // isi shim, lalu storage harus jadi shim memori yang bisa set/get.
  const shimJs = shim.replace(/^<script>/, '').replace(/<\/script>$/, '');
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const origLS = w.localStorage, origSS = w.sessionStorage;
  let shimWorks = false, shimErr = '';
  try {
    Object.defineProperty(w, 'localStorage', { value: throwing, configurable: true });
    Object.defineProperty(w, 'sessionStorage', { value: throwing, configurable: true });
    w.eval(shimJs);
    w.localStorage.setItem('k', 'v');
    w.sessionStorage.setItem('k2', 'v2');
    shimWorks = w.localStorage.getItem('k') === 'v' && w.sessionStorage.getItem('k2') === 'v2' && w.localStorage.getItem('hilang') === null;
  } catch (e) { shimErr = e && e.message; }
  try { Object.defineProperty(w, 'localStorage', { value: origLS, configurable: true }); } catch (e) { /* abaikan */ }
  try { Object.defineProperty(w, 'sessionStorage', { value: origSS, configurable: true }); } catch (e) { /* abaikan */ }
  check('B3 shim mengganti storage yang melempar dengan memori', shimWorks, shimErr);

  /* ---------- (c) wrapper pratinjau ---------- */
  const gameHtml = '<!DOCTYPE html><html><head><script>var g = "</scr" + "ipt>";</script></head><body><p>Hai</p><script>var y = 1;</script></body></html>';
  const wrapper = V347.buildPreviewWrapper(gameHtml);
  check('C1 wrapper berisi iframe sandbox allow-scripts', wrapper.includes('<iframe') && wrapper.includes('sandbox="allow-scripts"') && wrapper.includes('srcdoc='));
  check('C1 wrapper tanpa allow-same-origin', !wrapper.includes('allow-same-origin'));
  check('C1 wrapper tanpa window.open', !wrapper.includes('window.open'));
  check('C1 wrapper: literal </script> hanya satu (penutup wrapper sendiri)', (wrapper.match(/<\/script>/g) || []).length === 1, 'jumlah=' + (wrapper.match(/<\/script>/g) || []).length);
  const m = /srcdoc=(.+);<\/script>/.exec(wrapper);
  let payloadOk = false;
  try { payloadOk = !!m && JSON.parse(m[1]) === gameHtml; } catch (e) { payloadOk = false; }
  check('C1 payload JSON di-parse kembali jadi game HTML utuh', payloadOk);

  /* ---------- (d) klik Pratinjau selalu membangun ulang (F4) ---------- */
  const S = setupState(true);
  setTranslations(S, TR);
  const stale = await V346.doBuild(false);
  check('D1 Timpa awal berhasil (stale output)', !!stale && stale.replaced === 8, 'replaced=' + (stale && stale.replaced));
  // Edit satu terjemahan SETELAH Timpa — pratinjau harus menampilkan yang baru.
  const segGo = S.segments.find((s) => s.text === 'or you can go');
  S.translations.set(segGo.id, { text: 'PERGI BARU', via: 'manual' });
  let capturedUrl = null, capturedBlob = null;
  w.URL.createObjectURL = (blob) => { capturedBlob = blob; return 'blob:preview-test'; };
  w.URL.revokeObjectURL = () => {};
  w.open = (url) => { capturedUrl = url; return null; };
  $('btnPreview').dispatchEvent(new w.Event('click', { bubbles: true }));
  const got = await waitFor(() => capturedUrl !== null, 5000);
  check('D2 klik Pratinjau membuka tab blob', got && capturedUrl === 'blob:preview-test', 'url=' + capturedUrl);
  let blobText = '';
  if (capturedBlob) blobText = await capturedBlob.text();
  check('D2 isi tab adalah wrapper sandbox (bukan blob game langsung)', blobText.includes('<iframe') && blobText.includes('sandbox="allow-scripts"') && blobText.includes('srcdoc='));
  check('D2 pratinjau berisi terjemahan BARU (bangun ulang)', blobText.includes('PERGI BARU'), blobText.slice(0, 200));
  check('D2 pratinjau tidak berisi terjemahan lama', !blobText.includes('atau kamu bisa pergi'));
  check('D2 pratinjau berisi terjemahan lain yang sudah ada', blobText.includes('[[Rumah|Home]]'));
  const pm = /srcdoc=(.+);<\/script>/.exec(blobText);
  let payloadHasShim = false;
  try { payloadHasShim = !!pm && JSON.parse(pm[1]).includes('localStorage'); } catch (e) { payloadHasShim = false; }
  check('D2 payload srcdoc berisi shim penyimpanan', payloadHasShim);

  /* ---------- (e) tanpa file: tidak membuka apa pun ---------- */
  capturedUrl = null;
  w.eval('S.fileName = ""; S.originalText = ""; S.outputText = "";');
  $('btnPreview').dispatchEvent(new w.Event('click', { bubbles: true }));
  await new Promise((r) => w.setTimeout(r, 200));
  check('E1 tanpa file: tidak membuka tab', capturedUrl === null);
  check('E1 tanpa file: buildInfo menjelaskan', $('buildInfo').textContent.includes('Upload file dulu.'), $('buildInfo').textContent);

  console.log('\nV347_PREVIEW: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
