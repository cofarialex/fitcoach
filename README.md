# FitCoach — AI személyi edző és táplálkozási tanácsadó

Teljes értékű webalkalmazás. Regisztráció után minden felhasználó saját, privát profilt kap. A profil, az edzésnapló és az otthon lévő alapanyagok alapján az alkalmazás személyre szabott edzéstervet és étrendet készít, és ezeket a naplózott adatok alapján folyamatosan igazítja.

Mobilon és asztali gépen is működik, sötét és világos móddal.

## Gyors indítás

Szükséges: **Node.js 22.13 vagy újabb** (a beépített `node:sqlite` modult használjuk, külön adatbázis-szervert nem kell telepíteni).

```bash
npm install
```

```bash
npm start
```

Ezután nyisd meg böngészőben: http://localhost:3000

Fejlesztés közben az `npm run dev` minden mentéskor automatikusan újraindítja a szervert. Tesztek: `npm test`.

### AI bekapcsolása (opcionális)

Az alkalmazás **AI nélkül is teljesen működik**: egy beépített, szabályalapú motor készíti a terveket, és válaszol a chatben. A Claude AI bekapcsolásához:

1. Hozz létre egy API-kulcsot a https://console.anthropic.com oldalon.
2. Másold le a `.env.example` fájlt `.env` néven, és írd bele: `ANTHROPIC_API_KEY=sk-ant-...`
3. Indítsd újra a szervert.

AI-val ezek javulnak:

- Az edzés- és étrendterveket a Claude állítja össze. A tápértékeket ilyenkor is a saját adatbázisunkból számoljuk, így a számok pontosak maradnak.
- Az AI Coach szabadon beszélget, és **eszközhívással (tool use)** ténylegesen módosítani is tud: új edzéstervet készít, gyakorlatot cserél, étrendet tervez, alapanyagot vesz fel, kalóriacélt igazít.
- Fotóról felismeri az alapanyagokat (hűtő, kamra, bevásárlás).

## Funkciók

| Menüpont | Mit tud |
|---|---|
| **Dashboard** | Testsúly, napi kalóriacél és bevitel, makrók, vízfogyasztás, következő edzés, heti edzésszám, volumen az előző hetekhez képest, grafikonok, adaptív javaslatok |
| **Edzésterv** | Heti felosztás, gyakorlatok sorozat/ismétlés/súly/pihenő értékekkel, bemelegítés, levezetés, végrehajtási leírás, alternatívák eszközhiány esetére, gyakorlatcsere, kézi szerkesztés, automatikus súlyemelési javaslat |
| **Edzésnapló** | Edzés rögzítése (a tervből előtöltve), sorozatok, kardió, megjegyzés, fotó, szerkesztés/törlés, összehasonlítás az előző alkalommal |
| **Étrend** | Napi terv grammra pontosan, kcal és makrók, elkészítés, helyettesítők, „Megettem / Kihagytam / Mást ettem”, hátralévő étkezések újraszámolása, „Mit egyek ma?”, heti terv, bevásárlólista becsült árral |
| **Alapanyagok** | Otthon lévő és rendszeresen beszerezhető alapanyagok, gyors felvitel, egyedi alapanyag saját tápértékkel, felismerés fotóról (AI) |
| **Fejlődésem** | Erőszint (becsült 1RM), testsúly, testméretek, edzésmennyiség, heti aktivitás; mérések szerkesztése és törlése |
| **AI Coach** | Természetes nyelvű chat, amely ismeri a profilodat, a naplódat, az étrendedet és az alapanyagaidat |
| **Beállítások** | Profil, cél, edzési és étkezési beállítások, téma, név, jelszó, adatexport (JSON), fióktörlés |

## Hogyan épül fel? (tanuláshoz)

```
fitcoach/
├── server/                    ← Backend (Node.js + Express)
│   ├── index.js               ← Belépési pont: middleware-ek, route-ok, hibakezelés
│   ├── db.js                  ← SQLite adatbázis és a táblák (séma)
│   ├── auth.js                ← Jelszó hash (bcrypt) + JWT süti, védett útvonalak
│   ├── upload.js              ← Képfeltöltés (multer)
│   ├── util.js                ← Bemenet-ellenőrzés, hibaosztály
│   ├── data/
│   │   ├── foods.js           ← Élelmiszer-adatbázis (tápérték, ár, allergének)
│   │   └── exercises.js       ← Gyakorlat-adatbázis (mozgásminta, eszköz, sérülés)
│   ├── services/              ← Az "üzleti logika" — itt történik az okosság
│   │   ├── nutrition.js       ← Kalóriacél-számítás + étrendgenerátor
│   │   ├── workout.js         ← Edzéstervgenerátor + progresszió-elemzés
│   │   ├── insights.js        ← Adaptív javaslatok (testsúlytrend, rendszeresség…)
│   │   ├── actions.js         ← Közös műveletek (ezeket hívja az API és az AI is)
│   │   ├── ai.js              ← Claude API hívások
│   │   └── coach.js           ← Chat: AI eszközhívással, vagy szabályalapú válaszok
│   └── routes/                ← REST API végpontok (/api/...)
├── public/                    ← Frontend (sima HTML + CSS + JavaScript modulok)
│   ├── index.html
│   ├── css/app.css            ← Teljes design, sötét/világos téma CSS változókkal
│   └── js/
│       ├── main.js            ← Router (#/dashboard …), elrendezés, bejelentkezés-ellenőrzés
│       ├── api.js             ← fetch burkoló
│       ├── ui.js              ← Segédfüggvények (escape, ikonok, modal, formázás)
│       ├── charts.js          ← Chart.js grafikonok
│       └── pages/             ← Egy fájl = egy oldal
└── tests/                     ← Automatikus tesztek (node --test)
```

### A legfontosabb ötletek a kódban

1. **Rétegek.** A route-ok (`routes/`) csak a kérést ellenőrzik és választ adnak; a logika a `services/` mappában van. Így ugyanazt a függvényt hívja a REST API, az AI Coach és a teszt is.
2. **Kalóriacél** (`nutrition.js → calcTargets`). Az alapanyagcserét a Mifflin–St Jeor képlet adja (ismert testzsírnál a Katch–McArdle képlet). Ezt szorozzuk az aktivitási szorzóval, majd igazítjuk a cél szerint (pl. tömegnövelésnél +10%). A fehérje testsúlykilogrammonként számolódik, a zsír a kalória kb. 27%-a, a maradék szénhidrát.
3. **Étrendgenerátor.** Minden étkezésben vannak „szerepek”: fehérje-, szénhidrát-, zsír- és zöldségforrás. A jelölteket pontozzuk: otthon van-e, kedveled-e, mennyibe kerül, mennyi ideig tart elkészíteni, ettél-e belőle nemrég. Utána egy kis optimalizáló (koordináta-módszer) kiszámolja a grammokat úgy, hogy a makrók a célhoz legközelebb essenek.
4. **Edzésterv.** A heti napok számából felosztást választunk (teljes test, felső–alsó, toló–húzó–láb). Minden nap mozgásmintákból áll (guggolás, húzás, nyomás…). Mintánként azt a gyakorlatot választjuk, amelyhez megvan az eszközöd, és amely nem terheli a sérült területet.
5. **Progresszió** (`workout.js → analyzeProgress`). Ha legutóbb minden sorozatban megvolt a felső ismétlésszám, súlyemelést javasol. Ha kétszer egymás után nem jött ki az alsó, csökkentést. Ha három edzésen át nincs javulás, stagnálást jelez és gyakorlatcserét javasol.
6. **Biztonság.** Jelszó csak hash-elve (bcrypt) kerül tárolásra. A munkamenet httpOnly sütiben tárolt JWT. Minden SQL lekérdezés paraméteres (nincs SQL injection). Minden felhasználói adatot `esc()`-pel írunk a HTML-be (nincs XSS). Minden lekérdezés `user_id`-re szűr, ezért senki nem látja a más adatait. Szigorú Content-Security-Policy fejlécet is küldünk.

### Ötletek bővítéshez (gyakorlásnak)

- Új étel vagy gyakorlat: csak egy sort kell hozzáadni a `server/data/foods.js` vagy az `exercises.js` fájlhoz.
- Új oldal: hozz létre egy fájlt a `public/js/pages/` mappában, és vedd fel a `ROUTES` listába a `main.js`-ben.
- Új AI eszköz a Coachnak: a `services/coach.js` `TOOLS` listájába egy új definíció, a `runTool` függvénybe pedig egy új ág kell.
- További lehetőségek: értesítések, PWA (offline mód, telepíthető app), receptadatbázis, vonalkód-olvasó, okosóra-integráció.

## Adatok

Minden adat a `data/fitcoach.db` SQLite fájlban van, a feltöltött képek a `data/uploads/<felhasználó>/` mappában. Ha a `data/` mappát törlöd, tiszta lappal indulsz. Mentéshez elég ezt az egy mappát lemásolni.
