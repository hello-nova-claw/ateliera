import {
  editableMarkdownLinks,
  extractLinks,
  inspectRepairSource,
  markdownToPlainText,
  parseNote,
  recognizedFrontmatterKeys,
  rewriteMarkdownLink,
  serializeNote,
} from '@studio/content';
import type { EditableMarkdownLink, MarkdownLinkEdit } from '@studio/content';
import type { ParseError, StudioNote } from '@studio/domain';
import type {
  IndexedLink,
  IndexedNoteRecord,
  SearchFacets,
  SearchFilters,
  SearchHit,
  IndexPort,
} from '@studio/index';
import { VaultConflictError, createRevisionStore } from '@studio/storage/portable';
import type { RevisionStore, VaultPort } from '@studio/storage/portable';

const MAX_QUERY_LENGTH = 512;
const MAX_FILTER_VALUES = 100;
const MAX_FILTER_VALUE_LENGTH = 256;
const MAX_NOTE_ID_LENGTH = 128;
const MAX_PATH_LENGTH = 1_024;
export const MAX_REPAIR_SOURCE_BYTES = 8 * 1_024 * 1_024;
const UNSAFE_NOTE_ID = new RegExp(String.raw`[\u0000-\u001f\u007f-\u009f/\\?#]`, 'u');
const SHA256 = /^[a-f0-9]{64}$/u;

interface CanonicalDocument {
  note: StudioNote;
  path: string;
  hash: string;
  text: string;
  duplicate: boolean;
}

export interface SearchNoteReference {
  id: string;
  path: string;
  title: string;
}

export interface InspectedForwardLink {
  occurrence: number;
  linkKind: EditableMarkdownLink['kind'];
  target: string;
  label: string;
  start: number;
  end: number;
  state: 'resolved' | 'broken' | 'ambiguous';
  targetId?: string;
  candidateIds?: string[];
}

export interface StudioSearchInspection {
  note: StudioNote;
  path: string;
  hash: string;
  backlinks: SearchNoteReference[];
  forwardLinks: InspectedForwardLink[];
}

export interface MetadataRepairItem {
  kind: 'metadata';
  path: string;
  hash: string;
  sourceText: string;
  errors: ParseError[];
  rawBody: string;
}

export interface BrokenLinkRepairItem {
  kind: 'broken-link';
  occurrence: number;
  linkKind: EditableMarkdownLink['kind'];
  target: string;
  label: string;
  start: number;
  end: number;
  path: string;
  hash: string;
  sourceText: string;
  noteId: string;
  state: 'broken' | 'ambiguous';
  candidateIds?: string[];
}

export type StudioSearchRepairItem = MetadataRepairItem | BrokenLinkRepairItem;

export interface RepairMetadataInput {
  path: string;
  expectedHash: string;
  sourceText: string;
  metadata: StudioNote;
}

export interface RepairLinkInput {
  path: string;
  expectedHash: string;
  sourceText: string;
  occurrence: number;
  edit: MarkdownLinkEdit;
}

export interface SearchRepairResult {
  note: StudioNote;
  path: string;
  hash: string;
}

export interface StudioSearchService {
  search(query: string, filters?: SearchFilters): Promise<SearchHit[]>;
  searchFacets(query: string, filters?: SearchFilters): Promise<SearchFacets>;
  inspect(id: string): Promise<StudioSearchInspection | null>;
  repairQueue(): Promise<StudioSearchRepairItem[]>;
  repairMetadata(input: RepairMetadataInput): Promise<SearchRepairResult>;
  repairLink(input: RepairLinkInput): Promise<SearchRepairResult>;
}

export interface StudioSearchServiceDependencies {
  vault: VaultPort;
  index: IndexPort;
  revisions?: RevisionStore;
}

export class SearchRepairConflictError extends Error {
  override readonly name = 'SearchRepairConflictError';

  constructor(
    readonly attemptedText: string,
    readonly durableText: string,
    options?: ErrorOptions,
  ) {
    super('This note changed elsewhere. Both versions have been preserved for review.', options);
  }
}

function validateQuery(query: string): string {
  if (query.length > MAX_QUERY_LENGTH) {
    throw new RangeError(`Search queries must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  }
  return query.trim();
}

function validateFilters(filters: SearchFilters | undefined): void {
  if (!filters) return;
  for (const value of Object.values(filters)) {
    if (!Array.isArray(value)) continue;
    if (value.length > MAX_FILTER_VALUES) {
      throw new RangeError(`Search filters may contain at most ${MAX_FILTER_VALUES} values.`);
    }
    if (value.some((item) => typeof item !== 'string' || item.length > MAX_FILTER_VALUE_LENGTH)) {
      throw new RangeError(`Search filter values must be ${MAX_FILTER_VALUE_LENGTH} characters or fewer.`);
    }
  }
}

function validateId(id: string): void {
  if (
    id === '' || id.length > MAX_NOTE_ID_LENGTH || id !== id.trim() ||
    id !== id.normalize('NFC') || UNSAFE_NOTE_ID.test(id)
  ) throw new RangeError('A safe note ID is required.');
}

function validatePath(path: string): void {
  if (
    path === '' || path.length > MAX_PATH_LENGTH || path !== path.trim() ||
    path !== path.normalize('NFC') || path.startsWith('/') || path.endsWith('/') ||
    path.includes('\\') || path.includes('\0') || /^[A-Za-z]:/u.test(path) ||
    path.split('/').some((segment) => {
      const folded = segment.toLocaleLowerCase('en');
      return segment === '' || segment === '.' || segment === '..' ||
        folded === '.studio' || folded.startsWith('.studio-');
    })
  ) throw new RangeError('A safe vault path is required.');
}

function isMarkdownPath(path: string): boolean {
  return path.toLocaleLowerCase('en').endsWith('.md') &&
    !path.toLocaleLowerCase('en').startsWith('.studio/');
}

function title(note: StudioNote): string {
  return note.title?.trim() || 'Untitled';
}

function normalizePath(path: string): string | null {
  const output: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (output.length === 0) return null;
      output.pop();
    } else output.push(segment.normalize('NFC'));
  }
  return output.join('/');
}

function targetPath(sourcePath: string, target: string): string | null {
  if (target.startsWith('/')) return null;
  const parent = sourcePath.split('/').slice(0, -1).join('/');
  return normalizePath(`${parent}/${target}`);
}

interface ScanResult {
  documents: CanonicalDocument[];
  metadata: MetadataRepairItem[];
}

async function scanVault(vault: VaultPort): Promise<ScanResult> {
  const paths = (await vault.list())
    .filter((entry) => entry.kind === 'file' && isMarkdownPath(entry.path))
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const documents: CanonicalDocument[] = [];
  const metadata: MetadataRepairItem[] = [];
  const canonicalIds = new Map<string, string>();
  for (const path of paths) {
    const file = await vault.readText(path);
    const parsed = parseNote(file.text);
    if (!parsed.ok) {
      metadata.push({
        kind: 'metadata', path, hash: file.hash, sourceText: file.text,
        errors: parsed.errors, rawBody: parsed.rawBody,
      });
      continue;
    }
    const canonicalPath = canonicalIds.get(parsed.note.id);
    const duplicate = canonicalPath !== undefined;
    if (!duplicate) canonicalIds.set(parsed.note.id, path);
    else {
      metadata.push({
        kind: 'metadata', path, hash: file.hash, sourceText: file.text,
        errors: [{
          code: 'invalid-frontmatter', path: 'id',
          message: `Duplicate stable note ID "${parsed.note.id}"; the canonical note is ${canonicalPath}.`,
        }],
        rawBody: parsed.note.body,
      });
    }
    documents.push({ note: parsed.note, path, hash: file.hash, text: file.text, duplicate });
  }
  return { documents, metadata };
}

type LinkResolution =
  | { state: 'resolved'; targetId: string }
  | { state: 'broken' }
  | { state: 'ambiguous'; candidateIds: string[] };

interface Resolver {
  resolve(sourcePath: string, link: EditableMarkdownLink): LinkResolution;
}

function createResolver(documents: CanonicalDocument[]): Resolver {
  const canonical = documents.filter((document) => !document.duplicate);
  const byId = new Map<string, string[]>();
  const byTitle = new Map<string, string[]>();
  const byPath = new Map<string, string[]>();
  for (const document of documents) {
    byId.set(document.note.id, [...(byId.get(document.note.id) ?? []), document.note.id]);
  }
  for (const document of canonical) {
    if (document.note.title) {
      const key = document.note.title.normalize('NFC').toLocaleLowerCase('en');
      byTitle.set(key, [...(byTitle.get(key) ?? []), document.note.id]);
    }
    const normalized = normalizePath(document.path);
    if (normalized) byPath.set(normalized, [...(byPath.get(normalized) ?? []), document.note.id]);
  }
  return {
    resolve(sourcePath, link) {
      const candidates = link.kind === 'id'
        ? byId.get(link.target) ?? []
        : link.kind === 'wiki'
          ? byTitle.get(link.target.normalize('NFC').toLocaleLowerCase('en')) ?? []
          : byPath.get(targetPath(sourcePath, link.target) ?? '') ?? [];
      const distinct = [...new Set(candidates)].sort((left, right) => left.localeCompare(right, 'en'));
      if (link.kind === 'id' && candidates.length > 1) {
        return { state: 'ambiguous', candidateIds: distinct };
      }
      if (distinct.length === 1) return { state: 'resolved', targetId: distinct[0]! };
      if (distinct.length > 1) return { state: 'ambiguous', candidateIds: distinct };
      return { state: 'broken' };
    },
  };
}

function inspectionFromDocuments(
  documents: CanonicalDocument[],
  id: string,
): StudioSearchInspection | null {
  const canonical = documents.find((document) => !document.duplicate && document.note.id === id);
  if (!canonical) return null;
  const resolver = createResolver(documents);
  const forwardLinks = editableMarkdownLinks(canonical.note.body).map((link) => ({
    occurrence: link.index, linkKind: link.kind, target: link.target,
    label: link.label, start: link.start, end: link.end,
    ...resolver.resolve(canonical.path, link),
  }));
  const backlinks = documents
    .filter((document) => !document.duplicate && document.note.id !== id)
    .filter((document) => editableMarkdownLinks(document.note.body).some((link) => {
      const resolution = resolver.resolve(document.path, link);
      return resolution.state === 'resolved' && resolution.targetId === id;
    }))
    .map((document) => ({
      id: document.note.id, path: document.path, title: title(document.note),
    }))
    .sort((left, right) => left.title.localeCompare(right.title, 'en') || left.id.localeCompare(right.id, 'en'));
  return {
    note: canonical.note, path: canonical.path, hash: canonical.hash,
    backlinks, forwardLinks,
  };
}

function indexedLinksMatchSource(
  sourceLinks: EditableMarkdownLink[],
  indexedLinks: IndexedLink[],
): boolean {
  const identity = (link: Pick<EditableMarkdownLink, 'kind' | 'target' | 'label'>) =>
    `${link.kind}\u0000${link.target}\u0000${link.label}`;
  return sourceLinks.length === indexedLinks.length && sourceLinks.every((source, position) => {
    return identity(source) === identity(indexedLinks[position]!);
  });
}

function distinctIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function warmInspection(
  source: IndexedNoteRecord,
  note: StudioNote,
  sourceLinks: EditableMarkdownLink[],
  indexedLinks: IndexedLink[],
  backlinkIds: string[],
  related: IndexedNoteRecord[],
): StudioSearchInspection | null {
  if (!indexedLinksMatchSource(sourceLinks, indexedLinks)) return null;
  const backlinkIdList = distinctIds(backlinkIds).filter((id) => id !== note.id);
  const expectedRelatedIds = distinctIds([
    ...backlinkIdList,
    ...indexedLinks.flatMap((link) => [
      ...(link.targetId ? [link.targetId] : []),
      ...(link.candidateIds ?? []),
    ]),
  ]);
  const relatedById = new Map(related.map((record) => [record.note.id, record]));
  if (expectedRelatedIds.some((id) => !relatedById.has(id))) return null;
  const backlinks = backlinkIdList
    .map((id) => {
      const record = relatedById.get(id)!;
      return { id, path: record.path, title: title(record.note) };
    })
    .sort((left, right) => left.title.localeCompare(right.title, 'en') || left.id.localeCompare(right.id, 'en'));
  const forwardLinks = sourceLinks.map((link, position): InspectedForwardLink => {
    const indexed = indexedLinks[position]!;
    const base = {
      occurrence: link.index, linkKind: link.kind, target: link.target,
      label: link.label, start: link.start, end: link.end,
    };
    if (indexed.targetId) return { ...base, state: 'resolved', targetId: indexed.targetId };
    const candidateIds = distinctIds(indexed.candidateIds ?? [])
      .sort((left, right) => left.localeCompare(right, 'en'));
    return candidateIds.length > 1
      ? { ...base, state: 'ambiguous', candidateIds }
      : { ...base, state: 'broken' };
  });
  return {
    note, path: source.path, hash: source.hash, backlinks, forwardLinks,
  };
}

function safeExtraFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const recognized = new Set<string>(recognizedFrontmatterKeys);
  return Object.fromEntries(Object.entries(frontmatter).filter(([key]) => !recognized.has(key)));
}

function sourceAttachments(frontmatter: Record<string, unknown>, fallback: string[]): string[] {
  const attachments = frontmatter.attachments;
  return Array.isArray(attachments) && attachments.every((item) => typeof item === 'string')
    ? [...attachments]
    : fallback;
}

function assertValidRepair(note: StudioNote): string {
  const text = serializeNote(note);
  const parsed = parseNote(text);
  if (!parsed.ok) throw new Error('The repaired metadata is still invalid.');
  return text;
}

async function validateRepairSource(sourceText: string, expectedHash: string): Promise<void> {
  if (!SHA256.test(expectedHash)) throw new RangeError('The expected revision must be a SHA-256 hash.');
  if (sourceText.length > MAX_REPAIR_SOURCE_BYTES) {
    throw new RangeError('This note is too large to repair in the inspector.');
  }
  const bytes = new TextEncoder().encode(sourceText);
  if (bytes.byteLength > MAX_REPAIR_SOURCE_BYTES) {
    throw new RangeError('This note is too large to repair in the inspector.');
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
  const actual = [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expectedHash) {
    throw new RangeError('The displayed source does not match its expected revision. Refresh before repairing.');
  }
}

function repairOccurrence(item: StudioSearchRepairItem): number {
  return item.kind === 'broken-link' ? item.occurrence : -1;
}

export function createStudioSearchService({
  vault,
  index,
  revisions = createRevisionStore(vault),
}: StudioSearchServiceDependencies): StudioSearchService {
  const publishRepair = async (path: string, expectedHash: string, attemptedText: string) => {
    const current = await vault.readText(path);
    if (current.hash !== expectedHash) {
      throw new SearchRepairConflictError(attemptedText, current.text);
    }
    await revisions.create('conflict-resolution', [path]);
    try {
      return await vault.writeTextAtomic(path, attemptedText, { expectedHash });
    } catch (error) {
      if (!(error instanceof VaultConflictError)) throw error;
      let durableText = '';
      try { durableText = (await vault.readText(path)).text; } catch { /* attempted text remains available */ }
      throw new SearchRepairConflictError(attemptedText, durableText, { cause: error });
    }
  };

  const updateIndex = async (note: StudioNote, path: string, hash: string): Promise<void> => {
    try {
      await index.upsert(note, path, hash, {
        links: extractLinks(note.body),
        searchText: markdownToPlainText(note.body),
      });
    } catch {
      // The durable Markdown repair succeeded; the disposable index may rebuild later.
    }
  };

  return {
    async search(query, filters) {
      const validated = validateQuery(query);
      validateFilters(filters);
      return index.search(validated, filters);
    },
    async searchFacets(query, filters) {
      const validated = validateQuery(query);
      validateFilters(filters);
      return index.facets(validated, filters);
    },
    async inspect(id) {
      validateId(id);
      try {
        const indexed = await index.getById(id);
        if (indexed?.note.id === id) {
          const file = await vault.readText(indexed.path);
          const parsed = parseNote(file.text);
          if (file.hash === indexed.hash && parsed.ok && parsed.note.id === id) {
            const sourceLinks = editableMarkdownLinks(parsed.note.body);
            const [backlinkIds, indexedLinks] = await Promise.all([
              index.backlinks(id), index.forwardLinks(id),
            ]);
            const relatedIds = distinctIds([
              ...distinctIds(backlinkIds).filter((backlinkId) => backlinkId !== id),
              ...indexedLinks.flatMap((link) => [
                ...(link.targetId ? [link.targetId] : []),
                ...(link.candidateIds ?? []),
              ]),
            ]);
            const related = await index.getManyById(relatedIds);
            const inspection = warmInspection(
              indexed, parsed.note, sourceLinks, indexedLinks, backlinkIds, related,
            );
            if (inspection) return inspection;
          }
        }
      } catch {
        // A disposable index can be missing or stale; canonical Markdown remains authoritative.
      }
      return inspectionFromDocuments((await scanVault(vault)).documents, id);
    },
    async repairQueue() {
      const { documents, metadata } = await scanVault(vault);
      const resolver = createResolver(documents);
      const broken = documents.flatMap((document): BrokenLinkRepairItem[] =>
        editableMarkdownLinks(document.note.body).flatMap((link) => {
          const resolution = resolver.resolve(document.path, link);
          if (resolution.state === 'resolved') return [];
          return [{
            kind: 'broken-link', path: document.path, hash: document.hash,
            sourceText: document.text, noteId: document.note.id,
            occurrence: link.index, linkKind: link.kind, target: link.target,
            label: link.label, start: link.start, end: link.end, ...resolution,
          }];
        }),
      );
      return [...metadata, ...broken].sort((left, right) => {
        const occurrenceOrder = repairOccurrence(left) - repairOccurrence(right);
        return left.path.localeCompare(right.path, 'en') ||
          left.kind.localeCompare(right.kind, 'en') || occurrenceOrder;
      });
    },
    async repairMetadata(input) {
      validatePath(input.path);
      await validateRepairSource(input.sourceText, input.expectedHash);
      const source = inspectRepairSource(input.sourceText);
      const note: StudioNote = {
        ...input.metadata,
        body: source.body,
        lineEnding: source.lineEnding,
        attachments: sourceAttachments(source.frontmatter, input.metadata.attachments),
        extraFrontmatter: safeExtraFrontmatter(source.frontmatter),
      };
      const attemptedText = assertValidRepair(note);
      const written = await publishRepair(input.path, input.expectedHash, attemptedText);
      await updateIndex(note, input.path, written.hash);
      return { note, path: input.path, hash: written.hash };
    },
    async repairLink(input) {
      validatePath(input.path);
      if (!Number.isSafeInteger(input.occurrence) || input.occurrence < 0) {
        throw new RangeError('A non-negative link occurrence is required.');
      }
      await validateRepairSource(input.sourceText, input.expectedHash);
      const parsed = parseNote(input.sourceText);
      if (!parsed.ok) throw new Error('Repair the note metadata before repairing its links.');
      const note: StudioNote = {
        ...parsed.note,
        body: rewriteMarkdownLink(parsed.note.body, input.occurrence, input.edit),
      };
      const attemptedText = assertValidRepair(note);
      const written = await publishRepair(input.path, input.expectedHash, attemptedText);
      await updateIndex(note, input.path, written.hash);
      return { note, path: input.path, hash: written.hash };
    },
  };
}
