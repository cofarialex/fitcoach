// Gyakorlat-adatbázis.
// pattern: mozgásminta (ez alapján cserélhetők egymással a gyakorlatok)
// eq: szükséges eszköz. '|' = bármelyik elég, '+' = mindkettő kell. 'none' = eszköz nélkül.
// lvl: 1 = kezdő, 2 = középhaladó, 3 = haladó
// avoid: mely sérülésnél kerülendő (knee, back, shoulder, wrist, elbow, hip)
// ratio: kezdő férfi kiinduló munkasúly a testsúly arányában (kézisúlyzónál 1 db súlyzó)
// unit: 'reps' vagy 'sec' (tartásos gyakorlatoknál)

const E = (key, name, pattern, eq, lvl, avoid, tips, opts = {}) => ({
  key, name, pattern, eq, lvl, avoid, tips,
  compound: !!opts.compound, lower: !!opts.lower, ratio: opts.ratio || null, unit: opts.unit || 'reps',
});

const EXERCISES = [
  // Guggolás jellegű
  E('back_squat', 'Guggolás rúddal', 'squat', 'barbell', 2, ['knee', 'back'],
    'A rúd a csuklyásizmon pihenjen. Törzs feszes, térd a lábujjak irányába mozog, csípő legalább térdmagasságig ereszkedik. A sarkadon keresztül told fel magad.', { compound: true, lower: true, ratio: 0.6 }),
  E('goblet_squat', 'Serleg guggolás', 'squat', 'dumbbell|kettlebell', 1, ['knee'],
    'A súlyzót mellkasod előtt tartsd. Egyenes háttal, mellkast kihúzva ereszkedj, a könyököd a térdeid közé érjen.', { compound: true, lower: true, ratio: 0.15 }),
  E('leg_press', 'Lábtolás gépen', 'squat', 'machine', 1, [],
    'A talp vállszélességben a platform közepén. Ereszkedj, amíg a derekad nem emelkedik el az ülésről, ne nyújtsd ki teljesen (ne zárd) a térdet.', { compound: true, lower: true, ratio: 1.2 }),
  E('bw_squat', 'Guggolás saját testsúllyal', 'squat', 'none', 1, ['knee'],
    'Vállszéles terpesz, karok előre. Csípőt hátra-le, amíg a combod párhuzamos a talajjal, majd lendület nélkül állj fel.', { compound: true, lower: true }),
  E('wall_sit', 'Falnál ülés', 'squat', 'none', 1, [],
    'Háttal a falnak, ereszkedj le, amíg a combod vízszintes, és tartsd meg a pozíciót.', { lower: true, unit: 'sec' }),

  // Csípőhajlítás (hinge)
  E('deadlift', 'Felhúzás rúddal', 'hinge', 'barbell', 2, ['back'],
    'A rúd a lábközépnél. Semleges gerinc, lapockák hátra-le. A lábaddal told el a talajt, a rúd végig a lábad mentén haladjon.', { compound: true, lower: true, ratio: 0.8 }),
  E('rdl', 'Román felhúzás rúddal', 'hinge', 'barbell', 2, ['back'],
    'Enyhén hajlított térddel told hátra a csípőt, amíg erős nyújtást érzel a combhajlítóban. A hát végig egyenes.', { compound: true, lower: true, ratio: 0.5 }),
  E('db_rdl', 'Román felhúzás kézisúlyzóval', 'hinge', 'dumbbell|kettlebell', 1, ['back'],
    'A súlyzók a combod előtt csússzanak lefelé, csípő hátra, hát egyenes. Felfelé a farizmod összehúzásával állj fel.', { compound: true, lower: true, ratio: 0.2 }),
  E('hip_thrust', 'Csípőemelés rúddal (hip thrust)', 'glute', 'barbell+bench', 1, [],
    'Lapocka a padon, rúd a csípőhajlatban (párnával). Told fel a csípőt, amíg a törzs és a comb egy vonalba kerül, fent szorítsd a farizmot.', { compound: true, lower: true, ratio: 0.6 }),
  E('glute_bridge', 'Farizomhíd', 'glute', 'none', 1, [],
    'Hanyatt fekve, talp a földön. Emeld a csípőt, fent 1–2 mp-ig szorítsd a farizmot, majd lassan ereszkedj.', { lower: true }),
  E('kb_swing', 'Kettlebell swing', 'hinge', 'kettlebell', 2, ['back'],
    'Csípőből lendíts, ne karból! A kettlebell mellmagasságig emelkedjen, a hát végig egyenes.', { compound: true, lower: true, ratio: 0.2 }),
  E('back_ext', 'Hiperextenzió', 'hinge', 'machine', 1, [],
    'Csípőből hajolj le, majd emelkedj fel, amíg a tested egy egyenes vonalat alkot. Ne feszíts túl hátra.', { lower: true }),
  E('band_good_morning', 'Good morning gumiszalaggal', 'hinge', 'band', 1, ['back'],
    'A szalag a talpad alatt és a nyakad mögött. Csípőből hajolj előre egyenes háttal, majd egyenesedj fel.', { lower: true }),

  // Kitörések
  E('db_lunge', 'Kitörés kézisúlyzóval', 'lunge', 'dumbbell', 1, ['knee'],
    'Nagy lépés előre, a hátsó térd majdnem a földig ereszkedik. Az első sarkadon keresztül told vissza magad.', { compound: true, lower: true, ratio: 0.12 }),
  E('bulgarian', 'Bolgár guggolás', 'lunge', 'dumbbell+bench', 2, ['knee'],
    'Hátsó lábfej a padon. Függőlegesen ereszkedj, az első térd ne bicsakoljon befelé.', { compound: true, lower: true, ratio: 0.1 }),
  E('bw_lunge', 'Hátra kitörés saját testsúllyal', 'lunge', 'none', 1, ['knee'],
    'Lépj hátra, ereszkedj le, amíg mindkét térd kb. 90°-ban hajlik, majd told vissza magad az első lábbal.', { compound: true, lower: true }),
  E('step_up', 'Fellépés padra/székre', 'lunge', 'none', 1, ['knee'],
    'Egy stabil székre vagy padra lépj fel a teljes talpaddal, és csak a fenti lábbal told fel magad.', { compound: true, lower: true }),

  // Izolációs láb
  E('leg_ext', 'Lábnyújtás gépen', 'quad_iso', 'machine', 1, ['knee'],
    'Kontrolláltan nyújtsd ki a térded, fent 1 mp szünet, lassan engedd vissza.', { lower: true, ratio: 0.35 }),
  E('leg_curl', 'Combhajlítás gépen', 'ham_iso', 'machine', 1, [],
    'A sarkadat a farod felé húzd, a csípő maradjon a párnán. Lassan engedd vissza.', { lower: true, ratio: 0.3 }),
  E('band_leg_curl', 'Combhajlítás gumiszalaggal', 'ham_iso', 'band', 1, [],
    'Hason fekve, a szalag a bokádon. Hajlítsd a térded a farod felé, lassan engedd vissza.', { lower: true }),
  E('slider_curl', 'Csúszó combhajlítás (törölközővel)', 'ham_iso', 'none', 2, [],
    'Hanyatt, sarok törölközőn. Emeld a csípőt, és húzd be a sarkad a farod felé, majd csúsztasd ki.', { lower: true }),
  E('calf_raise', 'Vádliemelés', 'calves', 'none', 1, [],
    'Lépcső szélén, lábujjhegyre emelkedve, fent 1 mp szünet, lent teljes nyújtás. Nehezíthető kézisúlyzóval.', { lower: true }),
  E('machine_calf', 'Vádliemelés gépen', 'calves', 'machine', 1, [],
    'Teljes mozgástartományban dolgozz, fent szorítás, lent nyújtás.', { lower: true, ratio: 0.6 }),

  // Vízszintes nyomás
  E('bench_press', 'Fekvenyomás rúddal', 'hpush', 'barbell+bench', 2, ['shoulder'],
    'Lapockák hátra-le, enyhe ív a háton, talp a földön. A rudat a mellbimbó vonalára engedd, könyök kb. 45°-ban a törzshöz.', { compound: true, ratio: 0.5 }),
  E('db_bench', 'Fekvenyomás kézisúlyzóval', 'hpush', 'dumbbell+bench', 1, ['shoulder'],
    'A súlyzókat mellkasod mellé engedd, majd nyomd fel és enyhén közelítsd egymáshoz.', { compound: true, ratio: 0.15 }),
  E('incline_db', 'Ferde fekvenyomás kézisúlyzóval', 'hpush', 'dumbbell+bench', 1, ['shoulder'],
    'Pad 30°-os szögben. Lassan ereszd, robbanékonyan nyomd fel. A felső mellizmot célozza.', { compound: true, ratio: 0.13 }),
  E('chest_press_machine', 'Mellnyomó gép', 'hpush', 'machine', 1, [],
    'Az ülést állítsd úgy, hogy a markolat mellközépen legyen. Nyomj előre a könyök teljes zárása nélkül.', { compound: true, ratio: 0.45 }),
  E('pushup', 'Fekvőtámasz', 'hpush', 'none', 1, ['wrist'],
    'Test egy vonalban, has és far feszes. Mellkasod majdnem érintse a talajt, könyök kb. 45°-ban.', { compound: true }),
  E('knee_pushup', 'Térdelő fekvőtámasz', 'hpush', 'none', 1, ['wrist'],
    'Térdelő helyzetből, a térdtől a fejig egy vonalban. Kezdőknek a fekvőtámasz könnyített változata.', { compound: true }),
  E('band_chest_press', 'Mellnyomás gumiszalaggal', 'hpush', 'band', 1, [],
    'A szalagot rögzítsd a hátad mögött, és nyomd előre mellmagasságban.', { compound: true }),

  // Függőleges nyomás
  E('ohp', 'Vállból nyomás rúddal (állva)', 'vpush', 'barbell', 2, ['shoulder', 'back'],
    'Farizom és has feszes, a rudat egyenes vonalban nyomd a fejed fölé, a fejed fent kicsit told előre.', { compound: true, ratio: 0.3 }),
  E('db_shoulder_press', 'Vállból nyomás kézisúlyzóval', 'vpush', 'dumbbell', 1, ['shoulder'],
    'Ülve vagy állva, a súlyzók fülmagasságból indulnak. Nyomd fel, ne ívelj a derekadban.', { compound: true, ratio: 0.1 }),
  E('machine_shoulder', 'Vállnyomó gép', 'vpush', 'machine', 1, ['shoulder'],
    'A markolat vállmagasságban. Nyomj felfelé, lassan engedd vissza.', { compound: true, ratio: 0.3 }),
  E('pike_pushup', 'Pike fekvőtámasz', 'vpush', 'none', 2, ['shoulder', 'wrist'],
    'Csípő magasan (fordított V). A fejed a kezeid közé engedd le, majd nyomd vissza magad.', { compound: true }),
  E('band_press', 'Vállból nyomás gumiszalaggal', 'vpush', 'band', 1, ['shoulder'],
    'A szalagra állva nyomd fel a végeit a fejed fölé.', { compound: true }),

  // Vízszintes húzás
  E('barbell_row', 'Döntött törzsű evezés rúddal', 'hpull', 'barbell', 2, ['back'],
    'Törzs kb. 45°-ban előredöntve, hát egyenes. A rudat a köldököd felé húzd, lapockákat zárd.', { compound: true, ratio: 0.4 }),
  E('db_row', 'Egykezes evezés kézisúlyzóval', 'hpull', 'dumbbell', 1, [],
    'Egyik kezed és térded padon/széken. A súlyzót a csípőd felé húzd, a könyök a test mellett haladjon.', { compound: true, ratio: 0.18 }),
  E('cable_row', 'Ülő evezés csigán', 'hpull', 'cable|machine', 1, [],
    'Egyenes háttal ülve húzd a markolatot a hasadhoz, lapockákat zárd, lassan engedd vissza.', { compound: true, ratio: 0.4 }),
  E('band_row', 'Evezés gumiszalaggal', 'hpull', 'band', 1, [],
    'A szalagot rögzítsd magad előtt, és húzd a hasad felé, lapockákat összezárva.', { compound: true }),
  E('inverted_row', 'Ausztrál húzódzkodás (asztal alatt)', 'hpull', 'none', 1, [],
    'Egy stabil asztal alatt hanyatt fekve fogd meg a szélét, és húzd fel a mellkasod. Test egyenes.', { compound: true }),

  // Függőleges húzás
  E('pullup', 'Húzódzkodás', 'vpull', 'pullup_bar', 2, ['shoulder'],
    'Vállszélesnél kicsit szélesebb fogás. Az álladat húzd a rúd fölé, lassan ereszkedj teljes nyújtásig.', { compound: true }),
  E('assisted_pullup', 'Gumiszalagos húzódzkodás', 'vpull', 'pullup_bar+band', 1, [],
    'A szalagot akaszd a rúdra, és térdeddel/lábaddal állj bele — segít a felhúzásban.', { compound: true }),
  E('lat_pulldown', 'Lehúzás csigán', 'vpull', 'cable|machine', 1, [],
    'Mellkas kihúzva, a rudat a kulcscsontod felé húzd, könyököket lefelé-hátra vezesd.', { compound: true, ratio: 0.45 }),
  E('band_pulldown', 'Lehúzás gumiszalaggal', 'vpull', 'band', 1, [],
    'A szalagot rögzítsd magasra (pl. ajtó tetejére), és húzd le a mellkasod felé.', { compound: true }),
  E('prone_ytw', 'Y–T–W emelés hason fekve', 'vpull', 'none', 1, [],
    'Hason fekve emeld a karjaidat Y, majd T, majd W alakban, a lapockák összezárásával.', {}),

  // Váll izoláció
  E('lateral_raise', 'Oldalemelés kézisúlyzóval', 'shoulder_iso', 'dumbbell', 1, ['shoulder'],
    'Enyhén hajlított könyökkel emeld oldalra a súlyzókat vállmagasságig, lassan engedd vissza.', { ratio: 0.05 }),
  E('cable_lateral', 'Oldalemelés csigán', 'shoulder_iso', 'cable', 1, ['shoulder'],
    'Egykezes oldalemelés kábellel — állandó feszülés a mozgás végig.', { ratio: 0.04 }),
  E('band_lateral', 'Oldalemelés gumiszalaggal', 'shoulder_iso', 'band', 1, ['shoulder'],
    'A szalagra állva emeld oldalra a karjaidat vállmagasságig.', {}),
  E('face_pull', 'Face pull csigán', 'rear_delt', 'cable', 1, [],
    'Kötéllel, arcmagasságban húzd magad felé, a végén a kezeid a füled mellett, könyök magasan.', { ratio: 0.2 }),
  E('band_face_pull', 'Face pull gumiszalaggal', 'rear_delt', 'band', 1, [],
    'Arcmagasságban rögzített szalaggal húzz magad felé, kifelé forgatva a vállad.', {}),
  E('rear_delt_fly', 'Döntött törzsű hátsóváll-emelés', 'rear_delt', 'dumbbell', 1, [],
    'Előredöntött törzzsel emeld oldalra a súlyzókat, a lapockákat zárva.', { ratio: 0.04 }),

  // Kar
  E('db_curl', 'Bicepsz hajlítás kézisúlyzóval', 'biceps', 'dumbbell', 1, [],
    'Könyök a törzs mellett rögzítve, lendület nélkül hajlíts, lassan engedd le.', { ratio: 0.08 }),
  E('barbell_curl', 'Bicepsz hajlítás rúddal', 'biceps', 'barbell', 1, ['wrist'],
    'Vállszéles fogás, a könyök ne mozduljon előre. Lassú, kontrollált leengedés.', { ratio: 0.2 }),
  E('cable_curl', 'Bicepsz hajlítás csigán', 'biceps', 'cable', 1, [],
    'Alsó csigán, állandó feszüléssel hajlíts.', { ratio: 0.15 }),
  E('band_curl', 'Bicepsz hajlítás gumiszalaggal', 'biceps', 'band', 1, [],
    'A szalagra állva hajlítsd a könyököd, fent szorítsd meg a bicepszet.', {}),
  E('backpack_curl', 'Bicepsz hajlítás megpakolt táskával', 'biceps', 'none', 1, [],
    'Egy könyvekkel megpakolt táska fülét fogva hajlítsd a könyököd.', {}),
  E('rope_pushdown', 'Tricepsz letolás kötéllel', 'triceps', 'cable', 1, ['elbow'],
    'Könyök a test mellett, told le a kötelet, lent fordítsd kifelé a kezed.', { ratio: 0.2 }),
  E('overhead_ext', 'Tricepsz nyújtás fej fölött kézisúlyzóval', 'triceps', 'dumbbell', 1, ['elbow', 'shoulder'],
    'Két kézzel fogd a súlyzót a fejed mögött, a könyök felfelé mutasson, nyújtsd ki a karod.', { ratio: 0.12 }),
  E('chair_dips', 'Tolódzkodás széken', 'triceps', 'none', 1, ['shoulder', 'wrist'],
    'Kezek a szék szélén, ereszkedj, amíg a könyök 90°-ban hajlik, majd nyomd fel magad.', {}),
  E('band_pushdown', 'Tricepsz letolás gumiszalaggal', 'triceps', 'band', 1, ['elbow'],
    'Magasra rögzített szalaggal told le a kezed, könyök a törzs mellett.', {}),
  E('close_pushup', 'Szűk fekvőtámasz', 'triceps', 'none', 1, ['wrist', 'elbow'],
    'Kezek vállszélességben, a könyök a törzs mellett halad.', {}),

  // Mell izoláció
  E('cable_fly', 'Tárogatás csigán', 'chest_iso', 'cable', 1, ['shoulder'],
    'Enyhén hajlított könyökkel hozd össze a kezeidet magad előtt, ívben.', { ratio: 0.1 }),
  E('db_fly', 'Tárogatás kézisúlyzóval', 'chest_iso', 'dumbbell+bench', 1, ['shoulder'],
    'Fekve, enyhén hajlított könyökkel nyisd szét a karjaidat, amíg nyújtást érzel.', { ratio: 0.06 }),
  E('pec_deck', 'Pillangó gép', 'chest_iso', 'machine', 1, [],
    'A mellizmoddal húzd össze a karokat, ne a vállal.', { ratio: 0.3 }),

  // Törzs
  E('plank', 'Plank', 'core', 'none', 1, [],
    'Alkaron támaszkodva, test egyenes vonalban, has és far feszes. Ne süllyedjen le a csípő.', { unit: 'sec' }),
  E('dead_bug', 'Dead bug', 'core', 'none', 1, [],
    'Hanyatt, karok és térdek fent. Ellentétes kart és lábat nyújts ki lassan, a derekad maradjon a földön.', {}),
  E('side_plank', 'Oldalsó plank', 'core', 'none', 1, ['shoulder'],
    'Egyik alkaron támaszkodva, test egyenes oldalvonalban. Mindkét oldalra.', { unit: 'sec' }),
  E('bird_dog', 'Bird dog', 'core', 'none', 1, [],
    'Négykézláb, ellentétes kart és lábat nyújts ki, 2 mp tartás. Derékkímélő törzsgyakorlat.', {}),
  E('hanging_knee', 'Függő térdemelés', 'core', 'pullup_bar', 2, ['shoulder'],
    'Rúdon függve húzd fel a térded a mellkasod felé lendület nélkül.', {}),
  E('cable_crunch', 'Kábeles hasprés', 'core', 'cable', 1, ['back'],
    'Térdelve, a kötelet a fejed mellett tartva gördülj le a hasizmod összehúzásával.', {}),
];

const BY_KEY = Object.fromEntries(EXERCISES.map((e) => [e.key, e]));

const EQUIPMENT = {
  barbell: 'Olimpiai rúd + tárcsák', dumbbell: 'Kézisúlyzó', kettlebell: 'Kettlebell', bench: 'Pad',
  pullup_bar: 'Húzódzkodó rúd', band: 'Gumiszalag', machine: 'Gépek', cable: 'Csigás gép',
};
const GYM_EQUIPMENT = Object.keys(EQUIPMENT);

const INJURIES = { knee: 'Térd', back: 'Derék / gerinc', shoulder: 'Váll', wrist: 'Csukló', elbow: 'Könyök', hip: 'Csípő' };

// Megvan-e a gyakorlathoz szükséges eszköz?
function hasEquipment(ex, available) {
  if (ex.eq === 'none') return true;
  return ex.eq.split('+').every((group) => group.split('|').some((item) => item === 'none' || available.includes(item)));
}

function equipmentLabel(ex) {
  if (ex.eq === 'none') return 'Eszköz nélkül';
  return ex.eq.split('+').map((g) => g.split('|').map((i) => EQUIPMENT[i] || i).join(' vagy ')).join(' + ');
}

module.exports = { EXERCISES, BY_KEY, EQUIPMENT, GYM_EQUIPMENT, INJURIES, hasEquipment, equipmentLabel };
