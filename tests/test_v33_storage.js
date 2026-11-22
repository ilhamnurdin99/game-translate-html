/* Test v3.3 — Simpanan proyek IndexedDB + migrasi + fallback.
   Jalankan: node test_v33_storage.js [path/index.html]
   Memuat index.html di jsdom (acorn + kode app ikut jalan). IndexedDB
   tidak ada di jsdom, jadi dua mode diuji:
   (A) dengan IndexedDB palsu (in-memory) via beforeParse: round-trip
       proyek besar, migrasi dari localStorage (langsung + saat init),
       proyek lama v3.1 berisi key varDecisions/varSkipped;
   (B) tanpa IndexedDB: fallback ke localStorage (slim + peringatan)
       dan baca proyek localStorage lama.
   Kriteria: semua PASS, 0 FAIL. */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/game-translate-merged/tests/node_modules/jsdom');
const htmlPath = process.argv[2] || '/home/hatch/workspace/game-translate-html-gh/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const seedPath = '/home/hatch/workspace/user/files/index.html';
const seed = fs.readFileSync(seedPath, 'utf8');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 80));

/* IndexedDB palsu minimal (in-memory): open/db/transaction/objectStore
   dengan request onsuccess/onerror async seperti aslinya. */
function createFakeIDB() {
  const dbs = new Map(); // name -> { stores: Map(name -> Map) }
  return {
    open(name) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      setTimeout(() => {
        let entry = dbs.get(name);
        const isNew = !entry;
        if (isNew) { entry = { stores: new Map() }; dbs.set(name, entry); }
        const db = {
          objectStoreNames: { contains(n) { return entry.stores.has(n); } },
          createObjectStore(n) { if (!entry.stores.has(n)) entry.stores.set(n, new Map()); },
          transaction(storeName) {
            const map = entry.stores.get(storeName);
            const mkReq = (val) => {
              const r = { result: val, error: null, onsuccess: null, onerror: null };
              setTimeout(() => { if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
              return r;
            };
            return {
              objectStore() {
                return {
                  put(value, key) { map.set(key, value); return mkReq(undefined); },
                  get(key) { return mkReq(map.has(key) ? map.get(key) : undefined); },
                  delete(key) { map.delete(key); return mkReq(undefined); },
                };
              },
            };
          },
        };
        req.result = db;
        if (isNew && req.onupgradeneeded) req.onupgradeneeded({ target: req });
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 0);
      return req;
    },
  };
}

function loadDom(withIDB, seedLS) {
  return new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(window) {
      if (withIDB) window.indexedDB = createFakeIDB();
      if (seedLS) window.localStorage.setItem('gthtml_v1', JSON.stringify(seedLS));
    },
  });
}

function setSeedshipState(w, fileName) {
  const scan = w.scanFile(seed, { includeScript: false, translateNames: false });
  const translations = new Map();
  if (scan.segments.length > 0) translations.set(scan.segments[0].id, { text: 'Terjemahan dummy.', failed: false });
  w.GTHTML._setState({
    fileName: fileName || 'Seedship.html',
    fileHash: 'seedship-test-hash',
    originalText: seed,
    segments: scan.segments,
    passages: scan.passages,
    translations,
    glossary: [],
    skipPassages: new Set(['Damage system']),
    includeScript: false,
    translateNames: false,
    engine: scan.engine || null,
    encodeStyle: scan.encodeStyle || { quote: false, apos: false, nbsp: false },
    needsReupload: true,
  });
  return scan;
}

(async () => {
  /* ============ (A) IndexedDB palsu ============ */
  const domA = loadDom(true, null);
  const wA = domA.window;
  const V33 = wA.__GTHTML_V33__;
  check('A0 hook v3.3 tersedia', !!V33 && typeof V33.saveProject === 'function' && typeof V33.loadSavedProject === 'function'
    && typeof V33.idbSave === 'function' && typeof V33.idbLoad === 'function' && typeof V33.migrateFromLocalStorage === 'function');
  check('A0 idbAvailable() true dengan IndexedDB palsu', V33.idbAvailable() === true);
  check('A0 label versi v3.4.3', html.includes('Game Translate HTML v3.4.3') && !html.includes('Game Translate HTML v3.4.2'));
  check('A0 Cara pakai menyebut IndexedDB v3.3', html.includes('IndexedDB (v3.3)'));

  // (a) Round-trip proyek besar (Seedship ~1 MB)
  const scanA = setSeedshipState(wA, 'Seedship.html');
  check('A1 pindai Seedship 1.194 segmen (v3.4.3)', scanA.segments.length === 1194, 'dapat: ' + scanA.segments.length);
  V33.saveProject();
  await tick(200);
  check('A1 needsReupload false setelah simpan IndexedDB', wA.GTHTML._state.needsReupload === false);
  check('A1 localStorage gthtml_v1 TIDAK ditulis', wA.localStorage.getItem('gthtml_v1') === null);
  const loadedA = await V33.loadSavedProject();
  check('A1 load kembali proyek', !!loadedA && loadedA.fileName === 'Seedship.html', loadedA && loadedA.fileName);
  check('A1 originalText kembali utuh (~1 MB)', !!loadedA && loadedA.originalText === seed, loadedA ? ('panjang: ' + (loadedA.originalText || '').length) : 'null');
  check('A1 segmen kembali 1.194', !!loadedA && loadedA.segments.length === 1194, loadedA && loadedA.segments.length);
  check('A1 terjemahan + skipPassages kembali', !!loadedA && loadedA.translations.length === 1 && loadedA.skipPassages.includes('Damage system'), loadedA && JSON.stringify(loadedA.skipPassages));

  // (b) Migrasi langsung dari localStorage
  const slim = {
    v: 1, fileName: 'Afterimage-Prologue.html', fileHash: 'afterimage-test',
    originalText: '', segments: [{ id: 's1', text: 'Hello world.', kind: 'text', passage: 'Start', rawStart: 0, rawEnd: 12 }],
    passages: ['Start'], translations: [['s1', { text: 'Halo dunia.', failed: false }]],
    glossary: [], skipPassages: [], includeScript: false, translateNames: false,
    engine: null, encodeStyle: { quote: false, apos: false, nbsp: false }, ts: Date.now(),
  };
  wA.localStorage.setItem('gthtml_v1', JSON.stringify(slim));
  const migrated = await V33.migrateFromLocalStorage();
  check('B-migrasi langsung: proyek slim pindah', !!migrated && migrated.fileName === 'Afterimage-Prologue.html', migrated && migrated.fileName);
  check('B-migrasi langsung: key localStorage terhapus', wA.localStorage.getItem('gthtml_v1') === null);
  const afterMig = await V33.loadSavedProject();
  check('B-migrasi langsung: load baca dari IndexedDB', !!afterMig && afterMig.fileName === 'Afterimage-Prologue.html', afterMig && afterMig.fileName);
  // Kembalikan state Seedship supaya tidak mengganggu uji berikut
  setSeedshipState(wA, 'Seedship.html');
  V33.saveProject();
  await tick(200);

  // (b2) Migrasi otomatis saat init: localStorage sudah berisi proyek
  // SEBELUM app dimuat (via beforeParse) — banner harus muncul.
  const domM = loadDom(true, slim);
  const wM = domM.window;
  await tick(300);
  check('B-migrasi init: key localStorage terhapus', wM.localStorage.getItem('gthtml_v1') === null);
  check('B-migrasi init: banner proyek tersimpan tampil', !wM.document.getElementById('savedBanner').classList.contains('hidden'));
  check('B-migrasi init: banner menyebut nama file', wM.document.getElementById('savedInfo').textContent.includes('Afterimage-Prologue.html'), wM.document.getElementById('savedInfo').textContent);
  const loadedM = await wM.__GTHTML_V33__.loadSavedProject();
  check('B-migrasi init: proyek bisa dimuat dari IndexedDB', !!loadedM && loadedM.fileName === 'Afterimage-Prologue.html');

  // (d) Proyek lama v3.1 (berisi key varDecisions/varSkipped) tetap bisa dibuka
  const legacy = {
    v: 1, fileName: 'Seedship.html', fileHash: 'legacy-hash', originalText: seed,
    segments: scanA.segments.slice(0, 5), passages: ['Start'],
    translations: [], glossary: [], skipPassages: [],
    varDecisions: { 'Move on': 'translate' }, varSkipped: ['Rich'],
    includeScript: false, translateNames: false, engine: null,
    encodeStyle: { quote: false, apos: false, nbsp: false }, ts: Date.now(),
  };
  let legacyOk = false;
  try {
    await V33.idbSave(legacy);
    await tick(120);
    const d = await V33.loadSavedProject();
    V33.restoreProject(d);
    legacyOk = wA.GTHTML._state.fileName === 'Seedship.html' && wA.GTHTML._state.segments.length === 5;
  } catch (e) { legacyOk = false; }
  check('D proyek lama v3.1 (varDecisions/varSkipped) bisa dibuka', legacyOk);

  // Hapus simpanan via idbDelete
  await V33.idbDelete();
  await tick(120);
  check('A2 idbDelete: load sesudah hapus = null', (await V33.loadSavedProject()) === null);

  /* ============ (B) Tanpa IndexedDB = fallback localStorage ============ */
  const domB = loadDom(false, null);
  const wB = domB.window;
  const V33B = wB.__GTHTML_V33__;
  check('B0 idbAvailable() false tanpa IndexedDB', V33B.idbAvailable() === false);
  check('B0 hook v3.3 tetap tersedia tanpa IndexedDB', !!V33B && typeof V33B.saveProject === 'function');

  // (c) Fallback: localStorage penuh (setItem yang besar dilempar).
  // Catatan: patch harus di Storage.prototype — assignment langsung ke
  // w.localStorage.setItem tidak menempel di objek Storage jsdom.
  setSeedshipState(wB, 'Seedship.html');
  const origProtoSet = wB.Storage.prototype.setItem;
  wB.Storage.prototype.setItem = function (k, v) {
    if (k === 'gthtml_v1' && String(v).length > 500000) {
      const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
    }
    return origProtoSet.call(this, k, v);
  };
  let noThrow = true;
  try { V33B.saveProject(); } catch (e) { noThrow = false; }
  await tick(100);
  check('C fallback: saveProject tidak throw saat kuota penuh', noThrow);
  const slimSaved = JSON.parse(wB.localStorage.getItem('gthtml_v1') || 'null');
  check('C fallback: simpanan slim tersimpan di localStorage', !!slimSaved && slimSaved.fileName === 'Seedship.html');
  check('C fallback: slim tanpa originalText', !!slimSaved && slimSaved.originalText === '');
  check('C fallback: needsReupload = true', wB.GTHTML._state.needsReupload === true);
  check('C fallback: log peringatan localStorage penuh', (wB.document.getElementById('logBox').textContent || '').includes('localStorage penuh'));
  check('C fallback: segmen tetap tersimpan di slim (1.194)', !!slimSaved && slimSaved.segments.length === 1194, slimSaved && slimSaved.segments.length);
  wB.Storage.prototype.setItem = origProtoSet;

  // (B2) Tanpa IndexedDB, file kecil tersimpan penuh di localStorage dan bisa dimuat
  const domC = loadDom(false, null);
  const wC = domC.window;
  const V33C = wC.__GTHTML_V33__;
  wC.GTHTML._setState({
    fileName: 'Kecil.html', fileHash: 'kecil', originalText: '<html><body>Hello.</body></html>',
    segments: [{ id: 's1', text: 'Hello.', kind: 'text', passage: 'Start', rawStart: 0, rawEnd: 6 }],
    passages: ['Start'], translations: [], glossary: [], skipPassages: new Set(),
    includeScript: false, translateNames: false, engine: null,
    encodeStyle: { quote: false, apos: false, nbsp: false }, needsReupload: true,
  });
  V33C.saveProject();
  await tick(100);
  const loadedC = await V33C.loadSavedProject();
  check('B2 tanpa IndexedDB: proyek kecil tersimpan + dimuat dari localStorage', !!loadedC && loadedC.originalText === '<html><body>Hello.</body></html>' && loadedC.fileName === 'Kecil.html');
  check('B2 tanpa IndexedDB: needsReupload false', wC.GTHTML._state.needsReupload === false);

  console.log('\nV33_STORAGE: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR: ' + (e && e.stack || e)); process.exit(1); });
