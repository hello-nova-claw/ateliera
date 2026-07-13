import type { SqliteDatabase } from './sqlite-driver';

export const INDEX_SCHEMA_VERSION = 1;

export function initializeSchema(database: SqliteDatabase): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, hash TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL, note_json TEXT NOT NULL,
      card_type TEXT NOT NULL, semantic_type TEXT NOT NULL, status TEXT NOT NULL,
      created TEXT NOT NULL, updated TEXT NOT NULL, source_text TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
      id UNINDEXED, title, body, tags, source, tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS tags (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS note_tags (note_id TEXT NOT NULL, tag TEXT NOT NULL,
      PRIMARY KEY (note_id, tag), FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS life_areas (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS note_life_areas (note_id TEXT NOT NULL, life_area TEXT NOT NULL,
      PRIMARY KEY (note_id, life_area), FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS rooms (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS note_rooms (note_id TEXT NOT NULL, room TEXT NOT NULL,
      PRIMARY KEY (note_id, room), FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS seasons (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS note_seasons (note_id TEXT NOT NULL, season TEXT NOT NULL,
      PRIMARY KEY (note_id, season), FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS links (
      source_id TEXT NOT NULL, ordinal INTEGER NOT NULL, kind TEXT NOT NULL,
      target TEXT NOT NULL, label TEXT NOT NULL, target_id TEXT,
      PRIMARY KEY (source_id, ordinal), FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS links_target_id ON links(target_id);
    CREATE TABLE IF NOT EXISTS index_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR REPLACE INTO index_state(key, value) VALUES ('schema_version', '${INDEX_SCHEMA_VERSION}');
  `);
}
