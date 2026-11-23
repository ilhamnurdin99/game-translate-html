/* Test v3.4.3 — Perluasan perlindungan variabel (butir 3 checklist).
   Jalankan: node test_v343_vars.js [path/index.html]
   Memuat index.html di jsdom, lalu menguji:
   (a) PLACEHOLDER_RE melindungi _var, $Var.properti, $Var[...] menempel;
   (b) kasus tepi: $Money. akhir kalimat, some_var, hook Harlowe [...],
       $var[$other], $var + [hook] terpisah;
   (c) getMissingVars mendeteksi $Var/_var yang hilang/tambah;
   (d) validateOne menolak terjemahan yang kehilangan variabel;
   (e) round-trip prepareForTranslate/restoreTranslated (termasuk
       placeholder yang dikecilkan hurufnya oleh mesin).
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

check('A0 hook v3.4.3 tersedia', !!V343 && typeof V343.protectPlaceholders === 'function' && typeof V343.getMissingVars === 'function' && typeof V343.parseLinkToken === 'function' && typeof V343.validateOne === 'function');
check('A0 label versi v3.4.11', html.includes('Game Translate HTML v3.4.11') && !html.includes('Game Translate HTML v3.4.10'));
check('A0 Cara pakai menyebut v3.4.3', html.includes('Variabel &amp; tautan lebih aman (v3.4.3)'));
w.eval('S.glossary = [];');

const send = (t) => V343.protectPlaceholders(t).text;

/* ---------- (a) $Var: semua contoh Ilham tetap dilindungi ---------- */
check('A1 $Player/$Money/$Minutes', send('$Player has $Money and $Minutes.') === '{{{GT0}}} has {{{GT1}}} and {{{GT2}}}.', send('$Player has $Money and $Minutes.'));
check('A1 $Energy/$Hunger/$Hygiene/$Fun', send('Energy $Energy, Hunger $Hunger, Hygiene $Hygiene, Fun $Fun.') === 'Energy {{{GT0}}}, Hunger {{{GT1}}}, Hygiene {{{GT2}}}, Fun {{{GT3}}}.');
check('A1 $Day/$Breakfast/$Dinner/$ExerciseType', send('Day $Day, breakfast $Breakfast, dinner $Dinner, exercise $ExerciseType.') === 'Day {{{GT0}}}, breakfast {{{GT1}}}, dinner {{{GT2}}}, exercise {{{GT3}}}.');
check('A1 $ActiveQuests/$CompletedQuests', send('Quests $ActiveQuests done $CompletedQuests.') === 'Quests {{{GT0}}} done {{{GT1}}}.');
check('A1 $BadDream/$GoodDream/$Cold/$Hot', send('Dreams $BadDream $GoodDream, cold $Cold hot $Hot.') === 'Dreams {{{GT0}}} {{{GT1}}}, cold {{{GT2}}} hot {{{GT3}}}.');
check('A1 pakaian beda karakter $IlhamTop/$LionTop/$DikiSocial', send('Wearing $IlhamTop, $LionTop and $DikiSocial.') === 'Wearing {{{GT0}}}, {{{GT1}}} and {{{GT2}}}.', send('Wearing $IlhamTop, $LionTop and $DikiSocial.'));
check('A1 $AthleticsSkill/$EnglishSkill/$MathSkill + XP', send('Skills $AthleticsSkill, $EnglishSkill, $MathSkill; XP $AthleticsXP, $EnglishXP, $HistoryXP.') === 'Skills {{{GT0}}}, {{{GT1}}}, {{{GT2}}}; XP {{{GT3}}}, {{{GT4}}}, {{{GT5}}}.');
check('A1 {name} dan %d tetap dilindungi', send('Hello {name}, you scored %d points.') === 'Hello {{{GT0}}}, you scored {{{GT1}}} points.');
check('A1 {{{...}}} tetap dilindungi', send('The variable {{{$name}}} is set.') === 'The variable {{{GT0}}} is set.');

/* ---------- (a) _var, .properti, [...] menempel ---------- */
check('A2 _randomRoll/_ad/_player/_outfit dilindungi', send('Roll _randomRoll, ad _ad, player _player, outfit _outfit.') === 'Roll {{{GT0}}}, ad {{{GT1}}}, player {{{GT2}}}, outfit {{{GT3}}}.', send('Roll _randomRoll, ad _ad, player _player, outfit _outfit.'));
check('A2 $Player.name satu slot', send('$Player.name went home.') === '{{{GT0}}} went home.', send('$Player.name went home.'));
check('A2 $Player.HairColorNew satu slot', send('Set $Player.HairColorNew to "Brown".') === 'Set {{{GT0}}} to "Brown".', send('Set $Player.HairColorNew to "Brown".'));
check('A2 $items[0] dan $items["key"] satu slot', send('You carry $items[0] and $items["key"].') === 'You carry {{{GT0}}} and {{{GT1}}}.', send('You carry $items[0] and $items["key"].'));
check('A2 $var[$other] satu slot', send('Take $items[$other] now.') === 'Take {{{GT0}}} now.', send('Take $items[$other] now.'));

/* ---------- (b) kasus tepi ---------- */
check('B1 $Money. akhir kalimat: titik tidak ditelan', send('You have $Money. Next sentence.') === 'You have {{{GT0}}}. Next sentence.', send('You have $Money. Next sentence.'));
check('B1 some_var tidak kena', send('some_var and another_one here.') === 'some_var and another_one here.');
check('B1 hook Harlowe [...] bebas tidak dilindungi', send('(if: $x)[Teks ini harus diterjemahkan]') === '(if: {{{GT0}}})[Teks ini harus diterjemahkan]', send('(if: $x)[Teks ini harus diterjemahkan]'));
check('B1 $var + [hook] terpisah: hook tidak ditelan', send('You have $Money [in brackets].') === 'You have {{{GT0}}} [in brackets].', send('You have $Money [in brackets].'));
check('B1 $Money di akhir teks tanpa titik', send('Total: $Money') === 'Total: {{{GT0}}}');

/* ---------- (c) getMissingVars ---------- */
const gmv = V343.getMissingVars;
check('C1 $Money hilang terdeteksi', JSON.stringify(gmv('You have $Money.', 'Kamu punya.')) === JSON.stringify(['$Money']), JSON.stringify(gmv('You have $Money.', 'Kamu punya.')));
check('C1 _randomRoll hilang terdeteksi', JSON.stringify(gmv('Roll _randomRoll.', 'Lempar.')) === JSON.stringify(['_randomRoll']));
check('C1 $Player.name hilang terdeteksi', JSON.stringify(gmv('$Player.name is here.', 'Ada di sini.')) === JSON.stringify(['$Player.name']));
check('C1 $Player.nama tidak memenuhi $Player.name', JSON.stringify(gmv('$Player.name is here.', 'Ada $Player.nama.')) === JSON.stringify(['$Player.name']), JSON.stringify(gmv('$Player.name is here.', 'Ada $Player.nama.')));
check('C1 $items[0] hilang terdeteksi', JSON.stringify(gmv('$items[0] ready.', 'Siap.')) === JSON.stringify(['$items[0]']));
check('C1 tidak ada yang hilang -> []', JSON.stringify(gmv('You have $Money.', 'Kamu punya $Money.')) === '[]');
check('C1 arah tambah: $Minutes di terjemahan saja', JSON.stringify(gmv('You have $Money and $Minutes.', 'Kamu punya $Money.')) === JSON.stringify(['$Minutes']));
check('C1 {name} hilang tetap terdeteksi', JSON.stringify(gmv('Hello {name}.', 'Halo.')) === JSON.stringify(['{name}']));

/* ---------- (d) validateOne ---------- */
const val = V343.validateOne;
check('D1 terjemahan kehilangan $Money ditolak', val('Kamu punya.', 'You have $Money.') === 'variabel hilang', String(val('Kamu punya.', 'You have $Money.')));
check('D1 terjemahan kehilangan _ad ditolak', val('Iklan.', 'Ad _ad here.') === 'variabel hilang', String(val('Iklan.', 'Ad _ad here.')));
check('D1 $Player.nama pengganti $Player.name ditolak', val('Ada $Player.nama.', '$Player.name is here.') === 'variabel hilang', String(val('Ada $Player.nama.', '$Player.name is here.')));
check('D1 terjemahan utuh $Money diterima', val('Kamu punya $Money.', 'You have $Money.') === null, String(val('Kamu punya $Money.', 'You have $Money.')));
check('D1 terjemahan utuh _randomRoll diterima', val('Lempar _randomRoll.', 'Roll _randomRoll.') === null, String(val('Lempar _randomRoll.', 'Roll _randomRoll.')));

/* ---------- (e) round-trip prepare/restore ---------- */
{
  const orig = 'You have $Money and _ad, $Player.name is ready.';
  const prep = G.prepareForTranslate(orig);
  check('E1 send melindungi semua pola baru', prep.send === 'You have {{{GT0}}} and {{{GT1}}}, {{{GT2}}} is ready.', prep.send);
  check('E1 restore mengembalikan asli', G.restoreTranslated(prep.send, prep, orig) === orig, G.restoreTranslated(prep.send, prep, orig));
  // Mesin mengecilkan huruf placeholder (kasus v3.4) — tetap pulih.
  const lowered = prep.send.toLowerCase();
  check('E1 restore tahan placeholder huruf kecil', G.restoreTranslated(lowered, prep, orig) === 'you have $Money and _ad, $Player.name is ready.', G.restoreTranslated(lowered, prep, orig));
}

console.log('\nV343_VARS: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
