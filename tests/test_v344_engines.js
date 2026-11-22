/* Test v3.4.4 — Tombol pilih mesin terjemah.
   Jalankan: node test_v344_engines.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji dengan fetch + Translator
   yang di-mock (pola test_v31_fallback.js):
   (a) 6 ceklis mesin ada & default semua aktif;
   (b) mesin yang dimatikan dilewati rantai (Google mati -> langsung Dict,
       Dict mati -> Edge, custom mati -> tidak dipanggil);
   (c) semua mesin mati -> translateBatch kembalikan null tanpa fetch,
       runTranslate beri peringatan dan tidak mulai;
   (d) penyelamatan Chrome dihormati (dicentang -> menyelamatkan,
       tidak dicentang -> dilewati, Translator tidak dipanggil);
   (e) pilihan tersimpan (localStorage + save/restore proyek).
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
const V31 = w.__GTHTML_V31__;
const V344 = w.__GTHTML_V344__;
const $ = (id) => w.document.getElementById(id);
const logText = () => ($('logBox') || { textContent: '' }).textContent;

check('A0 hook v3.4.4 tersedia', !!V344 && typeof V344.engineEnabled === 'function' && typeof V344.allEnginesOff === 'function' && typeof V344.setEngineSel === 'function' && typeof V344.translateBatch === 'function' && typeof V344.translateSegments === 'function');
check('A0 label versi v3.4.4', html.includes('Game Translate HTML v3.4.4') && !html.includes('Game Translate HTML v3.4.3'));
check('A0 Cara pakai menyebut v3.4.4', html.includes('Pilih mesin &amp; cari di Daftar Teks (v3.4.4)'));

/* ---------- mock fetch + Translator (pola v3.1) ---------- */
const calls = { google: 0, marker: 0, dict: 0, edge: 0, mymemory: 0, custom: 0 };
function resetCalls() { for (const k of Object.keys(calls)) calls[k] = 0; }
let mode = 'google-ok';
const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
w.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('clients5.google.com')) {
    calls.dict++;
    if (mode === 'all-fail' || mode === 'dict-fail') return errRes(500);
    const qs = new URL(u).searchParams.getAll('q');
    return okRes(qs.map((t) => 'ID:' + t));
  }
  if (u.includes('translate.googleapis.com')) {
    const qs = new URL(u).searchParams.getAll('q');
    if (qs.length === 1 && qs[0].includes('ZXQSEP')) {
      calls.marker++;
      if (mode === 'google-null' || mode === 'all-fail') return okRes([[['teks tanpa marker']]]);
      return okRes([[['x ' + qs[0] + ' y']]]);
    }
    calls.google++;
    if (mode === 'google-null' || mode === 'all-fail') return okRes([qs.map(() => [])]);
    return okRes([qs.map((t) => [['ID:' + t]])]);
  }
  if (u.includes('edge.microsoft.com')) {
    calls.edge++;
    if (mode === 'all-fail' || mode === 'edge-fail') return errRes(500);
    const texts = JSON.parse(opts.body);
    return okRes(texts.map((t) => ({ translations: [{ text: 'ID:' + t }] })));
  }
  if (u.includes('api.mymemory.translated.net')) {
    calls.mymemory++;
    if (mode === 'all-fail') return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    const q = new URL(u).searchParams.get('q');
    return okRes({ responseData: { translatedText: 'ID:' + q } });
  }
  if (u.includes('x.test')) {
    calls.custom++;
    return errRes(401);
  }
  throw new Error('fetch tak dikenal: ' + u);
};
V31.setRetrySleep(() => Promise.resolve());
let chromeCreates = 0;
w.Translator = {
  availability: async () => 'available',
  create: async () => { chromeCreates++; return { translate: async (t) => 'CHROME:' + t }; },
};
const ALL_ON = { custom: true, google: true, dict: true, edge: true, mymemory: true, chrome: true };
const ALL_OFF = { custom: false, google: false, dict: false, edge: false, mymemory: false, chrome: false };
function resetEngines() { V344.setEngineSel(ALL_ON); V31.setCustomCfg({ enabled: false, baseUrl: '', apiKey: '', model: '' }); V31.resetCircuitBreaker(); }

async function main() {
  // Pastikan init() sudah jalan (listener DOM terpasang) sebelum menguji ceklis.
  await new Promise((r) => { if (w.document.readyState !== 'loading') r(); else w.document.addEventListener('DOMContentLoaded', r); });

  /* ---------- (a) ceklis di DOM ---------- */
  const boxes = [...w.document.querySelectorAll('.engChk')];
  check('A1 6 ceklis mesin ada', boxes.length === 6, 'dapat: ' + boxes.length);
  check('A1 urutan ceklis: custom, google, dict, edge, mymemory, chrome',
    JSON.stringify(boxes.map((b) => b.dataset.eng)) === JSON.stringify(['custom', 'google', 'dict', 'edge', 'mymemory', 'chrome']),
    JSON.stringify(boxes.map((b) => b.dataset.eng)));
  check('A1 default semua tercentang', boxes.every((b) => b.checked));
  check('A1 engineSel default semua true', ['custom', 'google', 'dict', 'edge', 'mymemory', 'chrome'].every((k) => V344.engineEnabled(k)));
  check('A1 allEnginesOff() false saat semua aktif', V344.allEnginesOff() === false);

  /* ---------- (b) mesin yang dimatikan dilewati ---------- */
  mode = 'google-ok'; resetCalls(); resetEngines();
  V344.setEngineSel({ google: false });
  const r1 = await V344.translateBatch(['Halo dunia', 'Selamat pagi'], 'en', 'id');
  check('B1 Google mati: hasil via Google Dict', r1.every((x) => x && x.via === 'Google Dict'), JSON.stringify(r1));
  check('B1 Google mati: Google 0x, marker 0x, Dict 1x', calls.google === 0 && calls.marker === 0 && calls.dict === 1, JSON.stringify(calls));

  resetCalls(); resetEngines();
  V344.setEngineSel({ google: false, dict: false });
  const r2 = await V344.translateBatch(['Halo dunia'], 'en', 'id');
  check('B2 Google+Dict mati: hasil via Edge', r2[0] && r2[0].via === 'Edge', JSON.stringify(r2));
  check('B2 Google+Dict mati: Edge 1x, Google/Dict 0x', calls.edge === 1 && calls.google === 0 && calls.dict === 0, JSON.stringify(calls));

  resetCalls(); resetEngines();
  V31.setCustomCfg({ enabled: true, baseUrl: 'https://x.test', apiKey: 'bad-key', model: 'm1' });
  const r3a = await V344.translateBatch(['Halo dunia'], 'en', 'id');
  check('B3 custom aktif: custom dipanggil (401) lalu jatuh ke Google', calls.custom === 1 && r3a[0] && r3a[0].via === 'Google', JSON.stringify(calls) + ' ' + JSON.stringify(r3a));
  const cBefore = calls.custom;
  V344.setEngineSel({ custom: false });
  const r3b = await V344.translateBatch(['Halo dunia'], 'en', 'id');
  check('B3 custom mati: custom TIDAK dipanggil lagi', calls.custom === cBefore, JSON.stringify(calls));
  check('B3 custom mati: hasil via Google', r3b[0] && r3b[0].via === 'Google', JSON.stringify(r3b));

  /* ---------- (c) semua mesin mati ---------- */
  resetCalls(); resetEngines();
  V344.setEngineSel(ALL_OFF);
  check('C1 allEnginesOff() true saat semua mati', V344.allEnginesOff() === true);
  const r4 = await V344.translateBatch(['Halo dunia', 'Selamat pagi'], 'en', 'id');
  check('C1 semua mati: translateBatch kembalikan null semua', r4.every((x) => x === null), JSON.stringify(r4));
  check('C1 semua mati: TIDAK ada fetch sama sekali', Object.values(calls).every((n) => n === 0), JSON.stringify(calls));
  w.eval("S.fileName = 'tes.html';");
  const logBefore = logText().length;
  await V344.runTranslate('all');
  check('C1 semua mati: runTranslate beri peringatan dan tidak mulai', logText().slice(logBefore).includes('Semua mesin tidak dicentang'), logText().slice(logBefore));
  check('C1 semua mati: runTranslate tidak memanggil fetch', Object.values(calls).every((n) => n === 0), JSON.stringify(calls));

  /* ---------- (d) penyelamatan Chrome dihormati ---------- */
  mode = 'all-fail'; resetCalls(); resetEngines(); chromeCreates = 0;
  const q1 = [{ id: 'e1', text: 'Hello world' }, { id: 'e2', text: 'Good morning' }];
  await V344.translateSegments(q1);
  const rescued = q1.filter((s) => { const t = V344.state.translations.get(s.id); return t && !t.failed && t.via === 'Chrome'; }).length;
  check('D1 Chrome aktif: menyelamatkan 2/2 teks yang gagal online', rescued === 2, 'rescued=' + rescued);
  check('D1 Chrome aktif: Translator.create dipanggil', chromeCreates >= 1, 'creates=' + chromeCreates);

  resetCalls(); resetEngines(); chromeCreates = 0;
  V344.setEngineSel({ chrome: false });
  const q2 = [{ id: 'f1', text: 'Hello world' }, { id: 'f2', text: 'Good morning' }];
  await V344.translateSegments(q2);
  const stillFailed = q2.filter((s) => { const t = V344.state.translations.get(s.id); return t && t.failed; }).length;
  check('D2 Chrome mati: teks tetap gagal (bukan diselamatkan)', stillFailed === 2, 'failed=' + stillFailed);
  check('D2 Chrome mati: Translator.create TIDAK dipanggil', chromeCreates === 0, 'creates=' + chromeCreates);
  check('D2 Chrome mati: log "tidak dicentang" tampil', /tidak dicentang/.test(logText()), logText().slice(-300));

  /* ---------- (e) persistensi ---------- */
  resetEngines();
  V344.setEngineSel({ google: false, edge: false });
  const savedLs = JSON.parse(w.localStorage.getItem('gthtml_engines_v1'));
  check('E1 setEngineSel tersimpan di localStorage', savedLs && savedLs.google === false && savedLs.edge === false && savedLs.dict === true, JSON.stringify(savedLs));
  check('E1 ceklis ikut berubah (Google/Edge tidak tercentang)', [...w.document.querySelectorAll('.engChk')].find((b) => b.dataset.eng === 'google').checked === false && [...w.document.querySelectorAll('.engChk')].find((b) => b.dataset.eng === 'edge').checked === false && [...w.document.querySelectorAll('.engChk')].find((b) => b.dataset.eng === 'dict').checked === true);
  // loadEngineSel membaca default dari localStorage: ubah state di
  // memori saja (tanpa menyimpan), lalu muat ulang dari localStorage.
  w.eval('S.engineSel = { custom: true, google: true, dict: true, edge: true, mymemory: true, chrome: true };');
  V344.loadEngineSel();
  check('E1 loadEngineSel: Google/Edge kembali mati dari localStorage', V344.engineEnabled('google') === false && V344.engineEnabled('edge') === false && V344.engineEnabled('dict') === true);
  // save/restore proyek membawa engineSel
  V344.setEngineSel({ google: false, dict: true, edge: true, mymemory: true, chrome: true, custom: true });
  w.eval("S.fileName = 'proj.html'; S.originalText = '<html></html>'; S.segments = []; S.passages = []; S.translations = new Map(); S.glossary = []; S.skipPassages = new Set();");
  V31.saveProject();
  const savedProj = JSON.parse(w.localStorage.getItem('gthtml_v1'));
  check('E2 saveProject menyimpan engineSel', savedProj && savedProj.engineSel && savedProj.engineSel.google === false, JSON.stringify(savedProj && savedProj.engineSel));
  V344.setEngineSel(ALL_ON);
  V31.restoreProject(savedProj);
  check('E2 restoreProject mengembalikan engineSel (Google mati)', V344.engineEnabled('google') === false && V344.engineEnabled('dict') === true);
  check('E2 restoreProject: ceklis Google tidak tercentang', [...w.document.querySelectorAll('.engChk')].find((b) => b.dataset.eng === 'google').checked === false);
  // proyek lama tanpa engineSel -> tidak crash, pilihan yang sedang
  // aktif dipertahankan (bukan di-reset diam-diam).
  const oldProj = Object.assign({}, savedProj);
  delete oldProj.engineSel;
  V31.restoreProject(oldProj);
  check('E2 proyek lama tanpa engineSel: tidak crash, pilihan tetap (Google masih mati)', V344.engineEnabled('google') === false && V344.engineEnabled('dict') === true);

  resetEngines();
  console.log('\nV344_ENGINES: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
