// Claude AI integráció (Anthropic SDK).
// Ha nincs ANTHROPIC_API_KEY, az alkalmazás a beépített szabályalapú motorral működik tovább.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
let client = null;

function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

class AiError extends Error {}

// Egy Claude hívás. A "fallbacks: default" automatikusan másik modellre küldi a kérést,
// ha a biztonsági szűrő tévesen elutasítaná.
async function callClaude({ system, messages, tools, maxTokens = 16000, effort = 'medium' }) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  };
  if (tools && tools.length) params.tools = tools;
  try {
    const res = await getClient().beta.messages.create(params);
    if (res.stop_reason === 'refusal') throw new AiError('Az AI nem tudta teljesíteni ezt a kérést.');
    return res;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('Érvénytelen Anthropic API-kulcs.');
    if (err instanceof Anthropic.RateLimitError) throw new AiError('Az AI most túlterhelt, próbáld újra egy perc múlva.');
    if (err instanceof Anthropic.APIError) throw new AiError(`AI hiba (${err.status || 'hálózat'}): ${err.message}`);
    throw err;
  }
}

const textOf = (res) => res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

// A válaszból kiszedi a JSON-t (akkor is, ha ```json blokkban vagy szöveg között érkezik)
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  if (start === -1 || end === -1) throw new AiError('Az AI válasza nem tartalmazott JSON-t.');
  return JSON.parse(raw.slice(start, end + 1));
}

async function askJson(system, userText, opts = {}) {
  const res = await callClaude({ system, messages: [{ role: 'user', content: userText }], ...opts });
  return extractJson(textOf(res));
}

// ── Edzésterv ──────────────────────────────────────────────────────────
async function aiWorkoutPlan({ profile, weightKg, catalog, history }) {
  const system = `Te egy tapasztalt, tudományos alapokon dolgozó személyi edző vagy. Magyarul írsz.
Kizárólag egy JSON objektummal válaszolj, más szöveg nélkül, ebben a formában:
{"name": string, "notes": [string], "days": [{"name": string, "focus": string, "weekday": string, "exercises": [{"key": string, "sets": number, "repsMin": number, "repsMax": number, "rest": number (mp), "weight": number|null (kg, kézisúlyzónál egy súlyzó), "note": string}], "cardio": {"minutes": number, "description": string} | null}]}
Csak a megadott katalógusból választhatsz gyakorlatot ("key" mezővel). Tartsd be az időkeretet, a sérüléseket és az eszközöket.`;
  const user = `Felhasználó profilja:\n${JSON.stringify(profileSummary(profile, weightKg))}\n
Elérhető gyakorlatok (key | név | mozgásminta | eszköz):\n${catalog.filter((c) => c.available && c.safe).map((c) => `${c.key} | ${c.name} | ${c.pattern} | ${c.equipment}`).join('\n')}\n
Eddigi edzésnapló-összefoglaló (gyakorlat: utolsó munkasúly × ismétlés):\n${history || 'nincs még adat'}\n
Készíts ${profile.days_per_week} napos heti edzéstervet, edzésenként kb. ${profile.session_minutes} percre. Ahol van naplózott adat, abból indulj ki a súlyoknál (progresszív terhelés).`;
  return askJson(system, user, { effort: 'medium' });
}

// ── Étrend ─────────────────────────────────────────────────────────────
async function aiMealPlan({ profile, targets, pool, slots, onlyAvailable, note }) {
  const system = `Te egy gyakorlatias sporttáplálkozási szakember vagy. Magyarul írsz, ízletes, egyszerű, hétköznapi ételeket tervezel.
Kizárólag JSON-nal válaszolj, más szöveg nélkül:
{"meals": [{"slot": string, "title": string (az étel neve), "items": [{"key": string, "grams": number}], "prep": [string] (rövid elkészítési lépések)}]}
Csak a megadott élelmiszer-listából használhatsz alapanyagot ("key" mezővel). A grammok nyers/száraz tömegre vonatkoznak. A napi összeg a lehető legjobban közelítse a makrócélokat (±5%).`;
  const foods = pool.map((f) => `${f.key} | ${f.name} | ${f.kcal} kcal, F ${f.protein} g, Sz ${f.carbs} g, Zs ${f.fat} g / 100 g | ${f.avail === 'home' ? 'OTTHON VAN' : f.avail === 'buyable' ? 'beszerezhető' : 'boltban kapható'}${f.qty ? ` (${f.qty} g)` : ''}`).join('\n');
  const user = `Napi cél: ${targets.kcal} kcal, fehérje ${targets.protein} g, szénhidrát ${targets.carbs} g, zsír ${targets.fat} g.
Étkezések (slot: arány): ${slots.map(([s, share]) => `${s}: ${Math.round(share * 100)}%`).join(', ')}.
Kedvelt ételek: ${profile.likes || '-'}; nem kedvelt: ${profile.dislikes || '-'}.
Napi étkezési keret: ${profile.daily_budget ? `${profile.daily_budget} Ft` : 'nincs megadva'}; főzésre szánt idő étkezésenként: ${profile.cook_minutes || 30} perc.
${onlyAvailable ? 'FONTOS: kizárólag az "OTTHON VAN" jelölésű alapanyagokat használd!' : 'Elsősorban az otthon lévő és beszerezhető alapanyagokat használd.'}
${note ? `Megjegyzés: ${note}` : ''}
Élelmiszerek (key | név | tápérték | elérhetőség):\n${foods}`;
  return askJson(system, user, { effort: 'medium' });
}

// ── Alapanyag-felismerés fényképről ────────────────────────────────────
async function recognizeIngredients(buffer, mediaType) {
  const res = await callClaude({
    system: 'Élelmiszer-felismerő asszisztens vagy. Magyarul válaszolsz, kizárólag JSON-nal.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
        { type: 'text', text: 'Milyen élelmiszerek/alapanyagok láthatók a képen? Válasz formátum: {"items": [{"name": "magyar név", "grams": becsült mennyiség grammban vagy null}]}' },
      ],
    }],
    maxTokens: 4000,
    effort: 'low',
  });
  const data = extractJson(textOf(res));
  return Array.isArray(data.items) ? data.items : [];
}

function profileSummary(p, weightKg) {
  return {
    nem: p.sex === 'female' ? 'nő' : 'férfi', kor: p.age, magassag_cm: p.height_cm, testsuly_kg: weightKg, testzsir_szazalek: p.body_fat,
    aktivitas: p.activity_level, tapasztalat: p.experience, heti_edzesnap: p.days_per_week, edzes_perc: p.session_minutes,
    helyszin: p.location === 'gym' ? 'edzőterem' : 'otthon', eszkozok: p.location === 'gym' ? 'teljes edzőtermi felszerelés' : p.equipment,
    cel: p.goal, serulesek: p.injuries, egeszsegugyi_megjegyzes: p.health_notes, allergiak: p.allergies, intoleranciak: p.intolerances,
  };
}

module.exports = { aiEnabled, callClaude, textOf, extractJson, aiWorkoutPlan, aiMealPlan, recognizeIngredients, profileSummary, AiError, MODEL };
