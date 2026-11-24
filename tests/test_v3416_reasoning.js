/* Test v3.4.16 — reasoning_effort low untuk model gpt-oss
   (ide Ilham: run 100 teks dengan openai/gpt-oss-120b kena 2x Custom HTTP 429
   padahal hanya ~10 permintaan/menit — yang ketabrak token per menit,
   token penalaran gpt-oss ikut dihitung).
   Jalankan: node tests/test_v3416_reasoning.js (dari root repo).
   TDD: tes ditulis gagal dulu (hook V3416 + reasoning_effort belum ada),
   lalu perbaikan minimal.
   Spec (ide-reasoning-effort-v3416.md):
   1. customBatch mengirim reasoning_effort: 'low' HANYA bila model
      mengandung 'gpt-oss' (case-insensitive); model lain (qwen, gemini)
      TIDAK dikirimi field itu sama sekali.
   2. Terjemahan tetap kembali normal untuk gpt-oss (mock 200). */
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
  check('A0 hook v3.4.16 tersedia', !!V3416 && typeof V3416.gptOssEffort === 'function', 'hook: ' + typeof V3416);
  check('A0 label versi v3.4.16', html.includes('Game Translate HTML v3.4.16') && !html.includes('Game Translate HTML v3.4.13'));
  check('A0 Cara pakai menyebut v3.4.16', html.includes('(v3.4.16)'));
  if (!V3416 || typeof V3416.gptOssEffort !== 'function') { console.log('\nV3416_REASONING: gptOssEffort belum diekspos di hook v3.4.16 — RED'); process.exit(1); }

  /* ---------- mock fetch: tangkap body custom ---------- */
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let lastBody = null;
  w.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('localhost:3001')) {
      lastBody = JSON.parse(opts.body);
      const texts = JSON.parse(lastBody.messages[1].content);
      return okRes({ choices: [{ message: { content: JSON.stringify(texts.map((t) => 'CUSTOM:' + t)) } }] });
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
  async function bodyFor(model) {
    setCustom(model);
    lastBody = null;
    const out = await V31.translateBatch(['Halo dunia.'], 'en', 'id');
    return { body: lastBody, out };
  }

  /* ---------- 1: reasoning_effort hanya untuk gpt-oss ---------- */
  let r = await bodyFor('openai/gpt-oss-120b');
  check('D1 gpt-oss-120b: body memuat reasoning_effort low', r.body && r.body.reasoning_effort === 'low', 'body: ' + JSON.stringify(r.body && r.body.reasoning_effort));
  check('D1 gpt-oss-120b: model tetap terkirim', r.body && r.body.model === 'openai/gpt-oss-120b', 'model: ' + JSON.stringify(r.body && r.body.model));
  r = await bodyFor('OpenAI/GPT-OSS-20B');
  check('D1 GPT-OSS-20B (huruf besar): body memuat reasoning_effort low', r.body && r.body.reasoning_effort === 'low', 'body: ' + JSON.stringify(r.body && r.body.reasoning_effort));
  r = await bodyFor('qwen/qwen3.6-27b');
  check('D1 qwen: body TIDAK memuat reasoning_effort', r.body && !('reasoning_effort' in r.body), 'body: ' + JSON.stringify(Object.keys(r.body || {})));
  r = await bodyFor('gemini-2.5-flash');
  check('D1 gemini: body TIDAK memuat reasoning_effort', r.body && !('reasoning_effort' in r.body), 'body: ' + JSON.stringify(Object.keys(r.body || {})));
  r = await bodyFor('llama-3.3-70b-versatile');
  check('D1 llama: body TIDAK memuat reasoning_effort', r.body && !('reasoning_effort' in r.body), 'body: ' + JSON.stringify(Object.keys(r.body || {})));
  check('D1 helper gptOssEffort langsung', V3416.gptOssEffort('openai/gpt-oss-120b') === 'low' && V3416.gptOssEffort('qwen/qwen3.6-27b') === null && V3416.gptOssEffort('') === null && V3416.gptOssEffort(null) === null, 'helper: ' + typeof V3416.gptOssEffort);

  /* ---------- 2: terjemahan tetap kembali normal (gpt-oss) ---------- */
  r = await bodyFor('openai/gpt-oss-120b');
  check('D2 gpt-oss: terjemahan kembali normal', Array.isArray(r.out) && r.out[0] && r.out[0].text === 'CUSTOM:Halo dunia.' && r.out[0].via === 'Custom', JSON.stringify(r.out));

  console.log('\nV3416_REASONING: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
