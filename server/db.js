// Adatbázis réteg — a Node.js beépített SQLite moduljával (node:sqlite).
// Minden tábla a felhasználóhoz (user_id) kötött, így minden adat privát.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'fitcoach.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Személyes adatok + étkezési preferenciák (1 sor / felhasználó)
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  onboarded INTEGER NOT NULL DEFAULT 0,
  sex TEXT, age INTEGER, height_cm REAL, weight_kg REAL, body_fat REAL,
  activity_level TEXT, experience TEXT,
  days_per_week INTEGER, session_minutes INTEGER,
  location TEXT, equipment TEXT DEFAULT '[]',
  goal TEXT,
  injuries TEXT DEFAULT '[]', health_notes TEXT DEFAULT '',
  allergies TEXT DEFAULT '[]', intolerances TEXT DEFAULT '[]',
  likes TEXT DEFAULT '', dislikes TEXT DEFAULT '',
  daily_budget INTEGER, meals_per_day INTEGER DEFAULT 4, cook_minutes INTEGER DEFAULT 30,
  kcal_adjust INTEGER NOT NULL DEFAULT 0,      -- az adaptív motor által javasolt és elfogadott korrekció
  updated_at TEXT
);

-- Alapanyagok: otthon lévő ('home') vagy rendszeresen beszerezhető ('buyable')
CREATE TABLE IF NOT EXISTS pantry_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  food_key TEXT,
  availability TEXT NOT NULL DEFAULT 'home',
  quantity_g REAL,
  kcal REAL, protein REAL, carbs REAL, fat REAL,  -- 100 g-ra, csak egyedi alapanyagnál
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workout_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  plan_day INTEGER,
  duration_min INTEGER,
  cardio_type TEXT, cardio_min REAL, cardio_km REAL, cardio_kcal REAL,
  notes TEXT DEFAULT '',
  photo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL,
  set_no INTEGER NOT NULL,
  weight_kg REAL, reps INTEGER
);

CREATE TABLE IF NOT EXISTS body_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight_kg REAL, body_fat REAL,
  waist_cm REAL, chest_cm REAL, arm_cm REAL, hip_cm REAL, thigh_cm REAL
);

-- Napi étrend: egy sor / nap, a 'data' JSON tartalmazza az étkezéseket
CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);

-- Ténylegesen elfogyasztott ételek (ebből számoljuk a napi bevitelt)
CREATE TABLE IF NOT EXISTS food_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  slot TEXT,
  name TEXT NOT NULL,
  grams REAL,
  kcal REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0,
  plan_meal INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS water_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ml INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  food_key TEXT,
  quantity_g REAL,
  est_price INTEGER,
  for_meals TEXT DEFAULT '',
  checked INTEGER NOT NULL DEFAULT 0,
  custom INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_user_date ON workout_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_food_user_date ON food_log(user_id, date);
CREATE INDEX IF NOT EXISTS idx_metrics_user_date ON body_metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_water_user_date ON water_log(user_id, date);
`);

// Kis segédfüggvények, hogy a route-okban rövidebb legyen a kód
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, all, get, run, transaction, DATA_DIR };
