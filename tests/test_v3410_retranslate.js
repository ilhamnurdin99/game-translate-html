/* Test v3.4.10 — Terjemahan custom: terjemah ulang yang diceklis dan sudah
   diterjemahkan, mesin mengikuti ceklis "Mesin yang dipakai" (ide Ilham).
   Jalankan: node tests/test_v3410_retranslate.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook V3410 + tombol + label v3.4.10 belum ada),
   lalu perbaikan minimal.
   Spec (ide-terjemah-ulang-custom.md):
   1. Mesin yang dicentang sukses -> terjemahan diganti, via sesuai mesin
      (bukti mesin mengikuti pilihan, bukan hardcode custom).
   2. Mesin gagal -> terjemahan lama utuh (teks + via lama).
   3. Hasil tidak lolos validasi -> terjemahan lama utuh.
   4. Semua mesin tidak dicentang -> peringatan, tidak ada yang berubah.
   5. Hanya yang diceklis DAN sudah bagus yang ikut; belum diterjemahkan /
      gagal / skipped / bagus tapi tidak diceklis tidak disentuh.
   6. Tombol nonaktif bila tidak ada yang diceklis; klik tombol menjalankan
      ulang dan log menyebut jumlah diganti + dipertahankan. */
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

  const V3410 = w.__GTHTML_V3410__;
  const V348 = w.__GTHTML_V348__;
  const V347 = w.__GTHTML_V347__;
  const V344 = w.__GTHTML_V344__;
  const V31 = w.__GTHTML_V31__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.10 tersedia', !!V3410 && typeof V3410.retranslateSelected === 'function', 'hook: ' + typeof V3410);
  check('A0 label versi v3.4.11', html.includes('Game Translate HTML v3.4.11') && !html.includes('Game Translate HTML v3.4.10'));
  check('A0 Cara pakai menyebut v3.4.10', html.includes('Terjemahan custom (v3.4.10)'));
  if (!V3410 || typeof V3410.retranslateSelected !== 'function') { console.log('\nV3410_RETRANSLATE: retranslateSelected belum diekspos di hook v3.4.10 — RED'); process.exit(1); }

  /* ---------- mock fetch + mesin (pola v3.4.4 / test_v348_copy.js) ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let googleFails = false;
  let echoTexts = new Set(); // mesin mengembalikan teks apa adanya -> validateOne 'sama'
  let stripVar = false; // hapus {{{GTn}}} dari balasan -> validateOne 'variabel hilang'
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('localhost:3001')) {
      const body = JSON.parse(opts.body);
      const texts = JSON.parse(body.messages[1].content);
      return okRes({ choices: [{ message: { content: JSON.stringify(texts.map((t) => 'CUSTOM:' + t)) } }] });
    }
    if (u.includes('translate.googleapis.com')) {
      if (googleFails) return errRes(500);
      const qs = new URL(u).searchParams.getAll('q');
      if (qs.length === 1 && qs[0].includes('ZXQSEP')) return okRes([[['x ' + qs[0] + ' y']]]);
      return okRes([qs.map((t) => {
        if (echoTexts.has(t)) return [[t]];
        let out = 'ID:' + t;
        if (stripVar) out = out.replace(/\{\{\{GT\d+\}\}\}/g, '');
        return [[out]];
      })]);
    }
    if (u.includes('clients5.google.com')) return errRes(500);
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };
  V31.setRetrySleep(() => Promise.resolve());
  function setEngines(sel) {
    V344.setEngineSel(Object.assign({ custom: false, google: false, dict: false, edge: false, mymemory: false, chrome: false }, sel));
    V31.setCustomCfg({ enabled: !!sel.custom, baseUrl: 'http://localhost:3001/v1', apiKey: 'k-test', model: 'm-test' });
    V31.resetCircuitBreaker();
  }

  const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">Rose\n\nHello world.\n\nJohn went home.\n\nHello $name.</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="SkipMe" tags="" position="200,100" size="100,100">Skip this text.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  function setupState() {
    w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(["SkipMe"]); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false; S.linkLabels = false; S.linkNoBodyTargets = []; S.running = false; S.cancelled = false;');
    w.eval('segCounter = 0; doScan(); renderList();');
    return V348.state;
  }
  const segByText = (S, t) => S.segments.find((s) => s.text === t);
  const trOf = (S, t) => { const s = segByText(S, t); return s ? S.translations.get(s.id) : undefined; };
  const selectIds = (S, texts) => {
    w.eval('S.selected = new Set(' + JSON.stringify(texts.map((t) => segByText(S, t).id)) + '); renderList();');
  };

  /* ---------- 1: sukses -> diganti, via mengikuti mesin yang dicentang ---------- */
  let S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  S.translations.set(segByText(S, 'John went home.').id, { text: 'John pulang.', via: 'Google Dict' });
  setEngines({ google: true });
  selectIds(S, ['Hello world.', 'John went home.']);
  const r1 = await V3410.retranslateSelected();
  check('C1 Google: 2 diganti, 0 dipertahankan', !!r1 && r1.replaced === 2 && r1.kept === 0, JSON.stringify(r1));
  check('C1 Google: Hello diganti via Google', trOf(S, 'Hello world.') && trOf(S, 'Hello world.').text === 'ID:Hello world.' && trOf(S, 'Hello world.').via === 'Google', JSON.stringify(trOf(S, 'Hello world.')));
  check('C1 Google: John diganti via Google', trOf(S, 'John went home.') && trOf(S, 'John went home.').text === 'ID:John went home.' && trOf(S, 'John went home.').via === 'Google', JSON.stringify(trOf(S, 'John went home.')));
  check('C1 log menyebut jumlah diganti + dipertahankan', logText().includes('Terjemah ulang: 2 diganti, 0 dipertahankan.'), logText().slice(-300));
  // Mesin mengikuti pilihan: hanya custom yang dicentang -> via Custom.
  S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  setEngines({ custom: true });
  selectIds(S, ['Hello world.']);
  const r1b = await V3410.retranslateSelected();
  check('C1 Custom: 1 diganti, 0 dipertahankan', !!r1b && r1b.replaced === 1 && r1b.kept === 0, JSON.stringify(r1b));
  check('C1 Custom: Hello diganti via Custom (bukan hardcode Google)', trOf(S, 'Hello world.') && trOf(S, 'Hello world.').text === 'CUSTOM:Hello world.' && trOf(S, 'Hello world.').via === 'Custom', JSON.stringify(trOf(S, 'Hello world.')));

  /* ---------- 2: mesin gagal -> terjemahan lama utuh ---------- */
  S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  setEngines({ dict: true }); // Dict mock selalu 500 -> gagal
  selectIds(S, ['Hello world.']);
  const r2 = await V3410.retranslateSelected();
  check('C2 gagal: 0 diganti, 1 dipertahankan', !!r2 && r2.replaced === 0 && r2.kept === 1, JSON.stringify(r2));
  const helloKept = trOf(S, 'Hello world.');
  check('C2 gagal: terjemahan lama utuh (teks + via)', !!helloKept && helloKept.text === 'Halo dunia.' && helloKept.via === 'Google' && !helloKept.failed, JSON.stringify(helloKept));
  check('C2 log menyebut 0 diganti, 1 dipertahankan', logText().includes('Terjemah ulang: 0 diganti, 1 dipertahankan.'), logText().slice(-300));

  /* ---------- 3: hasil tidak lolos validasi -> terjemahan lama utuh ---------- */
  S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  S.translations.set(segByText(S, 'Hello $name.').id, { text: 'Halo $name.', via: 'Google' });
  S.translations.set(segByText(S, 'Rose').id, { text: 'Mawar.', via: 'Google' });
  setEngines({ google: true });
  echoTexts = new Set(['Hello world.']); // mesin mengembalikan asli -> 'sama'
  stripVar = true; // hapus $name dari balasan -> 'variabel hilang'
  selectIds(S, ['Hello world.', 'Hello $name.', 'Rose']);
  const r3 = await V3410.retranslateSelected();
  echoTexts = new Set(); stripVar = false;
  check('C3 validasi: 1 diganti, 2 dipertahankan', !!r3 && r3.replaced === 1 && r3.kept === 2, JSON.stringify(r3));
  check('C3 validasi "sama": Hello utuh', trOf(S, 'Hello world.') && trOf(S, 'Hello world.').text === 'Halo dunia.' && trOf(S, 'Hello world.').via === 'Google', JSON.stringify(trOf(S, 'Hello world.')));
  check('C3 validasi "variabel hilang": Hello $name utuh', trOf(S, 'Hello $name.') && trOf(S, 'Hello $name.').text === 'Halo $name.' && trOf(S, 'Hello $name.').via === 'Google', JSON.stringify(trOf(S, 'Hello $name.')));
  check('C3 baris lain dalam batch yang sama tetap diganti', trOf(S, 'Rose') && trOf(S, 'Rose').text === 'ID:Rose' && trOf(S, 'Rose').via === 'Google', JSON.stringify(trOf(S, 'Rose')));

  /* ---------- 4: semua mesin tidak dicentang -> peringatan, tidak ada yang berubah ---------- */
  S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  setEngines({});
  selectIds(S, ['Hello world.']);
  const before4 = logText().length;
  const r4 = await V3410.retranslateSelected();
  check('C4 semua mesin mati: 0 diganti, 0 dipertahankan', !!r4 && r4.replaced === 0 && r4.kept === 0, JSON.stringify(r4));
  check('C4 peringatan mesin tidak dicentang di log', logText().slice(before4).includes('Semua mesin tidak dicentang'), logText().slice(before4).slice(0, 300));
  check('C4 terjemahan tidak berubah', trOf(S, 'Hello world.') && trOf(S, 'Hello world.').text === 'Halo dunia.' && trOf(S, 'Hello world.').via === 'Google', JSON.stringify(trOf(S, 'Hello world.')));

  /* ---------- 5: hanya diceklis + sudah bagus yang ikut ---------- */
  S = setupState();
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  S.translations.set(segByText(S, 'Hello $name.').id, { text: 'Halo $name.', via: 'Google' }); // bagus tapi TIDAK diceklis
  S.translations.set(segByText(S, 'John went home.').id, { text: '', via: 'gagal', failed: true }); // gagal
  // 'Rose' belum diterjemahkan; 'Skip this text.' skipped.
  setEngines({ google: true });
  selectIds(S, ['Hello world.', 'John went home.', 'Rose', 'Skip this text.']);
  const r5 = await V3410.retranslateSelected();
  check('C5 hanya 1 diganti (yang diceklis + bagus)', !!r5 && r5.replaced === 1 && r5.kept === 0, JSON.stringify(r5));
  check('C5 Hello yang diceklis diganti', trOf(S, 'Hello world.') && trOf(S, 'Hello world.').text === 'ID:Hello world.', JSON.stringify(trOf(S, 'Hello world.')));
  check('C5 yang bagus tapi TIDAK diceklis tidak berubah', trOf(S, 'Hello $name.') && trOf(S, 'Hello $name.').text === 'Halo $name.' && trOf(S, 'Hello $name.').via === 'Google', JSON.stringify(trOf(S, 'Hello $name.')));
  check('C5 yang gagal tidak ikut (tetap gagal)', trOf(S, 'John went home.') && trOf(S, 'John went home.').failed === true && trOf(S, 'John went home.').text === '', JSON.stringify(trOf(S, 'John went home.')));
  check('C5 yang belum diterjemahkan tidak ikut', trOf(S, 'Rose') === undefined, JSON.stringify(trOf(S, 'Rose')));
  check('C5 yang skipped tidak ikut', trOf(S, 'Skip this text.') === undefined, JSON.stringify(trOf(S, 'Skip this text.')));
  // runTranslate biasa tetap tidak menyentuh yang sudah bagus (perilaku lama).
  const untr5 = V348.untranslatedList();
  check('C5 untranslatedList tetap tidak memuat Hello yang sudah bagus', !untr5.some((s) => s.text === 'Hello world.'), JSON.stringify(untr5.map((s) => s.text)));

  /* ---------- 6: tombol nonaktif + klik nyata + log ---------- */
  S = setupState();
  const btn = $('btnRetranslate');
  check('C6 tombol Terjemahan custom ada di DOM', !!btn, 'btnRetranslate: ' + typeof btn);
  check('C6 tombol nonaktif saat tidak ada yang diceklis', !!btn && btn.disabled === true, 'disabled: ' + (btn && btn.disabled));
  S.translations.set(segByText(S, 'Hello world.').id, { text: 'Halo dunia.', via: 'Google' });
  setEngines({ google: true });
  selectIds(S, ['Hello world.']);
  check('C6 tombol aktif setelah ada yang diceklis', btn.disabled === false, 'disabled: ' + btn.disabled);
  const before6 = logText().length; // log dari C1-C5 sudah berisi baris yang sama — tunggu baris BARU
  btn.click();
  const clicked = await waitFor(() => logText().slice(before6).includes('Terjemah ulang: 1 diganti, 0 dipertahankan.'), 8000);
  check('C6 klik tombol menjalankan ulang (log jumlah)', clicked, logText().slice(-300));
  check('C6 klik tombol mengganti terjemahan', trOf(S, 'Hello world.') && trOf(S, 'Hello world.').text === 'ID:Hello world.' && trOf(S, 'Hello world.').via === 'Google', JSON.stringify(trOf(S, 'Hello world.')));

  console.log('\nV3410_RETRANSLATE: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
