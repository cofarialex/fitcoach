// Profil betöltése és a JSON mezők átalakítása JavaScript objektummá
const { get } = require('../db');

const JSON_FIELDS = ['equipment', 'injuries', 'allergies', 'intolerances'];

const GOALS = {
  muscle_gain: 'Izomtömeg-növelés',
  fat_loss: 'Fogyás',
  recomp: 'Zsírégetés és izommegtartás',
  cut: 'Szálkásítás',
  strength: 'Erőnövelés',
  endurance: 'Állóképesség javítása',
  health: 'Általános egészség és fittség',
};

const ACTIVITY = {
  sedentary: { label: 'Ülő életmód', factor: 1.2 },
  light: { label: 'Enyhén aktív (heti 1–3 mozgás)', factor: 1.375 },
  moderate: { label: 'Mérsékelten aktív (heti 3–5 mozgás)', factor: 1.55 },
  active: { label: 'Nagyon aktív (heti 6–7 mozgás)', factor: 1.725 },
  very_active: { label: 'Extrém aktív (fizikai munka + edzés)', factor: 1.9 },
};

const EXPERIENCE = { beginner: 'Kezdő', intermediate: 'Középhaladó', advanced: 'Haladó' };

function parseProfile(row) {
  if (!row) return null;
  const p = { ...row };
  for (const f of JSON_FIELDS) {
    try {
      p[f] = JSON.parse(row[f] || '[]');
    } catch {
      p[f] = [];
    }
  }
  return p;
}

function getProfile(userId) {
  return parseProfile(get('SELECT * FROM profiles WHERE user_id = ?', userId));
}

// A legfrissebb testsúly: ha van testméret-bejegyzés, azt használjuk, különben a profilban megadottat
function currentWeight(userId, profile) {
  const m = get('SELECT weight_kg FROM body_metrics WHERE user_id = ? AND weight_kg IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1', userId);
  return (m && m.weight_kg) || (profile && profile.weight_kg) || 75;
}

module.exports = { getProfile, parseProfile, currentWeight, GOALS, ACTIVITY, EXPERIENCE, JSON_FIELDS };
