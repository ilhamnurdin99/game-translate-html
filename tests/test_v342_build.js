/* Test v3.4.2 — Build bertahap tanpa "Page Unresponsive" (file game-translate-html).
   Jalankan: node test_v342_build.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan), lalu menguji
   doBuild async: yield ke event loop antar fase, progres tiap fase,
   output byte-identik dengan jalur sync lama, tombol nonaktif selama build.
   Latar: klik Pratinjau / Timpa & Unduh di file 17.699 teks membekukan tab
   (Chrome "Page Unresponsive") karena doBuild() menjalankan semuanya
   sinkron di main thread — dan buildOutput menyalin ulang seluruh file
   (~1 MB) per ganti (17.699 x ~1 MB).
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
const G = w.GTHTML;
const V342 = w.__GTHTML_V342__;
const $ = (id) => w.document.getElementById(id);

check('A0 hook v3.4.2 tersedia', !!V342 && typeof V342.doBuild === 'function' && typeof V342.buildOutput === 'function' && typeof V342.qaAllChunked === 'function' && typeof V342.repairTranslations === 'function');
check('A0 label versi v3.4.4', html.includes('Game Translate HTML v3.4.4') && !html.includes('Game Translate HTML v3.4.3'));
check('A0 Cara pakai menyebut v3.4.2', html.includes('Bangun file tanpa macet (v3.4.2)'));
check('A0 GTHTML tersedia', !!G && typeof G.buildOutput === 'function' && typeof G.verifyOutput === 'function' && typeof G.encodePassageText === 'function');

/* ---------- algoritma lama (slice mundur) vs join satu lintasan ---------- */
function oldBuildOutput(text, reps) {
  let out = text;
  for (let i = reps.length - 1; i >= 0; i--) {
    out = out.slice(0, reps[i].start) + reps[i].replacement + out.slice(reps[i].end);
  }
  return out;
}
function newJoin(text, reps) {
  const parts = [];
  let pos = 0;
  for (const r of reps) { parts.push(text.slice(pos, r.start), r.replacement); pos = r.end; }
  parts.push(text.slice(pos));
  return parts.join('');
}
{
  // 20 kasus acak: join satu lintasan harus sama persis dengan slice mundur.
  let seed = 42;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let allOk = true;
  for (let t = 0; t < 20; t++) {
    const len = 200 + rnd(800);
    let text = '';
    for (let i = 0; i < len; i++) text += String.fromCharCode(97 + rnd(26));
    const reps = [];
    let pos = 0;
    const nReps = rnd(30);
    for (let k = 0; k < nReps; k++) {
      const start = pos + rnd(20);
      const end = Math.min(start + 1 + rnd(10), len);
      if (start >= len) break;
      reps.push({ start, end, replacement: 'R' + k + '_' + 'x'.repeat(rnd(5)) });
      pos = end;
    }
    if (oldBuildOutput(text, reps) !== newJoin(text, reps)) { allOk = false; break; }
  }
  check('A1 join satu lintasan == slice mundur (20 kasus acak)', allOk);
}

/* ---------- fixture kecil Twine 2 (scan nyata) ---------- */
const SMALL_ORIG = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test Game</title></head><body>\n'
  + '<tw-storydata name="Test" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" format="SugarCube" format-version="2.36.1" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="10,10">Hello world. [[Continue|Next]]</tw-passagedata>\n'
  + '<tw-passagedata pid="2" name="Next" tags="" position="20,20">You arrive at a new place. Then go home.</tw-passagedata>\n'
  + '</tw-storydata></body></html>';

// Rekonstruksi daftar penggantian persis seperti buildOutput (untuk
// membandingkan dengan algoritma slice mundur lama).
function collectReps(S) {
  const reps = [];
  for (const seg of S.segments) {
    if (!seg.translatable || seg.skipped) continue;
    if (seg.kind === 'link-target') continue;
    if (seg.kind === 'passage-name') throw new Error('fixture tak boleh punya passage-name (translateNames=false)');
    const tr = S.translations.get(seg.id);
    if (!tr || !tr.text || tr.failed || tr.text === seg.text) continue;
    let rep;
    if (seg.kind === 'js') rep = G.escapeJsString(tr.text, seg.quote || '"');
    else if (seg.kind === 'js-template') rep = G.escapeTemplateText(tr.text);
    else rep = G.encodePassageText(tr.text, S.encodeStyle);
    reps.push({ start: seg.rawStart, end: seg.rawEnd, replacement: rep });
  }
  reps.sort((a, b) => a.start - b.start);
  return reps;
}

async function main() {
  /* ---------- (c) output byte-identik, fixture kecil ---------- */
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(SMALL_ORIG) + '; S.translations = new Map(); S.tm = new Map(); S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false;');
  w.eval('doScan();');
  const S = V342.state;
  const nSegs = S.segments.length;
  check('C0 scan fixture kecil menemukan segmen', nSegs > 0, 'segs=' + nSegs);
  // Terjemahkan semua segmen teks yang ada.
  for (const seg of S.segments) {
    if (!seg.translatable || seg.skipped || seg.kind === 'link-target') continue;
    S.translations.set(seg.id, { text: 'ID: ' + seg.text, via: 'test' });
  }
  const reps = collectReps(S);
  check('C0 fixture punya penggantian untuk diuji', reps.length > 0, 'reps=' + reps.length);
  const expected = oldBuildOutput(S.originalText, reps);
  const built = G.buildOutput();
  check('C1 buildOutput byte-identik dengan algoritma slice lama', built.text === expected, 'replaced=' + built.replaced + ' reps=' + reps.length);
  check('C1 replaced == jumlah reps', built.replaced === reps.length, String(built.replaced));
  check('C1 output berisi terjemahan', built.text.includes('ID: Hello world.') && built.text.includes('ID: You arrive at a new place.'));

  /* ---------- (c) doBuild async: hasil sama, buildInfo akhir sama ---------- */
  const res = await V342.doBuild(false);
  check('C2 doBuild(false) mengembalikan built', !!res && typeof res.text === 'string' && res.replaced === reps.length, 'replaced=' + (res && res.replaced));
  check('C2 S.outputText == hasil build', S.outputText === expected, '');
  check('C2 buildInfo akhir format lama dipertahankan', /^Timpa selesai: \d+ string diganti\. Verifikasi: \d+\/\d+ cek lolos\. \d+ teks bermasalah \(lihat Laporan\)\.$/.test($('buildInfo').textContent), $('buildInfo').textContent);
  const checksOut = G.verifyOutput(S.outputText);
  const rescan = checksOut.find((c) => c.label === 'Jumlah segmen hasil pindai ulang sama');
  check('C2 verifikasi: pindai ulang file hasil jumlah segmen sama', !!rescan && rescan.ok === true, JSON.stringify(checksOut.map((c) => c.label + ':' + c.ok)));
  const qaSync = G.qaAll();
  const qaChunked = await V342.qaAllChunked();
  check('C2 qaAllChunked == qaAll (urutan + isi sama)', JSON.stringify(qaChunked) === JSON.stringify(qaSync), 'sync=' + qaSync.length + ' chunked=' + qaChunked.length);

  /* ---------- state besar 6000 segmen (chunk 1000 -> 6 potong) ---------- */
  let bigText = '';
  const bigSegs = [];
  const bigTrans = new Map();
  {
    let pos = 0;
    for (let i = 0; i < 6000; i++) {
      const chunk = 'Segmen nomor ' + i + ' dengan kalimat contoh. ';
      bigSegs.push({ id: 'b' + i, text: chunk.trim(), translatable: true, skipped: false, passage: 'P1', kind: 'text', rawStart: pos, rawEnd: pos + chunk.length });
      bigTrans.set('b' + i, { text: 'Terjemahan nomor ' + i + ' dengan kalimat contoh.', via: 'test' });
      bigText += chunk;
      pos += chunk.length;
    }
  }
  G._setState({ segments: bigSegs, translations: bigTrans, originalText: bigText, passages: [{ name: 'P1' }], outputText: '', page: 0, origDownloaded: false, needsReupload: false });
  const bigReps = collectReps(S);
  check('C3 state besar: 6000 segmen, 6000 penggantian', bigSegs.length === 6000 && bigReps.length === 6000, 'segs=' + bigSegs.length + ' reps=' + bigReps.length);
  const bigExpected = oldBuildOutput(bigText, bigReps);
  const bigBuilt = G.buildOutput();
  check('C3 buildOutput besar byte-identik dengan algoritma lama', bigBuilt.text === bigExpected && bigBuilt.replaced === 6000, 'replaced=' + bigBuilt.replaced);

  /* ---------- (a) yield ke event loop + (b) progres fase + (d) tombol ---------- */
  check('D0 tombol aktif sebelum build', !$('btnBuild').disabled && !$('btnPreview').disabled);
  // Timer yang dijadwalkan SEBELUM build: dengan kode sync lama ia baru
  // jalan setelah doBuild kembali; dengan build async ia jalan di tengah.
  let firedBeforeDone = false;
  let buildFinished = false;
  w.setTimeout(() => { if (!buildFinished) firedBeforeDone = true; }, 0);
  // Sampling progres tiap 1 ms selama build berjalan.
  const seenPhases = [];
  const sampler = w.setInterval(() => { seenPhases.push($('buildInfo').textContent); }, 1);
  let disabledDuring = null;
  w.setTimeout(() => { disabledDuring = $('btnBuild').disabled && $('btnPreview').disabled; }, 0);
  const p = V342.doBuild(false);
  check('A1 doBuild mengembalikan Promise (async)', !!p && typeof p.then === 'function');
  const resBig = await p;
  buildFinished = true;
  w.clearInterval(sampler);
  check('A1 timer sempat jalan saat build berjalan (event loop tidak diblokir)', firedBeforeDone === true, 'fired=' + firedBeforeDone);
  check('D1 tombol nonaktif selama build', disabledDuring === true, String(disabledDuring));
  check('D1 tombol aktif lagi setelah build', !$('btnBuild').disabled && !$('btnPreview').disabled);
  check('C3 doBuild besar: replaced 6000 + output identik', !!resBig && resBig.replaced === 6000 && S.outputText === bigExpected, 'replaced=' + (resBig && resBig.replaced));
  // Progres: kelima label fase harus muncul di sumber (deterministik) dan
  // sebagian besar teramati saat sampling (runtime).
  const doBuildSrc = html.slice(html.indexOf('async function doBuild'), html.indexOf('async function doBuild') + 4000);
  const labels = [1, 2, 3, 4, 5].map((n) => '(' + n + '/5:');
  check('B1 kelima label fase ada di kode doBuild', labels.every((l) => doBuildSrc.includes(l)), labels.join(','));
  const seenLabels = labels.filter((l) => seenPhases.some((t) => t.includes(l)));
  check('B1 progres fase teramati saat build berjalan (>=4 dari 5)', seenLabels.length >= 4, 'teramati: ' + seenLabels.join(',') + ' | sampel: ' + seenPhases.length);
  check('B1 buildInfo akhir setelah build besar format lama', /^Timpa selesai: 6000 string diganti\. Verifikasi: \d+\/\d+ cek lolos\. \d+ teks bermasalah \(lihat Laporan\)\./.test($('buildInfo').textContent), $('buildInfo').textContent);

  /* ---------- (d) build ganda ditolak, early return, error ---------- */
  const p1 = V342.doBuild(false);
  const r2 = await V342.doBuild(false);
  check('D2 build kedua saat berjalan ditolak (null)', r2 === null);
  await p1;
  check('D2 tombol aktif lagi setelah build ganda', !$('btnBuild').disabled && !$('btnPreview').disabled);
  G._setState({ fileName: '' });
  const r3 = await V342.doBuild(false);
  check('D2 early return (belum ada file) -> null + tombol tetap aktif', r3 === null && !$('btnBuild').disabled && !$('btnPreview').disabled);
  G._setState({ fileName: 'test.html' });
  // Confirm dibatalkan (translateNames aktif): build batal, tombol aktif lagi.
  const origConfirm = w.confirm;
  w.confirm = () => false;
  G._setState({ translateNames: true });
  const r4 = await V342.doBuild(false);
  check('D2 confirm dibatalkan -> null + tombol aktif lagi', r4 === null && !$('btnBuild').disabled && !$('btnPreview').disabled);
  w.confirm = origConfirm;
  G._setState({ translateNames: false });
  // Error di tengah build (segments rusak): null + tombol aktif lagi.
  const savedSegs = S.segments;
  G._setState({ segments: null });
  const r5 = await V342.doBuild(false);
  check('D2 error di tengah build -> null + tombol aktif lagi', r5 === null && !$('btnBuild').disabled && !$('btnPreview').disabled);
  check('D2 error dicatat di Log', ($('logBox').textContent || '').includes('Timpa gagal'), '');
  G._setState({ segments: savedSegs });
}

main().then(() => {
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.log('ERROR main: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
