/* Test v3.4.7 — Dedup internal (F01 + F02 + F03).
   Jalankan: node test_v347_dedup.js [path/index.html]
   Ketiga butir ini refactor murni (perilaku tidak berubah); jaring
   pengamannya adalah suite penuh + pin langsung di sini:
   (F03) satu helper labelHasPipe dipakai validateOne, qaSegment,
         buildOutput — pin langsung + penolakan '|' tetap jalan;
   (F01) satu helper refreshAfterMutation dipakai 8 situs — pin ada +
         memanggil keempat langkah;
   (F02) rantai fallback berbasis tabel + helper fetchOk — pin urutan
         + label mesin berikutnya dari urutan rantai.
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
const V347 = w.__GTHTML_V347__;
const $ = (id) => w.document.getElementById(id);
const logText = () => ($('logBox') || { textContent: '' }).textContent;

check('A0 hook v3.4.7 tersedia', !!V347 && typeof V347.validateOne === 'function' && typeof V347.buildOutput === 'function');
if (!V347) { console.log('\nV347_DEDUP: hook belum ada — RED'); process.exit(1); }

async function main() {
  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (($('logBox') || { textContent: '' }).textContent.includes('Acorn') || Date.now() - t0 > 3000) { clearInterval(iv); r(); }
    }, 10);
  });
  w.confirm = () => true;

  /* ---------- F03: labelHasPipe ---------- */
  check('F03 helper labelHasPipe diekspos', typeof V347.labelHasPipe === 'function');
  if (typeof V347.labelHasPipe === 'function') {
    const single = { singleLink: true };
    const plain = { singleLink: false };
    check('F03 labelHasPipe: singleLink + "|" -> true', V347.labelHasPipe(single, 'Ru|mah') === true);
    check('F03 labelHasPipe: singleLink tanpa "|" -> false', V347.labelHasPipe(single, 'Rumah') === false);
    check('F03 labelHasPipe: bukan singleLink + "|" -> false', V347.labelHasPipe(plain, 'Ru|mah') === false);
    check('F03 labelHasPipe: seg null -> false', V347.labelHasPipe(null, 'Ru|mah') === false);
    check('F03 labelHasPipe: teks kosong -> false', V347.labelHasPipe(single, '') === false);
    check('F03 validateOne tetap menolak label ber-|', V347.validateOne('Ru|mah', 'Home', single) === 'label mengandung |');
    check('F03 validateOne menerima label tanpa |', V347.validateOne('Rumah', 'Home', single) === null);
  }

  /* ---------- F01: refreshUI / refreshAfterMutation ---------- */
  check('F01 helper refreshUI + refreshAfterMutation diekspos', typeof V347.refreshUI === 'function' && typeof V347.refreshAfterMutation === 'function');
  if (typeof V347.refreshAfterMutation === 'function') {
    const calls = [];
    const orig = { updateStats: w.updateStats, renderList: w.renderList, renderReport: w.renderReport, saveProject: w.saveProject };
    w.updateStats = (...a) => { calls.push('updateStats'); return orig.updateStats(...a); };
    w.renderList = (...a) => { calls.push('renderList'); return orig.renderList(...a); };
    w.renderReport = (...a) => { calls.push('renderReport'); return orig.renderReport(...a); };
    w.saveProject = (...a) => { calls.push('saveProject'); return orig.saveProject(...a); };
    V347.refreshAfterMutation();
    check('F01 refreshAfterMutation memanggil keempat langkah berurutan', JSON.stringify(calls) === JSON.stringify(['updateStats', 'renderList', 'renderReport', 'saveProject']), JSON.stringify(calls));
    calls.length = 0;
    V347.refreshUI();
    check('F01 refreshUI memanggil tiga langkah tanpa saveProject', JSON.stringify(calls) === JSON.stringify(['updateStats', 'renderList', 'renderReport']), JSON.stringify(calls));
    w.updateStats = orig.updateStats; w.renderList = orig.renderList; w.renderReport = orig.renderReport; w.saveProject = orig.saveProject;
  }
  check('F01 tidak ada lagi mantra 4-panggilan mentah di kode', !/updateStats\(\); renderList\(\); renderReport\(null, null\); saveProject\(\);/.test(html));

  /* ---------- F02: rantai tabel + fetchOk + label next turunan ---------- */
  check('F02 CB_NEXT sudah dihapus (label next dari urutan rantai)', !/const CB_NEXT\s*=/.test(html));
  check('F02 CB_LABEL sudah dihapus (pakai ENGINE_LABELS)', !/const CB_LABEL\s*=/.test(html));
  check('F02 tidak ada lagi cek !res.ok mentah (pakai fetchOk)', (html.match(/!res\.ok/g) || []).length === 0);
  check('F02 helper fetchOk + rantai ENGINE_CHAIN ada', typeof V347.translateBatch === 'function' && html.includes('function fetchOk') && html.includes('ENGINE_CHAIN'));
  if (typeof V347.translateBatch === 'function') {
    // Paksa Edge gagal 3 batch -> pemutus sirkuit trip; label "next" harus
    // turunan dari urutan rantai (MyMemory), bukan 'Translator Chrome'.
    const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
    w.fetch = async (url) => {
      if (String(url).includes('edge.microsoft.com')) return errRes(500);
      throw new Error('fetch tak dikenal: ' + url);
    };
    V31.setRetrySleep(() => Promise.resolve());
    V344.setEngineSel({ custom: false, google: false, dict: false, edge: true, mymemory: false, chrome: false });
    V31.setCustomCfg({ enabled: false, baseUrl: '', apiKey: '', model: '' });
    V31.resetCircuitBreaker();
    const before = logText().length;
    await V347.translateBatch(['Halo dunia'], 'en', 'id');
    await V347.translateBatch(['Halo dunia'], 'en', 'id');
    await V347.translateBatch(['Halo dunia'], 'en', 'id');
    const delta = logText().slice(before);
    check('F02 pemutus sirkuit Edge trip setelah 3 gagal', /Pemutus sirkuit.*Edge dimatikan/.test(delta), delta.slice(-300));
    check('F02 label next Edge = MyMemory (turunan rantai)', delta.includes('pindah ke MyMemory'), delta.slice(-300));
  }

  console.log('\nV347_DEDUP: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
