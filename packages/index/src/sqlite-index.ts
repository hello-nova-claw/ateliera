import type { StudioNote } from '@studio/domain';

import type {
  HighlightRange,
  IndexedLink,
  IndexedContent,
  IndexEntry,
  IndexPort,
  IndexRebuildProgress,
  ParsedLink,
  SearchFilters,
  SearchHit,
} from './index-port';
import { initializeSchema } from './schema';
import type { SqlValue, SqliteDatabase } from './sqlite-driver';

interface NoteRow {
  id: string; path: string; hash: string; title: string; body: string;
  note_json: string; rank?: number;
}

interface LinkRow {
  source_id: string; kind: ParsedLink['kind']; target: string; label: string;
  target_id: string | null; source_path?: string;
}

function rows<T>(value: unknown[]): T[] { return value as T[]; }
function row<T>(value: unknown): T | undefined { return value as T | undefined; }

function tokens(query: string): string[] {
  return [...new Set((query.toLocaleLowerCase('en').match(/[\p{L}\p{N}_-]+/gu) ?? []).filter(Boolean))];
}

function ftsQuery(queryTokens: string[]): string {
  return queryTokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ');
}

function makeSnippet(note: NoteRow, queryTokens: string[]): { snippet: string; highlightRanges: HighlightRange[] } {
  const safeTitle = note.title.replace(/<[^>]*>/g, ' ');
  const source = `${safeTitle}. ${note.body}`.replace(/\s+/g, ' ').trim();
  const folded = source.toLocaleLowerCase('en');
  const first = queryTokens.map((token) => folded.indexOf(token)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, first - 60);
  const end = Math.min(source.length, start + 180);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < source.length ? '…' : '';
  const snippet = `${prefix}${source.slice(start, end)}${suffix}`;
  const snippetFolded = snippet.toLocaleLowerCase('en');
  const highlightRanges = queryTokens.flatMap((token) => {
    const matches: HighlightRange[] = [];
    let cursor = 0;
    while (cursor < snippetFolded.length) {
      const match = snippetFolded.indexOf(token, cursor);
      if (match < 0) break;
      matches.push({ start: match, end: match + token.length });
      cursor = match + token.length;
    }
    return matches;
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  return { snippet, highlightRanges };
}

function addListFilter(
  clauses: string[], values: SqlValue[], table: string, column: string, items: readonly string[] | undefined,
): void {
  if (!items?.length) return;
  clauses.push(`EXISTS (SELECT 1 FROM ${table} f WHERE f.note_id = n.id AND f.${column} IN (${items.map(() => '?').join(',')}))`);
  values.push(...items);
}

function normalizePath(path: string): string | null {
  const output: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (output.length === 0) return null;
      output.pop();
    }
    else output.push(segment.normalize('NFC'));
  }
  return output.join('/');
}

function normalizeLinkPath(sourcePath: string, target: string): string | null {
  if (target.startsWith('/')) return null;
  const parent = sourcePath.split('/').slice(0, -1).join('/');
  return normalizePath(`${parent}/${target}`);
}

export class SqliteIndex implements IndexPort {
  constructor(private readonly database: SqliteDatabase) { initializeSchema(database); }

  close(): void { this.database.close(); }

  async upsert(note: StudioNote, path: string, hash: string, content: IndexedContent): Promise<void> {
    this.transaction(() => { this.replace(note, path, hash, content); this.resolveLinks(); this.cleanupDictionaries(); });
  }

  async remove(id: string): Promise<void> {
    this.transaction(() => {
      this.database.prepare('DELETE FROM note_fts WHERE id = ?').run(id);
      this.database.prepare('DELETE FROM notes WHERE id = ?').run(id);
      this.resolveLinks();
      this.cleanupDictionaries();
    });
  }

  async getById(id: string): Promise<{ note: StudioNote; path: string; hash: string } | null> {
    const found = row<NoteRow>(this.database.prepare('SELECT * FROM notes WHERE id = ?').get(id));
    return found ? { note: JSON.parse(found.note_json) as StudioNote, path: found.path, hash: found.hash } : null;
  }

  async search(query: string, filters: SearchFilters = {}): Promise<SearchHit[]> {
    const queryTokens = tokens(query);
    if (query.trim() && queryTokens.length === 0) return [];
    const values: SqlValue[] = [];
    const clauses: string[] = [];
    const from = queryTokens.length
      ? 'notes n JOIN note_fts ON note_fts.id = n.id'
      : 'notes n';
    if (queryTokens.length) { clauses.push('note_fts MATCH ?'); values.push(ftsQuery(queryTokens)); }
    if (filters.semanticTypes?.length) {
      clauses.push(`n.semantic_type IN (${filters.semanticTypes.map(() => '?').join(',')})`);
      values.push(...filters.semanticTypes);
    }
    if (filters.statuses?.length) {
      clauses.push(`n.status IN (${filters.statuses.map(() => '?').join(',')})`);
      values.push(...filters.statuses);
    }
    if (filters.cardTypes?.length) {
      clauses.push(`n.card_type IN (${filters.cardTypes.map(() => '?').join(',')})`);
      values.push(...filters.cardTypes);
    }
    if (filters.dateFrom) { clauses.push('n.updated >= ?'); values.push(filters.dateFrom); }
    if (filters.dateTo) { clauses.push('n.updated <= ?'); values.push(filters.dateTo); }
    addListFilter(clauses, values, 'note_rooms', 'room', filters.rooms);
    addListFilter(clauses, values, 'note_life_areas', 'life_area', filters.lifeAreas);
    addListFilter(clauses, values, 'note_seasons', 'season', filters.seasons);
    addListFilter(clauses, values, 'note_tags', 'tag', filters.tags);
    const rank = queryTokens.length ? 'bm25(note_fts)' : '0';
    const found = rows<NoteRow>(this.database.prepare(`SELECT n.*, ${rank} AS rank FROM ${from}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY rank ASC, n.updated DESC, n.id ASC LIMIT 200`).all(...values));
    return found.map((item) => {
      const snippet = makeSnippet(item, queryTokens);
      const indexedNote = JSON.parse(item.note_json) as StudioNote;
      const sourceText = [indexedNote.source?.title, indexedNote.source?.creator, indexedNote.source?.url].filter(Boolean).join(' ');
      const matchContext = snippet.highlightRanges.length === 0
        ? indexedNote.tags.find((tag) => queryTokens.some((token) => tag.toLocaleLowerCase('en').includes(token))) !== undefined
          ? { field: 'tags' as const, text: indexedNote.tags.join(', ') }
          : queryTokens.some((token) => sourceText.toLocaleLowerCase('en').includes(token))
            ? { field: 'source' as const, text: sourceText }
            : undefined
        : undefined;
      return { id: item.id, path: item.path, title: item.title, ...snippet, score: -(item.rank ?? 0), ...(matchContext ? { matchContext } : {}) };
    });
  }

  async backlinks(id: string): Promise<string[]> {
    return rows<{ source_id: string }>(this.database.prepare('SELECT DISTINCT source_id FROM links WHERE target_id = ? ORDER BY source_id').all(id)).map((item) => item.source_id);
  }

  async forwardLinks(id: string): Promise<IndexedLink[]> {
    return rows<LinkRow>(this.database.prepare('SELECT source_id, kind, target, label, target_id FROM links WHERE source_id = ? ORDER BY ordinal').all(id)).map((item) => {
      const candidates = item.kind === 'wiki' && !item.target_id
        ? rows<{ id: string }>(this.database.prepare('SELECT id FROM notes WHERE lower(title) = lower(?) ORDER BY id').all(item.target)).map((candidate) => candidate.id)
        : [];
      return {
        sourceId: item.source_id, kind: item.kind, target: item.target, label: item.label,
        ...(item.target_id ? { targetId: item.target_id } : {}),
        ...(candidates.length > 1 ? { candidateIds: candidates } : {}),
      };
    });
  }

  async rebuild(entries: IndexEntry[], onProgress?: (progress: IndexRebuildProgress) => void): Promise<void> {
    const ordered = [...entries].sort((left, right) => left.path.localeCompare(right.path, 'en'));
    this.transaction(() => {
      this.deleteAll();
      onProgress?.({ phase: 'indexing', processed: 0, total: ordered.length });
      for (const [position, entry] of ordered.entries()) {
        this.replace(entry.note, entry.path, entry.hash, entry.content);
        onProgress?.({ phase: 'indexing', processed: position + 1, total: ordered.length });
      }
      this.resolveLinks();
      this.database.prepare("INSERT OR REPLACE INTO index_state(key, value) VALUES ('rebuilt_at', ?)").run(new Date().toISOString());
      onProgress?.({ phase: 'committing', processed: ordered.length, total: ordered.length });
    });
  }

  async clear(): Promise<void> { this.transaction(() => this.deleteAll()); }

  private replace(note: StudioNote, path: string, hash: string, content: IndexedContent): void {
    this.database.prepare('DELETE FROM note_fts WHERE id = ?').run(note.id);
    this.database.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
    const title = note.title ?? '';
    const sourceText = [note.source?.title, note.source?.creator, note.source?.url].filter(Boolean).join(' ');
    this.database.prepare(`INSERT INTO notes(id,path,hash,title,body,note_json,card_type,semantic_type,status,created,updated,source_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(note.id, path, hash, title, content.searchText, JSON.stringify(note), note.cardType, note.semanticType, note.status, note.created, note.updated, sourceText);
    this.database.prepare('INSERT INTO note_fts(id,title,body,tags,source) VALUES (?,?,?,?,?)').run(note.id, title, content.searchText, note.tags.join(' '), sourceText);
    this.insertMany('tags', 'note_tags', 'tag', note.id, note.tags);
    this.insertMany('life_areas', 'note_life_areas', 'life_area', note.id, note.lifeAreas);
    this.insertMany('rooms', 'note_rooms', 'room', note.id, note.rooms);
    this.insertMany('seasons', 'note_seasons', 'season', note.id, note.seasons);
    const statement = this.database.prepare('INSERT INTO links(source_id,ordinal,kind,target,label,target_id) VALUES (?,?,?,?,?,NULL)');
    content.links.forEach((link, ordinal) => statement.run(note.id, ordinal, link.kind, link.target, link.label));
  }

  private insertMany(dictionary: string, junction: string, column: string, id: string, values: string[]): void {
    const dictionaryStatement = this.database.prepare(`INSERT OR IGNORE INTO ${dictionary}(name) VALUES (?)`);
    const junctionStatement = this.database.prepare(`INSERT INTO ${junction}(note_id,${column}) VALUES (?,?)`);
    for (const value of [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'))) { dictionaryStatement.run(value); junctionStatement.run(id, value); }
  }

  private resolveLinks(): void {
    const notes = rows<Pick<NoteRow, 'id' | 'path' | 'title'>>(this.database.prepare('SELECT id,path,title FROM notes ORDER BY id').all());
    const byId = new Map(notes.map((note) => [note.id, note.id]));
    const byTitle = new Map<string, string[]>();
    for (const note of notes.filter((item) => item.title)) {
      const key = note.title.normalize('NFC').toLocaleLowerCase('en');
      byTitle.set(key, [...(byTitle.get(key) ?? []), note.id]);
    }
    const byPath = new Map(notes.flatMap((note) => {
      const normalized = normalizePath(note.path);
      return normalized ? [[normalized, note.id] as const] : [];
    }));
    const links = rows<LinkRow>(this.database.prepare('SELECT l.source_id,l.kind,l.target,l.label,l.target_id,n.path AS source_path FROM links l JOIN notes n ON n.id=l.source_id ORDER BY l.source_id,l.ordinal').all());
    const update = this.database.prepare('UPDATE links SET target_id = ? WHERE source_id = ? AND kind = ? AND target = ?');
    for (const link of links) {
      const targetId = link.kind === 'id' ? byId.get(link.target)
        : link.kind === 'wiki' ? (() => {
          const candidates = byTitle.get(link.target.normalize('NFC').toLocaleLowerCase('en')) ?? [];
          return candidates.length === 1 ? candidates[0] : undefined;
        })()
          : (() => {
            const normalized = normalizeLinkPath(link.source_path ?? '', link.target);
            return normalized ? byPath.get(normalized) : undefined;
          })();
      update.run(targetId ?? null, link.source_id, link.kind, link.target);
    }
  }

  private deleteAll(): void {
    this.database.exec('DELETE FROM note_fts; DELETE FROM notes; DELETE FROM tags; DELETE FROM life_areas; DELETE FROM rooms; DELETE FROM seasons; DELETE FROM links;');
  }

  private cleanupDictionaries(): void {
    this.database.exec(`
      DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE note_tags.tag = tags.name);
      DELETE FROM life_areas WHERE NOT EXISTS (SELECT 1 FROM note_life_areas WHERE note_life_areas.life_area = life_areas.name);
      DELETE FROM rooms WHERE NOT EXISTS (SELECT 1 FROM note_rooms WHERE note_rooms.room = rooms.name);
      DELETE FROM seasons WHERE NOT EXISTS (SELECT 1 FROM note_seasons WHERE note_seasons.season = seasons.name);
    `);
  }

  private transaction(operation: () => void): void {
    this.database.exec('BEGIN IMMEDIATE');
    try { operation(); this.database.exec('COMMIT'); }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}

export function createSqliteIndex(database: SqliteDatabase): SqliteIndex { return new SqliteIndex(database); }
