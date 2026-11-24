/* Test v3.4.5 — Ringkasan QA selalu segar.
   Jalankan: node test_v345_qa.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) hook v3.4.5 + label v3.4.5 + bullet Cara pakai v3.4.5;
   (b) run yang hanya diisi TM (jalur kembali dini runTranslate):
       qaSummary + untransList diperbarui, bukan snapshot lama;
   (c) terjemahan per baris: untransList + qaSummary diperbarui;
   (d) edit manual: ringkasan TIDAK berubah per ketikan (debounce),
       berubah ~500 ms setelah berhenti mengetik;
   (e) impor TM lewat change event: ringkasan ikut segar.
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
const V345 = w.__GTHTML_V345__;
const $ = (id) => w.document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); }
  return fn();
};

check('A0 hook v3.4.5 tersedia', !!V345 && typeof V345.renderReport === 'function' && typeof V345.applyTM === 'function' && typeof V345.runTranslate === 'function' && typeof V345.scheduleReportRefresh === 'function' && typeof V345.renderList === 'function');
check('A0 label versi v3.4.19', html.includes('Game Translate HTML v3.4.19') && !html.includes('Game Translate HTML v3.4.13'));
check('A0 Cara pakai menyebut v3.4.5', html.includes('Ringkasan QA selalu segar &amp; filter belum diterjemahkan (v3.4.5)'));

const FIX = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Beach" tags="" position="100,100" size="100,100">'
  + '[[Hang Out (0:30)|Beach Hang Out]]\n'
  + '[[Brown|Hair Dyed][$Player.HairColorNew to "Brown"]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Walk" tags="" position="200,100" size="100,100">'
  + 'Keep walking here.\n\nRoll _randomRoll now.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
function setupState() {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(FIX) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false; S.listQuery = ""; S.listScope = "all"; S.listOnlyUntr = false;');
  // PENTING: reset segCounter + render ulang — tanpa ini, doScan kedua dst.
  // membuat segmen ber-id baru sementara baris DOM masih ber-data-id lama,
  // sehingga handler per baris tidak menemukan segmennya (return diam-diam).
  w.eval('segCounter = 0; doScan(); renderList();');
  return V345.state;
}
const segByText = (S, t) => S.segments.find((s) => s.text === t);
const rows = () => [...w.document.querySelectorAll('#listBody .trow')].filter((r) => r.querySelector('textarea'));
const rowTexts = () => rows().map((r) => r.querySelector('.orig').textContent);
const fireInput = (el) => el.dispatchEvent(new w.Event('input', { bubbles: true }));
const qaText = () => $('qaSummary').textContent;
const untrText = () => $('untransList').textContent;

/* mock fetch (pola v3.4.4): Google ok, Dict ok. */
w.fetch = async (url, opts) => {
  const u = String(url);
  const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
  if (u.includes('clients5.google.com')) {
    const qs = new URL(u).searchParams.getAll('q');
    return okRes(qs.map((t) => 'ID:' + t));
  }
  if (u.includes('translate.googleapis.com')) {
    const qs = new URL(u).searchParams.getAll('q');
    if (qs.length === 1 && qs[0].includes('ZXQSEP')) return okRes([[['x ' + qs[0] + ' y']]]);
    return okRes([qs.map((t) => [['ID:' + t]])]);
  }
  return { ok: false, status: 404, json: async () => ({}) };
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

  /* ---------- (b) run yang hanya diisi TM ---------- */
  let S = setupState();
  V345.renderReport(null, null);
  check('B1 baseline: 4 teks bermasalah, 4 belum diterjemahkan', qaText().indexOf('4 teks bermasalah') !== -1 && untrText().indexOf('Hang Out') !== -1 && untrText().indexOf('Brown') !== -1, qaText() + ' / ' + untrText());
  S.tm.set('Hang Out (0:30)', 'Bersantai (0:30)');
  S.tm.set('Brown', 'Cokelat');
  S.tm.set('Keep walking here.', 'Terus berjalan di sini.');
  S.tm.set('Roll _randomRoll now.', 'Lempar _randomRoll sekarang.');
  await V345.runTranslate('all');
  check('B1 TM-only run: qaSummary segar (semua lolos QA)', qaText() === 'Semua teks yang diterjemahkan lolos QA.', qaText());
  check('B1 TM-only run: untransList segar (tidak ada)', untrText().indexOf('Tidak ada') !== -1, untrText());
  check('B1 TM-only run: Statistik 4/4', $('statDone').textContent === '4' && $('statLeft').textContent === '0', $('statDone').textContent + '/' + $('statLeft').textContent);

  /* ---------- (c) terjemahan per baris ---------- */
  S = setupState();
  V345.renderReport(null, null);
  check('C1 baseline: 4 teks bermasalah', qaText().indexOf('4 teks bermasalah') !== -1, qaText());
  {
    const row = rows().find((r) => r.querySelector('.orig').textContent === 'Hang Out (0:30)');
    row.querySelector('.tr-one').dispatchEvent(new w.Event('click', { bubbles: true }));
    const ok = await waitFor(() => {
      const t = V345.state.translations.get(segByText(V345.state, 'Hang Out (0:30)').id);
      return !!t && !!t.text && !t.failed;
    }, 5000);
    check('C1 terjemahan per baris berhasil (via Google)', ok, JSON.stringify(V345.state.translations.get(segByText(V345.state, 'Hang Out (0:30)').id)));
    check('C1 qaSummary turun ke 3 teks bermasalah', qaText().indexOf('3 teks bermasalah') !== -1, qaText());
    check('C1 untransList tidak lagi berisi Hang Out', untrText().indexOf('Hang Out') === -1 && untrText().indexOf('Brown') !== -1, untrText());
  }

  /* ---------- (d) edit manual (debounce) ---------- */
  S = setupState();
  V345.renderReport(null, null);
  check('D1 baseline: 4 teks bermasalah', qaText().indexOf('4 teks bermasalah') !== -1, qaText());
  {
    const row = rows().find((r) => r.querySelector('.orig').textContent === 'Brown');
    const ta = row.querySelector('textarea');
    ta.value = 'Cokelat';
    fireInput(ta);
    check('D1 sesaat setelah ketik: ringkasan BELUM berubah (debounce)', qaText().indexOf('4 teks bermasalah') !== -1, qaText());
    await sleep(800);
    check('D1 800 ms setelah berhenti mengetik: ringkasan segar (3 bermasalah)', qaText().indexOf('3 teks bermasalah') !== -1, qaText());
    check('D1 untransList tidak lagi berisi Brown', untrText().indexOf('Brown') === -1, untrText());
    const t = V345.state.translations.get(segByText(V345.state, 'Brown').id);
    check('D1 edit manual tersimpan (via manual)', !!t && t.text === 'Cokelat' && t.via === 'manual', JSON.stringify(t));
  }

  /* ---------- (e) impor TM lewat change event ---------- */
  S = setupState();
  V345.renderReport(null, null);
  check('E1 baseline: 4 teks bermasalah', qaText().indexOf('4 teks bermasalah') !== -1, qaText());
  {
    const tm = { 'Hang Out (0:30)': 'Bersantai (0:30)', 'Brown': 'Cokelat', 'Keep walking here.': 'Terus berjalan di sini.', 'Roll _randomRoll now.': 'Lempar _randomRoll sekarang.' };
    const f = new w.File([JSON.stringify(tm)], 'tm.json', { type: 'application/json' });
    const inp = $('tmFile');
    Object.defineProperty(inp, 'files', { value: [f] });
    inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    const ok = await waitFor(() => V345.state.translations.size === 4, 3000);
    check('E1 impor TM mengisi 4 teks', ok, 'size=' + V345.state.translations.size);
    check('E1 qaSummary segar setelah impor TM', qaText() === 'Semua teks yang diterjemahkan lolos QA.', qaText());
    check('E1 untransList segar setelah impor TM', untrText().indexOf('Tidak ada') !== -1, untrText());
  }

  console.log('\nV345_QA: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log('FAIL main crash — ' + (e && e.stack || e)); process.exit(1); });
