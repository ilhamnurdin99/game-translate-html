/* Test v3.4.3 — Perluasan tautan & navigasi + pesan blokir Timpa (butir 4).
   Jalankan: node test_v343_links_ux.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) parseLinkToken memisahkan setter [[...][setter]];
   (b) fixture bentuk A-D + 12 contoh Ilham: label diterjemahkan, tujuan
       dan setter tidak pernah jadi segmen;
   (c) kasus tepi: <<link>> satu argumen tanpa badan, dua <<link>>
       berurutan, <<button>> ber-badan/tanpa badan, <<option>> satu argumen;
   (d) macro custom + kondisi (macro tidak bocor);
   (e) verifyOutput menghitung tautan setter;
   (f) doBuild yang ditolak menampilkan pesan di #buildInfo.
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
const V343 = w.__GTHTML_V343__;
const $ = (id) => w.document.getElementById(id);

check('A0 hook v3.4.3 tersedia', !!V343 && typeof V343.parseLinkToken === 'function' && typeof V343.hasLinkBody === 'function' && typeof V343.doBuild === 'function');
check('A0 label versi v3.4.16', html.includes('Game Translate HTML v3.4.16') && !html.includes('Game Translate HTML v3.4.13'));

function setupState(fix) {
  w.eval('S.fileName = "test.html"; S.originalText = ' + JSON.stringify(fix) + '; S.translations = new Map(); S.tm = new Map(); S.glossary = []; S.skipPassages = new Set(); S.outputText = ""; S.page = 0; S.selected = new Set(); S.stats = { totalMs: 0, doneCount: 0, recent: [] }; S.translateNames = false; S.includeScript = false; S.origDownloaded = false; S.needsReupload = false;');
  w.eval('doScan();');
  return V343.state;
}
const texts = (S) => S.segments.map((s) => s.text);
const has = (S, t) => texts(S).includes(t);
const leaked = (S, words) => S.segments.filter((s) => words.some((b) => s.text.includes(b)));
function translateAll(S) {
  for (const seg of S.segments) {
    if (!seg.translatable || seg.skipped || seg.kind === 'link-target') continue;
    S.translations.set(seg.id, { text: 'ID: ' + seg.text, via: 'test' });
  }
}

/* ---------- (a) parseLinkToken ---------- */
{
  const p1 = V343.parseLinkToken('Continue|Beach');
  check('A1 parseLinkToken biasa', p1.label === 'Continue' && p1.target === 'Beach' && p1.setter === null, JSON.stringify(p1));
  const p2 = V343.parseLinkToken('Food District (0:10)|Food District][$Minutes += $TravelTime');
  check('A1 parseLinkToken setter', p2.label === 'Food District (0:10)' && p2.target === 'Food District' && p2.setter === '$Minutes += $TravelTime', JSON.stringify(p2));
  const p3 = V343.parseLinkToken('Brown|Hair Dyed][$Player.HairColorNew to "Brown"');
  check('A1 parseLinkToken setter berisi kutip', p3.label === 'Brown' && p3.target === 'Hair Dyed' && p3.setter === '$Player.HairColorNew to "Brown"', JSON.stringify(p3));
  const p4 = V343.parseLinkToken('Beach');
  check('A1 parseLinkToken tanpa label', p4.label === null && p4.target === 'Beach' && p4.setter === null, JSON.stringify(p4));
  const p5 = V343.parseLinkToken('Go to the #random channel->random');
  check('A1 parseLinkToken panah ->', p5.label === 'Go to the #random channel' && p5.target === 'random' && p5.setter === null, JSON.stringify(p5));
  const p6 = V343.parseLinkToken('Confirm ($8 0:10)|Shopping District Hair Salon][$Player.HairColor to $Player.HairColorNew;$Money -= 8;$Minutes += 10');
  check('A1 parseLinkToken setter tiga perintah', p6.label === 'Confirm ($8 0:10)' && p6.target === 'Shopping District Hair Salon' && p6.setter === '$Player.HairColor to $Player.HairColorNew;$Money -= 8;$Minutes += 10', JSON.stringify(p6));
}

/* ---------- (b) fixture bentuk A-D ---------- */
const FIX_AD = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
  + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
  + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">'
  + '[[Continue|Beach]]\n[[Beach]]\n[[Back|Journal]]\n'
  + '&lt;&lt;link "Keep walking"&gt;&gt;\n&lt;&lt;set $Steps += 1&gt;&gt;\n&lt;&lt;/link&gt;&gt;\n'
  + '&lt;&lt;goto "Beach"&gt;&gt;\n'
  + '[[Food District (0:10)|Food District][$Minutes += $TravelTime]]\n'
  + '&lt;&lt;if $Money &gt;= 10&gt;&gt;\n[[Buy Item|Shop]]\n&lt;&lt;else&gt;&gt;\n[[Go Back|Home]]\n&lt;&lt;/if&gt;&gt;\n'
  + '</tw-passagedata>\n'
  + '</tw-storydata></body></html>';
async function main() {
  let S = setupState(FIX_AD);
  check('B1 A: label Continue/Back jadi segmen', has(S, 'Continue') && has(S, 'Back'), JSON.stringify(texts(S)));
  check('B1 A: [[Beach]] tanpa segmen (label = tujuan)', !S.segments.some((s) => s.text === 'Beach'));
  check('B1 B: label <<link>> ber-badan kini jadi segmen', has(S, 'Keep walking'), JSON.stringify(texts(S)));
  check('B1 B: <<goto "Beach">> tanpa segmen', !S.segments.some((s) => s.text.includes('Beach')), JSON.stringify(texts(S)));
  check('B1 C: tautan setter hanya labelnya yang jadi segmen', has(S, 'Food District (0:10)') && !S.segments.some((s) => s.text.includes('[[')), JSON.stringify(texts(S)));
  check('B1 C: setter tidak bocor ke segmen', leaked(S, ['$Minutes', '$TravelTime', '+=']).length === 0, JSON.stringify(leaked(S, ['$Minutes', '$TravelTime', '+=']).map((s) => s.text)));
  check('B1 D: label cabang Buy Item/Go Back jadi segmen', has(S, 'Buy Item') && has(S, 'Go Back'));
  check('B1 jumlah segmen A-D = 6', S.segments.length === 6, 'segs=' + S.segments.length + ' ' + JSON.stringify(texts(S)));
  translateAll(S);
  const builtAD = G.buildOutput();
  check('B2 A-D: setter utuh di file hasil', builtAD.text.includes('][$Minutes += $TravelTime]]'), '');
  check('B2 A-D: label setter diterjemahkan, target tetap', builtAD.text.includes('[[ID: Food District (0:10)|Food District][$Minutes += $TravelTime]]'), '');
  check('B2 A-D: label <<link>> diterjemahkan di file hasil', builtAD.text.includes('&lt;&lt;link "ID: Keep walking"&gt;&gt;'), '');
  check('B2 A-D: target biasa tetap', builtAD.text.includes('[[ID: Continue|Beach]]') && builtAD.text.includes('[[Beach]]') && builtAD.text.includes('[[ID: Back|Journal]]'), '');
  const checksAD = G.verifyOutput(builtAD.text);
  const linkAD = checksAD.find((c) => c.label.indexOf('Link [[...]]') === 0);
  check('B2 A-D: verifikasi menghitung 6 tautan (termasuk setter)', !!linkAD && linkAD.ok && linkAD.label.indexOf('(6)') >= 0, JSON.stringify(checksAD.map((c) => c.label + ':' + c.ok)));
  check('B2 A-D: pindai ulang jumlah segmen sama', checksAD.some((c) => c.label === 'Jumlah segmen hasil pindai ulang sama' && c.ok));

  /* ---------- (b) 12 contoh Ilham ---------- */
  const FIX_12 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Beach" tags="" position="100,100" size="100,100">'
    + '[[Hang Out (0:30)|Beach Hang Out]]\n'
    + '[[Go Jogging (0:30)|Beach Jogging]]\n'
    + '[[($1) Get Something to Eat (0:15)|Beach Food]]\n'
    + '[[Food District (0:10)|Food District][$Minutes += $TravelTime]]\n'
    + '</tw-passagedata>\n'
    + '<tw-passagedata pid="2" name="Hair Dyed" tags="" position="200,100" size="100,100">'
    + '[[Brown|Hair Dyed][$Player.HairColorNew to "Brown"]]\n'
    + '[[Confirm ($8 0:10)|Shopping District Hair Salon][$Player.HairColor to $Player.HairColorNew;$Money -= 8;$Minutes += 10]]\n'
    + '</tw-passagedata>\n'
    + '<tw-passagedata pid="3" name="Walk" tags="" position="300,100" size="100,100">'
    + '&lt;&lt;link "Keep walking"&gt;&gt;\n&lt;&lt;set $Steps += 1&gt;&gt;\n&lt;&lt;/link&gt;&gt;\n'
    + '&lt;&lt;link "Build a sandcastle"&gt;&gt;\n&lt;&lt;set $Steps += 1&gt;&gt;\n&lt;&lt;/link&gt;&gt;\n'
    + '&lt;&lt;linkreplace "Continue"&gt;&gt;You continued walking.&lt;&lt;/linkreplace&gt;&gt;\n'
    + '&lt;&lt;goto "Player Bedroom"&gt;&gt;\n'
    + '&lt;&lt;goto _event&gt;&gt;\n'
    + '&lt;&lt;back&gt;&gt;\n'
    + '</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  S = setupState(FIX_12);
  check('B3 Ex 1-3: label jadi segmen', has(S, 'Hang Out (0:30)') && has(S, 'Go Jogging (0:30)') && has(S, '($1) Get Something to Eat (0:15)'), JSON.stringify(texts(S)));
  check('B3 Ex 4-6: label setter jadi segmen, bukan utuh', has(S, 'Food District (0:10)') && has(S, 'Brown') && has(S, 'Confirm ($8 0:10)'), JSON.stringify(texts(S)));
  check('B3 Ex 4-6: tujuan + setter tidak bocor', leaked(S, ['Hair Dyed', 'Shopping District', '$Money -= 8', '$Minutes += 10', 'HairColor']).length === 0, JSON.stringify(leaked(S, ['Hair Dyed', 'Shopping District', '$Money -= 8', '$Minutes += 10', 'HairColor']).map((s) => s.text)));
  check('B3 Ex 7-8: label <<link>> jadi segmen', has(S, 'Keep walking') && has(S, 'Build a sandcastle'), JSON.stringify(texts(S)));
  check('B3 Ex 9: label + badan linkreplace jadi segmen', has(S, 'Continue') && has(S, 'You continued walking.'), JSON.stringify(texts(S)));
  check('B3 Ex 10-12: goto/back tanpa segmen', !S.segments.some((s) => s.text.includes('Player Bedroom') || s.text.includes('_event')), JSON.stringify(texts(S)));
  check('B3 jumlah segmen 12 contoh = 10', S.segments.length === 10, 'segs=' + S.segments.length + ' ' + JSON.stringify(texts(S)));
  translateAll(S);
  const built12 = G.buildOutput();
  check('B4 Ex 1: label diterjemahkan, target tetap', built12.text.includes('[[ID: Hang Out (0:30)|Beach Hang Out]]'), '');
  check('B4 Ex 5: setter "Brown" utuh (nilai sistem)', built12.text.includes('[[ID: Brown|Hair Dyed][$Player.HairColorNew to "Brown"]]'), '');
  check('B4 Ex 6: setter tiga perintah utuh', built12.text.includes('][$Player.HairColor to $Player.HairColorNew;$Money -= 8;$Minutes += 10]]'), '');
  check('B4 Ex 7-8: label link diterjemahkan', built12.text.includes('&lt;&lt;link "ID: Keep walking"&gt;&gt;') && built12.text.includes('&lt;&lt;link "ID: Build a sandcastle"&gt;&gt;'), '');
  check('B4 Ex 10-11: goto utuh', built12.text.includes('&lt;&lt;goto "Player Bedroom"&gt;&gt;') && built12.text.includes('&lt;&lt;goto _event&gt;&gt;'), '');
  const checks12 = G.verifyOutput(built12.text);
  const link12 = checks12.find((c) => c.label.indexOf('Link [[...]]') === 0);
  check('B4 verifikasi menghitung 6 tautan (termasuk 3 setter)', !!link12 && link12.ok && link12.label.indexOf('(6)') >= 0, JSON.stringify(checks12.map((c) => c.label + ':' + c.ok)));
  check('B4 pindai ulang jumlah segmen sama', checks12.some((c) => c.label === 'Jumlah segmen hasil pindai ulang sama' && c.ok));

  /* ---------- (c) kasus tepi link/button ---------- */
  const FIX_EDGE = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Edge" tags="" position="100,100" size="100,100">'
    + '&lt;&lt;link "PassageName"&gt;&gt;\n'
    + '&lt;&lt;link "PassageA"&gt;&gt;\n'
    + '&lt;&lt;link "LabelB"&gt;&gt;\n&lt;&lt;set $y to 2&gt;&gt;\n&lt;&lt;/link&gt;&gt;\n'
    + '&lt;&lt;button "Press me"&gt;&gt;\n&lt;&lt;set $z to 3&gt;&gt;\n&lt;&lt;/button&gt;&gt;\n'
    + '&lt;&lt;button "SomePassage"&gt;&gt;\n'
    + '&lt;&lt;option "Choice"&gt;&gt;\n'
    + 'Plain text here.\n'
    + '</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  S = setupState(FIX_EDGE);
  check('C1 <<link>> satu argumen tanpa badan: tanpa segmen', !has(S, 'PassageName'), JSON.stringify(texts(S)));
  check('C1 dua <<link>> berurutan: hanya label kedua yang jadi segmen', !has(S, 'PassageA') && has(S, 'LabelB'), JSON.stringify(texts(S)));
  check('C1 <<button>> ber-badan: label jadi segmen', has(S, 'Press me'), JSON.stringify(texts(S)));
  check('C1 <<button>> tanpa badan: tanpa segmen', !has(S, 'SomePassage'), JSON.stringify(texts(S)));
  check('C1 <<option>> satu argumen: perilaku lama (tanpa segmen)', !has(S, 'Choice'), JSON.stringify(texts(S)));
  check('C1 teks biasa tetap jadi segmen', has(S, 'Plain text here.'), JSON.stringify(texts(S)));

  /* ---------- (d) macro custom + kondisi tidak bocor ---------- */
  const FIX_MACRO = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body>\n'
    + '<tw-storydata name="T" startnode="1" creator="Twine" creator-version="2.3.0" ifid="X" zoom="1" format="SugarCube" format-version="2.37.3" options="" hidden>\n'
    + '<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">You have $Money coins.\n'
    + '&lt;&lt;if $Money &gt;= 10&gt;&gt;\nYou can afford it.\n'
    + '&lt;&lt;elseif $Money &lt; 10&gt;&gt;\nToo expensive.\n'
    + '&lt;&lt;else&gt;&gt;\nNo money at all.\n'
    + '&lt;&lt;/if&gt;&gt;\n'
    + '&lt;&lt;set $Money -= 1&gt;&gt;\n'
    + '&lt;&lt;needChange "Hunger" 20&gt;&gt;\n'
    + '&lt;&lt;socialChange "Ilham" -3&gt;&gt;\n'
    + '&lt;&lt;skillPoints "Athletics" 5&gt;&gt;\n'
    + '&lt;&lt;endByLocation "Beach"&gt;&gt;\n'
    + '&lt;&lt;applyOutfit $IlhamTop&gt;&gt;\n'
    + '&lt;&lt;storeClothing "Shirt" 1&gt;&gt;\n'
    + '&lt;&lt;pokeravatar&gt;&gt;\n'
    + 'The end.</tw-passagedata>\n'
    + '</tw-storydata></body></html>';
  S = setupState(FIX_MACRO);
  check('D1 kondisi/macro: hanya teks tampil yang jadi segmen', S.segments.length === 5 && has(S, 'You have $Money coins.') && has(S, 'You can afford it.') && has(S, 'Too expensive.') && has(S, 'No money at all.') && has(S, 'The end.'), JSON.stringify(texts(S)));
  check('D1 macro custom tidak bocor', leaked(S, ['endByLocation', 'applyOutfit', 'storeClothing', 'pokeravatar', 'needChange', 'socialChange', 'skillPoints', 'Hunger', 'Athletics']).length === 0, JSON.stringify(texts(S)));
  translateAll(S);
  const builtM = G.buildOutput();
  check('D1 semua macro utuh di file hasil', ['&lt;&lt;if $Money &gt;= 10&gt;&gt;', '&lt;&lt;elseif $Money &lt; 10&gt;&gt;', '&lt;&lt;else&gt;&gt;', '&lt;&lt;/if&gt;&gt;', '&lt;&lt;set $Money -= 1&gt;&gt;', '&lt;&lt;needChange "Hunger" 20&gt;&gt;', '&lt;&lt;socialChange "Ilham" -3&gt;&gt;', '&lt;&lt;skillPoints "Athletics" 5&gt;&gt;', '&lt;&lt;endByLocation "Beach"&gt;&gt;', '&lt;&lt;applyOutfit $IlhamTop&gt;&gt;', '&lt;&lt;storeClothing "Shirt" 1&gt;&gt;', '&lt;&lt;pokeravatar&gt;&gt;'].every((m) => builtM.text.includes(m)), '');

  /* ---------- (f) pesan blokir Timpa di #buildInfo ---------- */
  G._setState({ fileName: 'test.html', originalText: '', needsReupload: true });
  $('buildInfo').textContent = '';
  let r = await V343.doBuild(false);
  check('F1 proyek tanpa teks asli: doBuild null + pesan di #buildInfo', r === null && ($('buildInfo').textContent || '').includes('upload ulang file yang sama'), 'buildInfo=' + JSON.stringify($('buildInfo').textContent));
  G._setState({ fileName: '', originalText: '', needsReupload: false });
  $('buildInfo').textContent = '';
  r = await V343.doBuild(false);
  check('F1 belum ada file: doBuild null + pesan di #buildInfo', r === null && ($('buildInfo').textContent || '').includes('Upload file dulu'), 'buildInfo=' + JSON.stringify($('buildInfo').textContent));
  G._setState({ fileName: 'test.html' });
}

main().then(() => {
  console.log('\nV343_LINKS_UX: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.log('ERROR main: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
