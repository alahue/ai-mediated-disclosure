import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PROMPTS } from './study/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'journal.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    initializeDb();
  }
  return db;
}

export function initializeDb(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  runMigrations();
  seedPrompts();
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      pin TEXT PRIMARY KEY,
      condition_order TEXT,
      current_study_day INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1
    );

    -- Matched daily writing prompt schedule (Appendix A). Seeded from config.
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      entry_index INTEGER NOT NULL,
      prompt_type TEXT NOT NULL,
      text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      user_pin TEXT NOT NULL,
      content TEXT NOT NULL,
      -- Experimental context (entry-linked logging, §7)
      condition TEXT CHECK(condition IN ('private','manual','ai')),
      condition_order TEXT,
      study_day INTEGER,
      entry_index INTEGER,
      prompt_id TEXT,
      write_start_time TEXT,
      write_complete_time TEXT,
      -- Sharing / disclosure (populated in later phases)
      intention TEXT CHECK(intention IN ('support','accountability','perspective','connection')),
      selected_excerpt TEXT,
      modified_content TEXT,
      final_shared_text TEXT,
      mediator_explanation TEXT,
      mediator_warning TEXT,
      ai_action TEXT,
      share_decision TEXT,
      shared INTEGER DEFAULT 0,
      approved INTEGER DEFAULT 0,
      shared_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_pin) REFERENCES users(pin) ON DELETE CASCADE
    );

    -- One row per participant per study-day platform visit.
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_pin TEXT NOT NULL,
      study_day INTEGER NOT NULL,
      condition TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(user_pin, study_day),
      FOREIGN KEY (user_pin) REFERENCES users(pin) ON DELETE CASCADE
    );

    -- Append-only behavioral/event log spine (§7, §8).
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_pin TEXT,
      study_day INTEGER,
      condition TEXT,
      entry_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Entry-/condition-linked survey responses (instruments wired in Phase 4).
    CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY,
      user_pin TEXT NOT NULL,
      entry_id TEXT,
      study_day INTEGER,
      condition TEXT,
      survey_type TEXT NOT NULL,
      item_key TEXT NOT NULL,
      response_value INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_pin) REFERENCES users(pin) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS peer_entries (
      id TEXT PRIMARY KEY,
      target_user_pin TEXT NOT NULL,
      content TEXT NOT NULL,
      intention TEXT CHECK(intention IN ('support','accountability','perspective','connection')),
      responded INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (target_user_pin) REFERENCES users(pin) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS peer_responses (
      id TEXT PRIMARY KEY,
      peer_entry_id TEXT NOT NULL,
      responder_pin TEXT NOT NULL,
      what_i_heard TEXT NOT NULL,
      what_im_wondering TEXT NOT NULL,
      what_i_suggest TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (peer_entry_id) REFERENCES peer_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (responder_pin) REFERENCES users(pin) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS simulated_peer_responses (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL,
      what_i_heard TEXT NOT NULL,
      what_im_wondering TEXT NOT NULL,
      what_i_suggest TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
    );

    -- Rotating peer exchanges (§5, §11). One row per shared entry: the writer's
    -- approved disclosure is routed to a single rotating anonymous responder.
    -- Holds the assignment, the structured response, and response/read timing.
    CREATE TABLE IF NOT EXISTS peer_exchanges (
      id TEXT PRIMARY KEY,
      condition TEXT NOT NULL,
      entry_index INTEGER NOT NULL,
      writer_pin TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      shared_text TEXT NOT NULL,
      intention TEXT,
      responder_pin TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | assigned | responded | missed
      what_i_heard TEXT,
      what_im_wondering TEXT,
      what_i_suggest TEXT,
      assigned_at TEXT,
      responded_at TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (writer_pin) REFERENCES users(pin) ON DELETE CASCADE,
      FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reflection_addendums (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL,
      user_pin TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (user_pin) REFERENCES users(pin) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_pin);
    CREATE INDEX IF NOT EXISTS idx_events_entry ON events(entry_id);
    CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries(user_pin);
    CREATE INDEX IF NOT EXISTS idx_exchanges_writer ON peer_exchanges(writer_pin);
    CREATE INDEX IF NOT EXISTS idx_exchanges_responder ON peer_exchanges(responder_pin);
    CREATE INDEX IF NOT EXISTS idx_exchanges_pool ON peer_exchanges(condition, entry_index, status);
  `);
}

// Idempotent column additions so databases created before the study-platform
// schema upgrade cleanly without losing data.
function runMigrations(): void {
  addColumnIfMissing('users', 'condition_order', 'TEXT');
  addColumnIfMissing('users', 'current_study_day', 'INTEGER DEFAULT 0');

  const journalColumns: Array<[string, string]> = [
    ['condition', 'TEXT'],
    ['condition_order', 'TEXT'],
    ['study_day', 'INTEGER'],
    ['entry_index', 'INTEGER'],
    ['prompt_id', 'TEXT'],
    ['write_start_time', 'TEXT'],
    ['write_complete_time', 'TEXT'],
    ['selected_excerpt', 'TEXT'],
    ['final_shared_text', 'TEXT'],
    ['ai_action', 'TEXT'],
    ['share_decision', 'TEXT'],
    ['shared_at', 'TEXT'],
  ];
  for (const [name, ddl] of journalColumns) {
    addColumnIfMissing('journal_entries', name, ddl);
  }
}

function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// Keep the prompts table in sync with the matched prompt schedule in config.
function seedPrompts(): void {
  const upsert = db.prepare(`
    INSERT INTO prompts (id, entry_index, prompt_type, text)
    VALUES (@id, @entry_index, @prompt_type, @text)
    ON CONFLICT(id) DO UPDATE SET
      entry_index = excluded.entry_index,
      prompt_type = excluded.prompt_type,
      text = excluded.text
  `);
  const tx = db.transaction(() => {
    for (const prompt of PROMPTS) {
      upsert.run(prompt);
    }
  });
  tx();
}
