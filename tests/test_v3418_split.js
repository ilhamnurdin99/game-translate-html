/* Test v3.4.18 — Pecah batch saat custom menolak
   (ide Ilham: run 19:08 dengan gpt-oss-120b, 59 diganti 41 dipertahankan —
   log v3.4.17 membuktikan model MENOLAK batch: "I'm sorry, but I can't
   help with that." Penolakan per batch isi 10, jadi teks-tetangga yang
   tidak bersalah ikut tertinggal. Retry 2x pada batch yang sama ditolak
   lagi — deterministis.)
   Jalankan: node tests/test_v3418_split.js (dari root repo).
   TDD: tes ditulis gagal dulu (pecah batch belum ada), lalu perbaikan
   minimal.
   Spec (ide-pecah-batch-ditolak-v3418.md):
   1. Custom menolak batch 3 teks, lalu menerjemahkan ketiganya saat
      dicoba satuan -> ketiganya diterjemahkan (via Custom).
   2. Satuan yang ditolak jatuh ke Dict -> [tr1, tr2-via-Dict, tr3].
   3. 429 -> TIDAK ada pemecahan; jatuh ke mesin berikutnya.
   4. Batch 1 teks yang ditolak -> tidak ada rekursi/pecah.
   5. Network error -> TIDAK ada pemecahan; jatuh ke mesin berikutnya.
   6. Log hemat: satu baris pemecahan; keberhasilan satuan tidak
      menambah baris log per satuan.
   7. Pemutus sirkuit: setelah batch dipecah (1+ satuan ditolak), batch
      berikutnya yang sehat tetap diterjemahkan custom.
   8. A0: label versi naik ke v3.4.18. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); }
}
const REFUSAL = 'I’m sorry, but I can’t help with that.';
async function main() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  const logText = () => ($('logBox') || { textContent: '' }).textContent;
  const countInLog = (s) => logText().split(s).length - 1;
  const waitFor = async (fn, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 25)); }
    return fn();
  };
  await waitFor(() => logText().includes('Acorn'), 5000);

  const V31 = w.__GTHTML_V31__;
  const V344 = w.__GTHTML_V344__;

  /* ---------- A0: label versi ---------- */
  check('A0 label versi v3.4.26', html.includes('Game Translate HTML v3.4.26') && !html.includes('Game Translate HTML v3.4.22'));
  check('A0 Cara pakai menyebut v3.4.18', html.includes('(v3.4.18)'));

  /* ---------- mock fetch ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let customCalls = 0;
  let customBehavior = null; // (texts) => { content } | { http } | { network: true }
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('localhost:3001')) {
      customCalls++;
      const body = JSON.parse(opts.body);
      const texts = JSON.parse(body.messages[1].content);
      const res = customBehavior(texts);
      if (res.network) throw new Error('Failed to fetch');
      if (res.http) return errRes(res.http);
      return okRes({ choices: [{ message: { content: res.content } }] });
    }
    if (u.includes('translate.googleapis.com')) return errRes(500);
    if (u.includes('clients5.google.com')) {
      const params = new URLSearchParams(u.split('?')[1]);
      return okRes(params.getAll('q').map((q) => 'Dict:' + q));
    }
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };
  V31.setRetrySleep(() => Promise.resolve());
  function setEngines() {
    V344.setEngineSel({ custom: true, google: true, dict: true, edge: false, mymemory: false, chrome: false });
    V31.setCustomCfg({ enabled: true, baseUrl: 'http://localhost:3001/v1', apiKey: 'k-test', model: 'openai/gpt-oss-120b' });
    V31.resetCircuitBreaker();
  }
  const refuse = () => ({ content: REFUSAL });
  const translateAll = (texts) => ({ content: JSON.stringify(texts.map((t) => 'ID:' + t)) });

  /* ---------- 1: batch ditolak -> satuan diselamatkan via Custom ---------- */
  setEngines();
  customCalls = 0;
  customBehavior = (texts) => (texts.length > 1 ? refuse() : translateAll(texts));
  const out1 = await V31.translateBatch(['Teks 1.', 'Teks 2.', 'Teks 3.'], 'en', 'id');
  check('D1 batch ditolak -> ketiganya diterjemahkan via Custom',
    Array.isArray(out1) && out1[0] && out1[0].text === 'ID:Teks 1.' && out1[0].via === 'Custom' &&
    out1[1] && out1[1].text === 'ID:Teks 2.' && out1[1].via === 'Custom' &&
    out1[2] && out1[2].text === 'ID:Teks 3.' && out1[2].via === 'Custom', JSON.stringify(out1));
  check('D1 custom dipanggil 2x batch (retry) + 3x satuan = 5x', customCalls === 5, 'customCalls=' + customCalls);
  check('D1 log memuat satu baris pemecahan', countInLog('pecah jadi 3 teks satuan') === 1, logText().slice(-300));

  /* ---------- 2: satuan yang ditolak jatuh ke Dict ---------- */
  setEngines();
  customCalls = 0;
  customBehavior = (texts) => {
    if (texts.length > 1) return refuse();
    if (texts[0] === 'Teks 2.') return refuse();
    return translateAll(texts);
  };
  const out2 = await V31.translateBatch(['Teks 1.', 'Teks 2.', 'Teks 3.'], 'en', 'id');
  check('D2 satuan ditolak -> Dict, sisanya Custom',
    Array.isArray(out2) && out2[0] && out2[0].text === 'ID:Teks 1.' && out2[0].via === 'Custom' &&
    out2[1] && out2[1].text === 'Dict:Teks 2.' && out2[1].via === 'Google Dict' &&
    out2[2] && out2[2].text === 'ID:Teks 3.' && out2[2].via === 'Custom', JSON.stringify(out2));

  /* ---------- 3: 429 -> TIDAK pecah ---------- */
  setEngines();
  customCalls = 0;
  const logBefore3 = logText().length;
  customBehavior = () => ({ http: 429 });
  const out3 = await V31.translateBatch(['Teks 1.', 'Teks 2.', 'Teks 3.'], 'en', 'id');
  check('D3 429 -> tidak ada pemecahan (custom 2x retry saja)', customCalls === 2, 'customCalls=' + customCalls);
  check('D3 429 -> tidak ada baris pemecahan di log', !logText().slice(logBefore3).includes('pecah jadi'));
  check('D3 429 -> jatuh ke Dict seperti hari ini',
    Array.isArray(out3) && out3[0] && out3[0].via === 'Google Dict' && out3[0].text === 'Dict:Teks 1.', JSON.stringify(out3));

  /* ---------- 4: batch 1 teks ditolak -> tidak dipecah ---------- */
  setEngines();
  customCalls = 0;
  const logBefore4 = logText().length;
  customBehavior = () => refuse();
  const out4 = await V31.translateBatch(['Teks 1.'], 'en', 'id');
  check('D4 batch 1 teks ditolak -> custom 2x retry saja, tanpa rekursi', customCalls === 2, 'customCalls=' + customCalls);
  check('D4 batch 1 teks -> tidak ada baris pemecahan', !logText().slice(logBefore4).includes('pecah jadi'));
  check('D4 batch 1 teks -> jatuh ke Dict', Array.isArray(out4) && out4[0] && out4[0].via === 'Google Dict', JSON.stringify(out4));

  /* ---------- 5: network error -> TIDAK pecah ---------- */
  setEngines();
  customCalls = 0;
  const logBefore5 = logText().length;
  customBehavior = () => ({ network: true });
  const out5 = await V31.translateBatch(['Teks 1.', 'Teks 2.', 'Teks 3.'], 'en', 'id');
  check('D5 network -> tidak ada pemecahan (custom 2x retry saja)', customCalls === 2, 'customCalls=' + customCalls);
  check('D5 network -> tidak ada baris pemecahan di log', !logText().slice(logBefore5).includes('pecah jadi'));
  check('D5 network -> jatuh ke Dict seperti hari ini',
    Array.isArray(out5) && out5[0] && out5[0].via === 'Google Dict', JSON.stringify(out5));

  /* ---------- 6: log hemat ---------- */
  setEngines();
  const logBefore6 = logText().length;
  customBehavior = (texts) => (texts.length > 1 ? refuse() : translateAll(texts));
  await V31.translateBatch(['Teks 1.', 'Teks 2.', 'Teks 3.'], 'en', 'id');
  const seg6 = logText().slice(logBefore6);
  check('D6 log hemat: tepat satu baris pemecahan', seg6.split('pecah jadi 3 teks satuan').length - 1 === 1, seg6.slice(-400));
  check('D6 keberhasilan satuan tidak menambah baris log per satuan', !seg6.includes('ID:Teks 1.') && !seg6.includes('ID:Teks 2.') && !seg6.includes('ID:Teks 3.'));
  check('D6 baris awal balasan v3.4.17 tetap ada', seg6.includes('awal balasan'));

  /* ---------- 7: pemutus sirkuit tetap hidup untuk batch berikutnya ---------- */
  setEngines();
  customCalls = 0;
  customBehavior = (texts) => {
    if (texts.length > 1 && texts[0] === 'Teks A1.') return refuse();
    if (texts.length === 1 && texts[0] === 'Teks A2.') return refuse();
    return translateAll(texts);
  };
  const out7a = await V31.translateBatch(['Teks A1.', 'Teks A2.', 'Teks A3.'], 'en', 'id');
  check('D7 batch pecah: A1/A3 Custom, A2 Dict',
    Array.isArray(out7a) && out7a[0] && out7a[0].via === 'Custom' &&
    out7a[1] && out7a[1].via === 'Google Dict' &&
    out7a[2] && out7a[2].via === 'Custom', JSON.stringify(out7a));
  /* (v3.4.20) Harapan berubah: satuan A1/A3 yang selamat via Custom kini
     mereset streak (noteEngineOk tanpa penjaga !inSplit), jadi streak
     kembali 0 — dulu 1 karena keberhasilan satuan tidak dihitung. */
  check('D7 pemutus sirkuit: custom TIDAK dimatikan oleh penolakan satuan',
    V31.circuitBreaker.custom.down === false && V31.circuitBreaker.custom.streak === 0,
    'down=' + V31.circuitBreaker.custom.down + ' streak=' + V31.circuitBreaker.custom.streak);
  customBehavior = (texts) => translateAll(texts);
  const out7b = await V31.translateBatch(['Teks B1.', 'Teks B2.'], 'en', 'id');
  check('D7 batch sehat berikutnya tetap diterjemahkan custom',
    Array.isArray(out7b) && out7b[0] && out7b[0].via === 'Custom' && out7b[0].text === 'ID:Teks B1.' &&
    out7b[1] && out7b[1].via === 'Custom', JSON.stringify(out7b));

  console.log('\nV3418_SPLIT: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
