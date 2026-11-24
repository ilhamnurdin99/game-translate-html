/* Test v3.4.17 — Parser custom tahan penalaran
   (ide Ilham: custom "format balasan tidak dikenal" kadang-kadang — model
   thinking Qwen3 menaruh <think>...</think> sebelum array jawaban, dan
   run 18:51 dengan openai/gpt-oss-120b juga gagal format 4x — penalaran
   mencapai parser, jadi ekstraksi '[' pertama...']' terakhir bukan JSON
   valid).
   Jalankan: node tests/test_v3417_think.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook V3417 + parse tahan penalaran belum
   ada), lalu perbaikan minimal.
   Spec (ide-think-qwen-v3415.md, dibangun sebagai v3.4.17 karena v3.4.16
   sudah lebih dulu LIVE):
   1. parseCustomResponse: buang blok <think> lengkap dulu, lalu coba
      SEMUA posisi '[' dari TERAKHIR ke pertama (jawaban di akhir balasan);
      kembalikan yang pertama lolos validasi (array, panjang = n, semua
      elemen string tak kosong); tanpa kandidat valid -> null.
   2. Penalaran TANPA tag think (kasus gpt-oss) + dua array -> array jawaban.
   3. Level customBatch (mock 200): konten think -> terjemahan kembali.
   4. Balasan gagal parse -> #logBox memuat potongan awal balasan mentahnya. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
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

  const V3417 = w.__GTHTML_V3417__;
  const V344 = w.__GTHTML_V344__;
  const V31 = w.__GTHTML_V31__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.17 tersedia', !!V3417 && typeof V3417.parseCustomResponse === 'function', 'hook: ' + typeof V3417);
  check('A0 label versi v3.4.21', html.includes('Game Translate HTML v3.4.21') && !html.includes('Game Translate HTML v3.4.20'));
  check('A0 Cara pakai menyebut v3.4.17', html.includes('(v3.4.17)'));
  if (!V3417 || typeof V3417.parseCustomResponse !== 'function') { console.log('\nV3417_THINK: parseCustomResponse belum diekspos di hook v3.4.17 — RED'); process.exit(1); }

  const parse = V3417.parseCustomResponse;

  /* ---------- 1: blok <think> dibuang sebelum parse ---------- */
  check('D1 think berisi kurung siku dibuang', eq(parse('<think>nalar [0], [1] dulu</think>["a","b"]', 2), ['a', 'b']));
  check('D1 think berisi fence + array asli sesudahnya', eq(parse('<think>contoh:\n```json\n["x"]\n```\n</think>["a","b"]', 2), ['a', 'b']));
  check('D1 tanpa think perilaku lama', eq(parse('["a","b"]', 2), ['a', 'b']));
  check('D1 prosa + array perilaku lama', eq(parse('Berikut terjemahannya: ["a","b"]', 2), ['a', 'b']));
  check('D1 kurung siku di dalam string jawaban', eq(parse('["a [x] b","c"]', 2), ['a [x] b', 'c']));
  check('D1 think tanpa penutup + tanpa array -> null', parse('<think>nalar [0], [1] terpotong', 2) === null);
  check('D1 array terpotong -> null', parse('<think>nalar [0]</think> ["a"', 2) === null);
  check('D1 panjang salah -> null', parse('["a"]', 2) === null);
  check('D1 elemen kosong -> null', parse('["a",""]', 2) === null);
  check('D1 konten bukan string -> null', parse(null, 2) === null && parse(42, 2) === null);

  /* ---------- 2: penalaran TANPA tag think (kasus gpt-oss) ---------- */
  check('D2 penalaran berisi kurung + array jawaban di akhir', eq(parse('Reasoning: periksa [0] dan [1] dulu... ["Terjemahan 1","Terjemahan 2"]', 2), ['Terjemahan 1', 'Terjemahan 2']));
  check('D2 dua array -> yang kedua (jawaban)', eq(parse('Catatan [0]: ["junk a","junk b"] dan hasil ["Terjemahan 1","Terjemahan 2"]', 2), ['Terjemahan 1', 'Terjemahan 2']));

  /* ---------- mock fetch untuk D3 + D4 ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let customContent = null;
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('localhost:3001')) {
      return okRes({ choices: [{ message: { content: customContent } }] });
    }
    if (u.includes('translate.googleapis.com')) return errRes(500);
    if (u.includes('clients5.google.com')) return errRes(500);
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };
  V31.setRetrySleep(() => Promise.resolve());
  function setCustomOnly() {
    V344.setEngineSel({ custom: true, google: false, dict: false, edge: false, mymemory: false, chrome: false });
    V31.setCustomCfg({ enabled: true, baseUrl: 'http://localhost:3001/v1', apiKey: 'k-test', model: 'openai/gpt-oss-120b' });
    V31.resetCircuitBreaker();
  }

  /* ---------- 3: level customBatch, konten think -> terjemahan kembali ---------- */
  setCustomOnly();
  customContent = '<think>reasoning [with] brackets</think>["Terjemahan 1","Terjemahan 2"]';
  const out3 = await V31.translateBatch(['Teks 1.', 'Teks 2.'], 'en', 'id');
  check('D3 customBatch konten think -> terjemahan kembali', Array.isArray(out3) && out3[0] && out3[0].text === 'Terjemahan 1' && out3[0].via === 'Custom' && out3[1] && out3[1].text === 'Terjemahan 2', JSON.stringify(out3));

  /* ---------- 4: log diagnosis saat parse gagal ---------- */
  setCustomOnly();
  customContent = 'bukan json sama sekali, tanpa kurung siku penutup';
  const out4 = await V31.translateBatch(['Teks 1.', 'Teks 2.'], 'en', 'id');
  check('D4 gagal parse -> hasil null semua', Array.isArray(out4) && out4[0] === null && out4[1] === null, JSON.stringify(out4));
  check('D4 log memuat potongan awal balasan mentah', logText().includes('awal balasan') && logText().includes('bukan json sama sekali'), logText().slice(-300));
  setCustomOnly();
  customContent = null;
  await V31.translateBatch(['Teks 1.'], 'en', 'id');
  // (v3.4.21) Baris log lama 'isi balasan bukan string (...)' SENGAJA
  // diganti baris diagnostik 'balasan tanpa content (...)' — cek diubah.
  check('D4 konten bukan string -> log diagnostik mencatat tipenya', logText().includes('balasan tanpa content') && logText().includes('(object)'), logText().slice(-300));

  console.log('\nV3417_THINK: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
