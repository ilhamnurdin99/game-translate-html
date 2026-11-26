/* Test v3.4.26 (tema kunci & keamanan run + backlog murah) — klaim
   review Gemini 3, 4, 5, 6, 13, 18, 19-sebagian.
   Jalankan: node tests/test_v3426_run_lock.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook v3.4.26 + perbaikan belum ada),
   lalu perbaikan minimal.
   Spec (ide-perbaikan-gemini-v3426.md):
   3. loadFile + handler "Pulihkan" me-reset S.downloaded.
   4. runTranslate dibungkus try...finally (S.running kembali false
      bila translateSegments melempar).
   5. Handler .tr-one menolak klik bila S.running + tidak memanggil
      resetCircuitBreaker() bila S.running.
   6. btnRescan/btnRestore/btnBuild/btnPreview + checkbox opsi dikunci
      selama S.running; klik Pindai ulang/Pulihkan saat run tidak
      menjalankan doScan.
   13. fetchWithTimeout (AbortController + timeout) dipakai semua
      pemanggil fetch; Berhenti membatalkan request aktif; error abort
      tidak retryable.
   18. @media (max-width: 720px) untuk .trow; pager di-disable di ujung.
   19-sebagian. origDownloaded ikut tersimpan + dipulihkan proyek.
   A0: label versi naik ke v3.4.26. */
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
  const V31 = w.__GTHTML_V31__;
  const V33 = w.__GTHTML_V33__;
  const V344 = w.__GTHTML_V344__;
  const V348 = w.__GTHTML_V348__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.26 tersedia', !!V3426 && typeof V3426.fetchWithTimeout === 'function' && typeof V3426.setRunLock === 'function', 'hook: ' + typeof V3426);
  check('A0 label versi v3.4.26', html.includes('Game Translate HTML v3.4.26') && !html.includes('Game Translate HTML v3.4.22'));
  if (!V3426 || typeof V3426.fetchWithTimeout !== 'function') { console.log('\nV3426_RUN_LOCK: hook v3.4.26 belum ada — RED'); process.exit(1); }

  const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Hello world.\n\nJohn went home.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="Second" tags="" position="200,100" size="100,100">Second passage text.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  const FIX_B = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>B</title></head><body>\n'
    + '<tw-storydata name="B" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Hello world.\n\nDifferent game text.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  function setupState() {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.downloaded = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = []; S.running = false; S.cancelled = false;');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  const segByText = (S, t) => S.segments.find((s) => s.text === t);
  const click = (el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));

  /* ---------- klaim 3: S.downloaded di-reset saat ganti file ---------- */
  let S = setupState();
  S.downloaded.add('Hello world.');
  await w.eval('loadFile(new File([' + JSON.stringify(FIX_B) + '], "gameB.html", { type: "text/html" }))');
  S = V348.state;
  check('K3 loadFile mengosongkan S.downloaded', S.downloaded.size === 0, 'downloaded: ' + [...S.downloaded].join(' | '));
  check('K3 setelah loadFile, baris game baru tidak bertanda !', !w.document.querySelector('.dl-mark'), 'mark masih ada');
  check('K3 loadFile tetap memindai game baru', S.segments.some((s) => s.text === 'Different game text.'), 'segmen: ' + S.segments.map((s) => s.text).join(' | '));

  S = setupState();
  S.downloaded.add('Hello world.');
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Custom' });
  w.confirm = () => true;
  click($('btnRestore'));
  S = V348.state;
  check('K3 Pulihkan mengosongkan S.downloaded', S.downloaded.size === 0, 'downloaded: ' + [...S.downloaded].join(' | '));
  check('K3 Pulihkan tetap menghapus terjemahan', S.translations.size === 0, 'translations: ' + S.translations.size);

  /* ---------- klaim 4: runTranslate try...finally ---------- */
  S = setupState();
  w.eval('window.__origTranslateSegments = translateSegments; translateSegments = async () => { throw new Error("boom-test"); };');
  try {
    await V344.runTranslate('all');
  } catch (e) { /* runTranslate tidak boleh melempar ke pemanggil */ }
  S = V348.state;
  check('K4 S.running kembali false setelah translateSegments melempar', S.running === false, 'running: ' + S.running);
  check('K4 tombol Terjemahkan aktif lagi setelah lemparan', $('btnTranslateAll') && $('btnTranslateAll').disabled === false, 'disabled: ' + ($('btnTranslateAll') && $('btnTranslateAll').disabled));
  check('K4 tombol Berhenti nonaktif lagi setelah lemparan', $('btnStop') && $('btnStop').disabled === true, 'disabled: ' + ($('btnStop') && $('btnStop').disabled));
  check('K4 tombol Pindai ulang aktif lagi setelah lemparan', $('btnRescan') && $('btnRescan').disabled === false, 'disabled: ' + ($('btnRescan') && $('btnRescan').disabled));
  w.eval('translateSegments = window.__origTranslateSegments;');

  /* ---------- klaim 5: .tr-one terkunci saat run ---------- */
  S = setupState();
  let fetchCalls = 0;
  w.fetch = async () => { fetchCalls++; throw new Error('fetch tak boleh dipanggil'); };
  V31.resetCircuitBreaker();
  V31.circuitBreaker.custom.streak = 2;
  w.eval('S.running = true; renderList();');
  const btnOne = w.document.querySelector('.tr-one');
  check('K5 tombol .tr-one nonaktif saat S.running', !!btnOne && btnOne.disabled === true, 'disabled: ' + (btnOne && btnOne.disabled));
  click(btnOne);
  await new Promise((r) => setTimeout(r, 100));
  check('K5 klik .tr-one saat run tidak memanggil fetch', fetchCalls === 0, 'fetchCalls: ' + fetchCalls);
  check('K5 klik .tr-one saat run tidak mengubah streak pemutus', V31.circuitBreaker.custom.streak === 2, 'streak: ' + V31.circuitBreaker.custom.streak);
  check('K5 klik .tr-one saat run mencatat penolakan di log', logText().includes('Terjemahan semua sedang berjalan'), logText().slice(-200));
  w.eval('S.running = false; renderList();');
  // Kontrol positif: .tr-one tetap jalan bila tidak ada run.
  w.fetch = async (url) => {
    const u = String(url);
    if (u.includes('translate.googleapis.com')) {
      const params = new URLSearchParams(u.split('?')[1]);
      const qs = params.getAll('q');
      return { ok: true, status: 200, json: async () => [qs.map((q) => [[q === 'Hello world.' ? 'Halo dunia.' : 'ID:' + q, q]])] };
    }
    throw new Error('fetch tak dikenal: ' + u);
  };
  V31.resetCircuitBreaker();
  fetchCalls = 0;
  const btnOne2 = w.document.querySelector('.tr-one[data-id="' + segByText(S, 'Hello world.').id + '"]');
  click(btnOne2);
  await waitFor(() => { const t = S.translations.get(segByText(S, 'Hello world.').id); return t && t.text === 'Halo dunia.'; }, 3000);
  const trOne = S.translations.get(segByText(S, 'Hello world.').id);
  check('K5 .tr-one normal tetap menerjemahkan bila tidak ada run', trOne && trOne.text === 'Halo dunia.', JSON.stringify(trOne));

  /* ---------- klaim 6: kunci tombol + checkbox saat run ---------- */
  S = setupState();
  const segsBefore = S.segments;
  const trCountBefore = S.translations.size;
  w.eval('S.running = true;');
  V3426.setRunLock(true);
  check('K6 btnRescan dikunci saat run', $('btnRescan').disabled === true);
  check('K6 btnRestore dikunci saat run', $('btnRestore').disabled === true);
  check('K6 btnBuild dikunci saat run', $('btnBuild').disabled === true);
  check('K6 btnPreview dikunci saat run', $('btnPreview').disabled === true);
  check('K6 btnRetranslate dikunci saat run', $('btnRetranslate').disabled === true);
  check('K6 optScript dikunci saat run', $('optScript').disabled === true);
  check('K6 optNames dikunci saat run', $('optNames').disabled === true);
  check('K6 optLinkLabels dikunci saat run', $('optLinkLabels').disabled === true);
  check('K6 ceklis mesin dikunci saat run', [...w.document.querySelectorAll('.engChk')].every((cb) => cb.disabled === true));
  const pindaiBefore = (logText().match(/Pindai selesai/g) || []).length;
  click($('btnRescan'));
  await new Promise((r) => setTimeout(r, 50));
  const pindaiAfter = (logText().match(/Pindai selesai/g) || []).length;
  check('K6 klik Pindai ulang saat run tidak menjalankan doScan', S.segments === segsBefore && pindaiAfter === pindaiBefore, 'segments sama: ' + (S.segments === segsBefore) + ', pindai: ' + pindaiBefore + '->' + pindaiAfter);
  w.confirm = () => true;
  click($('btnRestore'));
  await new Promise((r) => setTimeout(r, 50));
  check('K6 klik Pulihkan saat run tidak menghapus terjemahan', S.translations.size === trCountBefore, 'translations: ' + S.translations.size);
  // Ceklis opsi yang diubah saat run tidak mengubah state.
  $('optScript').checked = true;
  $('optScript').dispatchEvent(new w.Event('change', { bubbles: true }));
  check('K6 ubah optScript saat run tidak mengubah S.includeScript', S.includeScript === false, 'includeScript: ' + S.includeScript);
  check('K6 ubah optScript saat run mengembalikan ceklis', $('optScript').checked === false, 'checked: ' + $('optScript').checked);
  V3426.setRunLock(false);
  w.eval('S.running = false;');
  check('K6 kunci dilepas setelah run: btnRescan aktif', $('btnRescan').disabled === false);
  check('K6 kunci dilepas setelah run: btnBuild aktif', $('btnBuild').disabled === false);
  check('K6 kunci dilepas setelah run: optScript aktif', $('optScript').disabled === false);

  /* ---------- klaim 13: fetchWithTimeout + abort ---------- */
  // Mock fetch yang menghormati signal (seperti fetch asli).
  w.fetch = (url, opts) => new Promise((resolve, reject) => {
    const sig = opts && opts.signal;
    if (sig) sig.addEventListener('abort', () => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; reject(e); });
  });
  let t0 = Date.now();
  let timeoutErr = null;
  try { await V3426.fetchWithTimeout('https://example.invalid/hang', {}, 50); }
  catch (e) { timeoutErr = e; }
  const elapsed = Date.now() - t0;
  check('K13 fetch menggantung gagal tepat waktu (timeout)', !!timeoutErr && /timeout/i.test(timeoutErr.message || ''), 'err: ' + (timeoutErr && timeoutErr.message) + ', elapsed: ' + elapsed + 'ms');
  check('K13 timeout terjadi cepat (< 2 detik, bukan 30 detik)', elapsed < 2000, 'elapsed: ' + elapsed + 'ms');
  check('K13 error timeout bersifat retryable', !!timeoutErr && V31.isRetryable(timeoutErr) === true, 'retryable: ' + (timeoutErr && V31.isRetryable(timeoutErr)));
  // Abort manual (tombol Berhenti).
  let abortErr = null;
  const pHang = V3426.fetchWithTimeout('https://example.invalid/hang', {}, 60000);
  V3426.abortActiveFetches();
  try { await pHang; } catch (e) { abortErr = e; }
  check('K13 abortActiveFetches membatalkan request aktif', !!abortErr && /batal/i.test(abortErr.message || ''), 'err: ' + (abortErr && abortErr.message));
  check('K13 error abort TIDAK retryable (Berhenti jangan memicu retry)', !!abortErr && V31.isRetryable(abortErr) === false, 'retryable: ' + (abortErr && V31.isRetryable(abortErr)));
  // Setelah abort, fetch baru tetap jalan.
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  let okRes = null;
  try { okRes = await V3426.fetchWithTimeout('https://example.invalid/ok', {}, 5000); } catch (e) { okRes = null; }
  check('K13 fetch baru tetap jalan setelah abort', !!okRes && okRes.ok === true, 'okRes: ' + JSON.stringify(okRes));

  /* ---------- klaim 18: @media + pager di-disable ---------- */
  check('K18 CSS punya @media (max-width: 720px)', /@media\s*\(\s*max-width\s*:\s*720px\s*\)/.test(html), 'media tidak ditemukan');
  check('K18 @media mengubah .trow jadi 1 kolom', /@media\s*\(\s*max-width\s*:\s*720px\s*\)\s*\{[^}]*\.trow\s*\{[^}]*grid-template-columns\s*:\s*1fr/i.test(html), 'aturan .trow 1 kolom tidak ditemukan');
  S = setupState();
  w.eval('S.perPage = 2; renderList();');
  check('K18 pager: Sebelumnya nonaktif di halaman pertama', $('btnPrevPage').disabled === true, 'disabled: ' + $('btnPrevPage').disabled);
  check('K18 pager: Berikutnya aktif di halaman pertama', $('btnNextPage').disabled === false, 'disabled: ' + $('btnNextPage').disabled);
  w.eval('S.page = 1; renderList();');
  check('K18 pager: Sebelumnya aktif di halaman terakhir', $('btnPrevPage').disabled === false, 'disabled: ' + $('btnPrevPage').disabled);
  check('K18 pager: Berikutnya nonaktif di halaman terakhir', $('btnNextPage').disabled === true, 'disabled: ' + $('btnNextPage').disabled);
  w.eval('S.perPage = 100; S.page = 0; renderList();');
  check('K18 pager: keduanya nonaktif bila hanya 1 halaman', $('btnPrevPage').disabled === true && $('btnNextPage').disabled === true, 'prev: ' + $('btnPrevPage').disabled + ', next: ' + $('btnNextPage').disabled);

  /* ---------- klaim 19-sebagian: origDownloaded tersimpan ---------- */
  S = setupState();
  w.eval('S.origDownloaded = true;');
  V33.saveProject();
  const d = V33.readLocalStorageProject();
  check('K19 simpanan proyek memuat origDownloaded=true', d && d.origDownloaded === true, 'origDownloaded tersimpan: ' + JSON.stringify(d && d.origDownloaded));
  w.eval('S.origDownloaded = false;');
  V33.restoreProject(d);
  S = V348.state;
  check('K19 setelah restore, S.origDownloaded=true lagi', S.origDownloaded === true, 'origDownloaded: ' + S.origDownloaded);

  console.log('\nV3426_RUN_LOCK: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
