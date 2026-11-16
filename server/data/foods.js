// Beépített élelmiszer-adatbázis (tápérték 100 g-ra, ár Ft/kg — becslés, 2026).
// cat: protein | carb | fruit | fat | veg
// slots: b = reggeli, s = tízórai/uzsonna, m = ebéd/vacsora
// allergens: gluten, lactose, egg, fish, nuts, peanut, soy
// cook: elkészítési idő percben (0 = nem kell főzni)
// max: egy étkezésben javasolt maximum (g); unit: darabos alapanyagoknál

const F = (key, name, syn, cat, kcal, protein, carbs, fat, price, slots, allergens, cook, max, prep, unit) => ({
  key, name, syn, cat, kcal, protein, carbs, fat, price, slots, allergens, cook, max, prep, unit,
});

const FOODS = [
  // ── Fehérjeforrások ──────────────────────────────────────────────
  F('chicken_breast', 'Csirkemell', ['csirke', 'csirkemell', 'csirkemellfile'], 'protein', 110, 23, 0, 1.5, 3200, 'm', [], 15, 250,
    'Szeleteld fel, sózd, borsozd, majd kevés olajon közepes lángon süsd oldalanként 5–6 percig, amíg teljesen átsül.'),
  F('chicken_thigh', 'Csirkecomb filé', ['csirkecomb', 'comb'], 'protein', 180, 18, 0, 12, 2400, 'm', [], 25, 250,
    'Fűszerezd (só, bors, fokhagyma, paprika), majd sütőben 200 °C-on 20–25 percig süsd.'),
  F('turkey_breast', 'Pulykamell', ['pulyka', 'pulykamell'], 'protein', 105, 24, 0, 1, 3600, 'm', [], 15, 250,
    'Vékony szeletekre vágva, fűszerezve serpenyőben süsd oldalanként 4–5 percig.'),
  F('beef_lean', 'Sovány darált marhahús', ['marha', 'marhahus', 'daralt marha', 'daralthus', 'daralt hus'], 'protein', 170, 21, 0, 9, 4500, 'm', [], 15, 220,
    'Kevés olajon pirítsd morzsalékosra 8–10 perc alatt, sózd, fűszerezd.'),
  F('pork_loin', 'Sertéskaraj', ['karaj', 'sertes', 'diszno'], 'protein', 145, 22, 0, 6, 2800, 'm', [], 15, 230,
    'Klopfold ki, fűszerezd, és forró serpenyőben süsd oldalanként 4–5 percig.'),
  F('salmon', 'Lazac', ['lazac', 'lazacfile'], 'protein', 200, 20, 0, 13, 9000, 'm', ['fish'], 15, 200,
    'Sózd, borsozd, citromozd, majd bőrös felével lefelé süsd 4 percig, megfordítva még 3 percig.'),
  F('tuna_can', 'Tonhalkonzerv (saját lében)', ['tonhal', 'tonhalkonzerv'], 'protein', 110, 25, 0, 1, 6000, 'ms', ['fish'], 0, 160,
    'Csepegtesd le a konzervet, villával lazítsd fel.'),
  F('hake', 'Fehér halfilé (hekk/tilápia)', ['hal', 'hekk', 'tilapia', 'halfile', 'pangasius'], 'protein', 85, 18, 0, 1, 4000, 'm', ['fish'], 15, 250,
    'Fűszerezd, és sütőpapíron 200 °C-on süsd 12–15 percig.'),
  F('eggs', 'Tojás', ['tojas', 'tojások'], 'protein', 143, 12.6, 0.7, 9.5, 1350, 'bms', ['egg'], 8, 240,
    'Készítsd el rántottának, tükörtojásnak vagy főzd keményre (8–9 perc).', { g: 55, name: 'db' }),
  F('egg_white', 'Tojásfehérje', ['tojasfeherje'], 'protein', 52, 11, 0.7, 0.2, 1800, 'bm', ['egg'], 5, 250,
    'Serpenyőben, kevés olajon süsd omlettnek 3–4 perc alatt.'),
  F('turo', 'Túró (félzsíros)', ['turo', 'tehenturo'], 'protein', 120, 17, 3.5, 4.5, 2600, 'bs', ['lactose'], 0, 250,
    'Keverd ki krémesre egy kevés vízzel vagy tejjel.'),
  F('greek_yogurt', 'Görög joghurt (natúr)', ['joghurt', 'gorog joghurt', 'gorogjoghurt', 'skyr'], 'protein', 75, 10, 4, 2, 2200, 'bs', ['lactose'], 0, 300,
    'Tálald hidegen.'),
  F('cottage', 'Cottage cheese', ['cottage', 'cottage cheese', 'zsirszegeny sajt'], 'protein', 98, 11, 3.4, 4.3, 3200, 'bs', ['lactose'], 0, 250,
    'Tálald hidegen.'),
  F('whey', 'Tejsavófehérje (whey)', ['whey', 'feherjepor', 'protein por', 'feherje'], 'protein', 380, 78, 8, 5, 12000, 'bs', ['lactose'], 0, 40,
    'Keverd el 250–300 ml vízben vagy tejben.'),
  F('tofu', 'Tofu', ['tofu'], 'protein', 120, 13, 2, 7, 3000, 'm', ['soy'], 10, 250,
    'Kockázd fel, és pirítsd aranybarnára 8–10 perc alatt, a végén locsold meg szójaszósszal.'),
  F('ham', 'Pulykasonka', ['sonka', 'pulykasonka'], 'protein', 105, 19, 2, 2.5, 4000, 'bs', [], 0, 120,
    'Szeletelve tálald.'),
  F('milk', 'Tej (1,5%)', ['tej'], 'protein', 46, 3.4, 4.8, 1.5, 450, 'bs', ['lactose'], 0, 300,
    'Hidegen vagy melegítve.'),
  F('mozzarella', 'Mozzarella light', ['mozzarella'], 'protein', 160, 19, 2, 9, 3500, 'bsm', ['lactose'], 0, 125,
    'Szeleteld vagy tépkedd fel.'),

  // ── Szénhidrátforrások ───────────────────────────────────────────
  F('rice', 'Rizs (száraz)', ['rizs', 'basmati', 'jazmin rizs', 'barna rizs'], 'carb', 355, 7, 78, 0.6, 900, 'm', [], 20, 130,
    'A rizst öblítsd át, majd másfélszeres mennyiségű sós vízben, lefedve, kis lángon főzd 15–18 percig.'),
  F('pasta', 'Tészta (száraz)', ['teszta', 'spagetti', 'penne', 'makaroni'], 'carb', 355, 12.5, 71, 1.5, 900, 'm', ['gluten'], 12, 130,
    'Bő, sós vízben főzd al dente-re (a csomagoláson jelzett ideig, kb. 9–11 perc).'),
  F('wholegrain_pasta', 'Teljes kiőrlésű tészta', ['teljes kiorlesu teszta', 'teljeskiorlesu teszta'], 'carb', 340, 13, 64, 2.5, 1300, 'm', ['gluten'], 12, 130,
    'Bő, sós vízben főzd al dente-re (kb. 10–12 perc).'),
  F('potato', 'Burgonya', ['krumpli', 'burgonya'], 'carb', 77, 2, 17, 0.1, 400, 'm', [], 25, 500,
    'Hámozd meg, kockázd fel és sós vízben főzd puhára 15–20 perc alatt (vagy süsd sütőben 200 °C-on 25 percig).'),
  F('sweet_potato', 'Édesburgonya', ['edesburgonya', 'batata', 'edeskrumpli'], 'carb', 86, 1.6, 20, 0.1, 1200, 'm', [], 30, 450,
    'Kockázd fel, fűszerezd és sütőben 200 °C-on süsd 25–30 percig.'),
  F('oats', 'Zabpehely', ['zab', 'zabpehely', 'zabkasa'], 'carb', 375, 13, 60, 7, 900, 'bs', ['gluten'], 5, 120,
    'Főzd össze vízzel vagy tejjel 3–5 percig, vagy áztasd be előző este (overnight oats).'),
  F('bread_wg', 'Teljes kiőrlésű kenyér', ['kenyer', 'teljes kiorlesu kenyer', 'rozskenyer', 'barnakenyer'], 'carb', 240, 9, 42, 3, 1500, 'bsm', ['gluten'], 0, 150,
    'Szeleteld fel, ha szeretnéd, pirítsd meg.'),
  F('rice_cakes', 'Puffasztott rizs szelet', ['puffasztott rizs', 'rizsszelet', 'puffasztott'], 'carb', 385, 8, 81, 3, 3500, 'bs', [], 0, 60,
    'Készen fogyasztható.'),
  F('couscous', 'Kuszkusz (száraz)', ['kuszkusz'], 'carb', 360, 12.5, 72, 1, 1500, 'm', ['gluten'], 5, 120,
    'Öntsd le ugyanannyi forró, sós vízzel, fedd le és hagyd állni 5 percig, majd villával lazítsd fel.'),
  F('bulgur', 'Bulgur (száraz)', ['bulgur'], 'carb', 345, 12, 63, 1.5, 1400, 'm', ['gluten'], 15, 120,
    'Kétszeres mennyiségű sós vízben főzd 12–15 percig.'),
  F('quinoa', 'Quinoa (száraz)', ['quinoa', 'kinoa'], 'carb', 368, 14, 64, 6, 4000, 'm', [], 15, 110,
    'Öblítsd át, majd kétszeres mennyiségű vízben főzd 12–15 percig.'),
  F('tortilla', 'Teljes kiőrlésű tortilla', ['tortilla', 'wrap'], 'carb', 300, 8.5, 48, 8, 2500, 'ms', ['gluten'], 0, 130,
    'Száraz serpenyőben melegítsd meg 30 másodpercig, majd töltsd meg.'),
  F('lentils', 'Vörös lencse (száraz)', ['lencse', 'voroslencse'], 'carb', 350, 24, 52, 1.5, 1200, 'm', [], 15, 120,
    'Öblítsd át, és háromszoros mennyiségű vízben főzd puhára 12–15 perc alatt.'),
  F('chickpeas', 'Csicseriborsó konzerv', ['csicseri', 'csicseriborso'], 'carb', 120, 7, 16, 2.5, 1400, 'm', [], 0, 250,
    'Csepegtesd le és öblítsd át; melegen vagy hidegen is fogyasztható.'),
  F('beans', 'Vörösbab konzerv', ['bab', 'voros bab', 'vorosbab', 'feherbab'], 'carb', 100, 7, 14, 0.5, 1000, 'm', [], 0, 250,
    'Csepegtesd le és öblítsd át.'),

  // ── Gyümölcsök ───────────────────────────────────────────────────
  F('banana', 'Banán', ['banan'], 'fruit', 89, 1.1, 23, 0.3, 600, 'bs', [], 0, 200,
    'Hámozd meg, szeleteld fel.', { g: 120, name: 'db' }),
  F('apple', 'Alma', ['alma'], 'fruit', 52, 0.3, 14, 0.2, 500, 'bs', [], 0, 250,
    'Mosd meg, szeleteld fel.', { g: 160, name: 'db' }),
  F('berries', 'Bogyós gyümölcs (fagyasztott)', ['bogyos', 'afonya', 'eper', 'malna', 'erdei gyumolcs'], 'fruit', 50, 0.8, 11, 0.3, 2500, 'bs', [], 0, 200,
    'Olvaszd ki, vagy fagyosan keverd az ételbe.'),
  F('orange', 'Narancs', ['narancs', 'mandarin'], 'fruit', 47, 0.9, 12, 0.1, 600, 'bs', [], 0, 250,
    'Hámozd meg, gerezdekre szedve tálald.', { g: 150, name: 'db' }),

  // ── Zsírforrások ─────────────────────────────────────────────────
  F('olive_oil', 'Olívaolaj', ['olivaolaj', 'oliva olaj'], 'fat', 884, 0, 0, 100, 4500, 'm', [], 0, 20,
    'A sütéshez vagy a salátára használd.'),
  F('oil', 'Napraforgó-olaj', ['olaj', 'etolaj', 'napraforgo olaj'], 'fat', 884, 0, 0, 100, 900, 'm', [], 0, 20,
    'A sütéshez használd.'),
  F('peanut_butter', 'Mogyoróvaj', ['mogyorovaj', 'foldimogyoro vaj'], 'fat', 590, 25, 20, 50, 3500, 'bs', ['peanut'], 0, 35,
    'Kend vagy keverd az ételbe.'),
  F('nuts', 'Dió / mandula', ['dio', 'mandula', 'kesudio', 'mogyoro', 'magvak'], 'fat', 600, 18, 12, 54, 6000, 'bs', ['nuts'], 0, 40,
    'Durvára vágva szórd az ételre.'),
  F('avocado', 'Avokádó', ['avokado'], 'fat', 160, 2, 9, 15, 3500, 'bsm', [], 0, 120,
    'Vágd félbe, kanalazd ki és szeleteld vagy törd villával.'),
  F('cheese', 'Trappista sajt', ['sajt', 'trappista', 'gouda', 'edami'], 'fat', 350, 26, 0, 27, 3800, 'bsm', ['lactose'], 0, 50,
    'Szeleteld vagy reszeld.'),
  F('seeds', 'Chia- / lenmag', ['chia', 'lenmag', 'tokmag', 'napraforgomag'], 'fat', 520, 18, 30, 40, 3000, 'bs', [], 0, 25,
    'Szórd az ételre.'),

  // ── Zöldségek ────────────────────────────────────────────────────
  F('broccoli', 'Brokkoli', ['brokkoli'], 'veg', 34, 2.8, 7, 0.4, 1200, 'm', [], 8, 250, 'Rózsáira szedve párold vagy főzd 5–7 percig.'),
  F('tomato', 'Paradicsom', ['paradicsom', 'koktelparadicsom'], 'veg', 18, 0.9, 3.9, 0.2, 1000, 'bsm', [], 0, 250, 'Mosd meg és szeleteld fel.'),
  F('cucumber', 'Uborka', ['uborka'], 'veg', 15, 0.7, 3.6, 0.1, 600, 'bsm', [], 0, 250, 'Mosd meg és szeleteld fel.'),
  F('pepper', 'Paprika', ['paprika', 'kaliforniai paprika', 'tv paprika'], 'veg', 26, 1, 6, 0.3, 1200, 'bsm', [], 0, 250, 'Csíkokra vágva nyersen vagy párolva.'),
  F('carrot', 'Sárgarépa', ['repa', 'sargarepa'], 'veg', 41, 0.9, 10, 0.2, 400, 'sm', [], 0, 200, 'Hámozd meg, reszeld vagy vágd hasábokra.'),
  F('spinach', 'Spenót', ['spenot', 'bebispenot'], 'veg', 23, 2.9, 3.6, 0.4, 1200, 'bm', [], 5, 200, 'Kevés olajon fonnyaszd meg 2–3 perc alatt.'),
  F('zucchini', 'Cukkini', ['cukkini'], 'veg', 17, 1.2, 3.1, 0.3, 800, 'm', [], 8, 300, 'Karikázd fel, és serpenyőben pirítsd 5–6 percig.'),
  F('green_beans', 'Zöldbab (fagyasztott)', ['zoldbab'], 'veg', 31, 1.8, 7, 0.1, 1000, 'm', [], 8, 250, 'Sós vízben főzd vagy párold 6–8 percig.'),
  F('mixed_veg', 'Vegyes zöldség (fagyasztott)', ['vegyes zoldseg', 'zoldsegkeverek', 'wokzoldseg'], 'veg', 50, 2.5, 9, 0.5, 900, 'm', [], 10, 300, 'Serpenyőben vagy wokban pirítsd 8–10 percig.'),
  F('lettuce', 'Saláta (jégsaláta)', ['salata', 'jegsalata', 'rukkola', 'madarsalata'], 'veg', 14, 0.9, 3, 0.1, 1200, 'bsm', [], 0, 150, 'Mosd meg, tépkedd fel.'),
  F('mushroom', 'Gomba', ['gomba', 'csiperke'], 'veg', 22, 3.1, 3.3, 0.3, 1500, 'bm', [], 8, 250, 'Szeleteld fel, és kevés olajon pirítsd 6–8 percig.'),
  F('onion', 'Vöröshagyma', ['hagyma', 'voroshagyma', 'lilahagyma'], 'veg', 40, 1.1, 9, 0.1, 350, 'm', [], 5, 100, 'Vágd apróra, és kevés olajon dinszteld üvegesre.'),
];

const ALLERGENS = {
  gluten: 'Glutén', lactose: 'Laktóz', egg: 'Tojás', fish: 'Hal', nuts: 'Diófélék', peanut: 'Földimogyoró', soy: 'Szója',
};

// Ékezetek nélküli, kisbetűs forma a kereséshez ("Csirkemell" -> "csirkemell")
function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const BY_KEY = Object.fromEntries(FOODS.map((f) => [f.key, f]));

// Szabad szöveges névből megkeresi a legjobban illeszkedő alapanyagot
function matchFood(name) {
  const n = normalize(name);
  if (!n) return null;
  // Pontszám: pontos egyezés > a beírt név tartalmazza a jelöltet (hosszabb jobb) > a jelölt tartalmazza a beírt nevet (rövidebb jobb)
  let best = null;
  let bestScore = 0;
  for (const f of FOODS) {
    for (const cand of [normalize(f.name), ...f.syn.map(normalize)]) {
      if (!cand) continue;
      let score = 0;
      if (n === cand) score = 1000;
      else if (new RegExp(`(^| )${cand}( |$)`).test(n)) score = 500 + cand.length;
      else if (n.includes(cand) && cand.length >= 4) score = 300 + cand.length;
      else if (cand.startsWith(n) && n.length >= 4) score = 200 - cand.length;
      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    }
  }
  return best;
}

module.exports = { FOODS, BY_KEY, ALLERGENS, normalize, matchFood };
