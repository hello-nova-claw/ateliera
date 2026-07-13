import type { ParseError, ParseWarning, StudioNote } from '@studio/domain';

import type { IndexEntry, IndexPort, ParsedLink, RepairItem } from './index-port';

export interface RebuildVaultEntry { path: string; kind: 'file' | 'directory'; contentHash?: string }
export interface RebuildVault {
  list(prefix?: string): Promise<RebuildVaultEntry[]>;
  readText(path: string): Promise<{ text: string; hash: string }>;
}
export type RebuildParseResult =
  | { ok: true; note: StudioNote; warnings: ParseWarning[] }
  | { ok: false; rawBody: string; recoverable: true; errors: ParseError[] };
export interface RebuildProgress { phase: 'scanning' | 'committing' | 'complete'; processed: number; total: number }

export interface RebuildOptions {
  index: IndexPort;
  vault: RebuildVault;
  parse(text: string): RebuildParseResult;
  extractLinks?(body: string): ParsedLink[];
  onProgress?(progress: RebuildProgress): void;
}

export async function rebuildIndex(options: RebuildOptions): Promise<{ indexed: number; repairs: RepairItem[] }> {
  const paths = (await options.vault.list())
    .filter((entry) => entry.kind === 'file' && entry.path.toLocaleLowerCase('en').endsWith('.md') && !entry.path.startsWith('.studio/'))
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const entries: IndexEntry[] = [];
  const repairs: RepairItem[] = [];
  options.onProgress?.({ phase: 'scanning', processed: 0, total: paths.length });
  for (const [index, path] of paths.entries()) {
    const { text, hash } = await options.vault.readText(path);
    const parsed = options.parse(text);
    if (parsed.ok) entries.push({ note: parsed.note, path, hash, links: options.extractLinks?.(parsed.note.body) ?? [] });
    else repairs.push({ path, errors: parsed.errors, rawBody: parsed.rawBody });
    options.onProgress?.({ phase: 'scanning', processed: index + 1, total: paths.length });
  }
  options.onProgress?.({ phase: 'committing', processed: paths.length, total: paths.length });
  await options.index.rebuild(entries);
  options.onProgress?.({ phase: 'complete', processed: paths.length, total: paths.length });
  return { indexed: entries.length, repairs };
}
