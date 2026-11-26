/* Test v3.4.21 — Balasan custom kosong: log bentuk balasan +
   reasoning_effort untuk Gemini + fallback reasoning_content
   (run Ilham 20:43 2026-11-24: 100 teks, langsung Google +
   gemini-3.5-flash-lite, 80 diganti 20 dipertahankan; error dominan
   "Custom: balasan tidak dikenal — isi balasan bukan string (undefined)"
   — provider menjawab tapi choices[0].message.content tidak ada.
   Log v3.4.17 hanya mencatat awal balasan bila content berupa string,
   jadi penyebab balasan kosong tidak bisa ditentukan dari log.)
   Jalankan: node tests/test_v3421_gemini.js (dari root repo).
   TDD: tes ditulis gagal dulu (reasoningEffort + log diagnostik +
   fallback belum ada), lalu perbaikan minimal.
   Spec (ide-balasan-kosong-gemini-v3421.md):
   1. gemini-3.5-flash-lite -> reasoning_effort 'low'.
   2. gemini-3.8-flash, gemini-2.5-flash, gemini-4-argon -> 'low'.
   3. openai/gpt-oss-120b -> tetap 'low' (v3.4.16 dipertahankan).
   4. llama-3.1-8b-instant (non-reasoning) -> TIDAK ada reasoning_effort.
   5. message tanpa content + reasoning_content berisi array JSON valid
      -> terjemahan dikembalikan (fallback bekerja).
   6. content hilang + reasoning_content prosa -> tetap throw format
      error + baris log diagnostik tercatat (mengandung
      'balasan tanpa content' dan finish_reason mock).
   7. content hilang + tanpa reasoning_content -> tetap throw + baris
      log diagnostik tercatat (dengan 'reasoning awal: -').
   8. A0: label versi naik ke v3.4.21. */
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

  const V3416 = w.__GTHTML_V3416__;
  const V344 = w.__GTHTML_V344__;
  const V31 = w.__GTHTML_V31__;

  /* ---------- A0: hook + label versi ---------- */
  check('A0 hook v3.4.21 tersedia', !!V3416 && typeof V3416.reasoningEffort === 'function', 'hook: ' + typeof V3416);
  check('A0 label versi v3.4.27', html.includes('Game Translate HTML v3.4.27') && !html.includes('Game Translate HTML v3.4.26'));
  check('A0 Cara pakai menyebut v3.4.21', html.includes('(v3.4.21)'));

  /* ---------- mock fetch: tangkap body custom ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let lastBody = null;
  let customResponse = null; // (texts) => data | { http: status }
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('localhost:3001')) {
      lastBody = JSON.parse(opts.body);
      const texts = JSON.parse(lastBody.messages[1].content);
      const r = typeof customResponse === 'function' ? customResponse(texts) : customResponse;
      if (r && r.http) return errRes(r.http);
      return okRes(r);
    }
    if (u.includes('translate.googleapis.com')) return errRes(500);
    if (u.includes('clients5.google.com')) return errRes(500);
    if (u.includes('edge.microsoft.com')) return errRes(500);
    if (u.includes('api.mymemory.translated.net')) return okRes({ responseData: { translatedText: 'MYMEMORY WARNING: DAILY QUOTA EXCEEDED' } });
    throw new Error('fetch tak dikenal: ' + u);
  };
  function setCustom(model) {
    V344.setEngineSel({ custom: true, google: false, dict: false, edge: false, mymemory: false, chrome: false });
    V31.setCustomCfg({ enabled: true, baseUrl: 'http://localhost:3001/v1', apiKey: 'k-test', model });
    V31.resetCircuitBreaker();
  }
  const normalCustom = (texts) => ({ choices: [{ message: { content: JSON.stringify(texts.map((t) => 'CUSTOM:' + t)) } }] });
  async function runCustom(model, texts, response) {
    setCustom(model);
    lastBody = null;
    customResponse = response;
    const out = await V31.translateBatch(texts, 'en', 'id');
    return { body: lastBody, out };
  }

  /* ---------- 1: gemini-3.5-flash-lite -> reasoning_effort low ---------- */
  let r = await runCustom('gemini-3.5-flash-lite', ['Halo dunia.'], normalCustom);
  check('D1 gemini-3.5-flash-lite: body memuat reasoning_effort low', r.body && r.body.reasoning_effort === 'low', 'body: ' + JSON.stringify(r.body && r.body.reasoning_effort));
  check('D1 gemini-3.5-flash-lite: terjemahan kembali normal', Array.isArray(r.out) && r.out[0] && r.out[0].text === 'CUSTOM:Halo dunia.' && r.out[0].via === 'Custom', JSON.stringify(r.out));

  /* ---------- 2: model Gemini lain -> reasoning_effort low ---------- */
  for (const model of ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-4-argon']) {
    r = await runCustom(model, ['Halo dunia.'], normalCustom);
    check('D2 ' + model + ': body memuat reasoning_effort low', r.body && r.body.reasoning_effort === 'low', 'body: ' + JSON.stringify(r.body && r.body.reasoning_effort));
  }

  /* ---------- 3: gpt-oss tetap low (v3.4.16 dipertahankan) ---------- */
  r = await runCustom('openai/gpt-oss-120b', ['Halo dunia.'], normalCustom);
  check('D3 gpt-oss-120b: body tetap memuat reasoning_effort low', r.body && r.body.reasoning_effort === 'low', 'body: ' + JSON.stringify(r.body && r.body.reasoning_effort));

  /* ---------- 4: model non-reasoning TIDAK dikirimi field itu ---------- */
  r = await runCustom('llama-3.1-8b-instant', ['Halo dunia.'], normalCustom);
  check('D4 llama: body TIDAK memuat reasoning_effort', r.body && !('reasoning_effort' in r.body), 'body: ' + JSON.stringify(Object.keys(r.body || {})));

  /* ---------- helper langsung (bila hook ada) ---------- */
  if (V3416 && typeof V3416.reasoningEffort === 'function') {
    const h = V3416.reasoningEffort;
    check('D4 helper reasoningEffort langsung', h('gemini-3.5-flash-lite') === 'low' && h('openai/gpt-oss-120b') === 'low' && h('llama-3.1-8b-instant') === null && h('qwen/qwen3.6-27b') === null && h('') === null && h(null) === null, 'helper: ' + typeof h);
  } else {
    check('D4 helper reasoningEffort langsung', false, 'hook reasoningEffort belum ada — RED');
  }

  /* ---------- 5: fallback reasoning_content berisi array valid ---------- */
  const noContentValidReasoning = () => ({ choices: [{ message: { role: 'assistant', reasoning_content: '["Satu.", "Dua."]' }, finish_reason: 'stop' }] });
  r = await runCustom('gemini-3.5-flash-lite', ['Satu.', 'Dua.'], noContentValidReasoning);
  check('D5 fallback reasoning_content: terjemahan dikembalikan', Array.isArray(r.out) && r.out[0] && r.out[0].text === 'Satu.' && r.out[0].via === 'Custom' && r.out[1] && r.out[1].text === 'Dua.' && r.out[1].via === 'Custom', JSON.stringify(r.out));

  /* ---------- 6: content hilang + reasoning_content prosa ---------- */
  const noContentProseReasoning = () => ({ choices: [{ message: { role: 'assistant', reasoning_content: 'Let me think about these two short strings before answering.' }, finish_reason: 'stop' }] });
  r = await runCustom('gemini-3.5-flash-lite', ['Halo.', 'Dunia.'], noContentProseReasoning);
  check('D6 reasoning prosa: tidak ada terjemahan via Custom', !(r.out && r.out[0] && r.out[0].via === 'Custom'), JSON.stringify(r.out));
  check('D6 log diagnostik tercatat (balasan tanpa content + finish)', logText().includes('balasan tanpa content') && logText().includes('finish: stop'), logText().slice(-500));

  /* ---------- 7: content hilang + tanpa reasoning_content ---------- */
  const noContentNoReasoning = () => ({ choices: [{ message: { role: 'assistant' }, finish_reason: 'length' }] });
  r = await runCustom('gemini-3.5-flash-lite', ['Halo.'], noContentNoReasoning);
  check('D7 tanpa reasoning_content: tidak ada terjemahan via Custom', !(r.out && r.out[0] && r.out[0].via === 'Custom'), JSON.stringify(r.out));
  check('D7 log diagnostik tercatat (reasoning awal: -)', logText().includes('balasan tanpa content') && logText().includes('reasoning awal: -'), logText().slice(-500));

  console.log('\nV3421_GEMINI: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
