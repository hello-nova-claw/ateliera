import type { ParseError, ParseWarning, StudioNote } from '@studio/domain';
import { isAlias, parseDocument, visit } from 'yaml';
import {
  frontmatterSchema,
  recognizedFrontmatterKeys,
} from './frontmatter-schema';

export type ParseResult =
  | { ok: true; note: StudioNote; warnings: ParseWarning[] }
  | { ok: false; rawBody: string; recoverable: true; errors: ParseError[] };

export interface RepairSourceInspection {
  body: string;
  lineEnding: '\n' | '\r\n';
  frontmatter: Record<string, unknown>;
}

const UNSAFE_REPAIR_KEY = new RegExp(String.raw`[\u0000-\u001f\u007f-\u009f]`, 'u');

function splitDocument(text: string): {
  yaml?: string;
  body: string;
  lineEnding: '\n' | '\r\n';
} {
  const opening = /^(?:\uFEFF)?---(\r?\n)/.exec(text);
  const lineEnding = opening?.[1] === '\r\n' ? '\r\n' : '\n';
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { body: text, lineEnding };
  return {
    yaml: match[1]!,
    body: text.slice(match[0].length),
    lineEnding,
  };
}

function safeRepairValue(value: unknown, depth = 0): unknown {
  if (depth > 16) return undefined;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) return value;
  if (Array.isArray(value)) {
    const items = value.map((item) => safeRepairValue(item, depth + 1));
    return items.some((item) => item === undefined) ? undefined : items;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const safe: Array<[string, unknown]> = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      key.length === 0 || key.length > 128 || key !== key.normalize('NFC') ||
      key === '__proto__' || key === 'prototype' || key === 'constructor' ||
      UNSAFE_REPAIR_KEY.test(key)
    ) return undefined;
    const nested = safeRepairValue(item, depth + 1);
    if (nested === undefined) return undefined;
    safe.push([key, nested]);
  }
  return Object.fromEntries(safe);
}

export function inspectRepairSource(text: string): RepairSourceInspection {
  const split = splitDocument(text);
  if (split.yaml === undefined) {
    return { body: split.body, lineEnding: split.lineEnding, frontmatter: {} };
  }
  const document = parseDocument(split.yaml, { strict: true });
  let usesAlias = false;
  visit(document, (_key, node) => {
    if (isAlias(node)) usesAlias = true;
  });
  if (document.errors.length > 0 || usesAlias) {
    return { body: split.body, lineEnding: split.lineEnding, frontmatter: {} };
  }
  const repaired = safeRepairValue(document.toJS({ maxAliasCount: 0 }));
  return {
    body: split.body,
    lineEnding: split.lineEnding,
    frontmatter:
      typeof repaired === 'object' && repaired !== null && !Array.isArray(repaired)
        ? repaired as Record<string, unknown>
        : {},
  };
}

export function parseNote(text: string): ParseResult {
  const { yaml, body, lineEnding } = splitDocument(text);
  if (yaml === undefined) {
    if (/^(?:\uFEFF)?---(?:\r?\n|$)/.test(text)) {
      return {
        ok: false,
        rawBody: text,
        recoverable: true,
        errors: [
          {
            code: 'malformed-frontmatter',
            message:
              'Frontmatter is unterminated; rawBody contains the complete source because metadata and Markdown cannot be distinguished safely.',
          },
        ],
      };
    }
    return {
      ok: false,
      rawBody: body,
      recoverable: true,
      errors: [
        {
          code: 'missing-frontmatter',
          message: 'A frontmatter block is required.',
        },
      ],
    };
  }

  const document = parseDocument(yaml, { strict: true });
  if (document.errors.length > 0) {
    return {
      ok: false,
      rawBody: body,
      recoverable: true,
      errors: document.errors.map((error) => ({
        code: 'malformed-frontmatter',
        message: error.message,
      })),
    };
  }
  let usesAlias = false;
  visit(document, (_key, node) => {
    if (isAlias(node)) usesAlias = true;
  });
  if (usesAlias) {
    return {
      ok: false,
      rawBody: body,
      recoverable: true,
      errors: [
        { code: 'yaml-alias', message: 'YAML aliases are not supported.' },
      ],
    };
  }
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      rawBody: body,
      recoverable: true,
      errors: [
        {
          code: 'invalid-frontmatter',
          message: 'Frontmatter must be a mapping.',
        },
      ],
    };
  }

  const record = value as Record<string, unknown>;
  const recognized = Object.fromEntries(
    recognizedFrontmatterKeys
      .filter((key) => key in record)
      .map((key) => [key, record[key]]),
  );
  const extraFrontmatter = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) =>
        !(recognizedFrontmatterKeys as readonly string[]).includes(key),
    ),
  );
  const result = frontmatterSchema.safeParse(recognized);
  if (!result.success) {
    return {
      ok: false,
      rawBody: body,
      recoverable: true,
      errors: result.error.issues.map((issue) => ({
        code: 'invalid-frontmatter',
        message: issue.message,
        path: issue.path.join('.'),
      })),
    };
  }
  const data = result.data;
  const note: StudioNote = {
    schemaVersion: data.schema_version,
    id: data.id,
    body,
    cardType: data.card_type,
    semanticType: data.semantic_type,
    status: data.status,
    rooms: data.rooms,
    lifeAreas: data.life_areas,
    seasons: data.seasons,
    tags: data.tags,
    created: data.created,
    updated: data.updated,
    attachments: data.attachments,
    display: { featured: data.display.featured },
    privacy: {
      sensitivity: data.privacy.sensitivity,
      aiAccess: data.privacy.ai_access,
    },
    extraFrontmatter,
    lineEnding,
  };
  if (typeof data.title === 'string') note.title = data.title;
  if (data.landscape_anchor !== undefined)
    note.landscapeAnchor = data.landscape_anchor;
  if (data.source !== undefined) {
    const source: NonNullable<StudioNote['source']> = {};
    if (typeof data.source.title === 'string') source.title = data.source.title;
    if (typeof data.source.creator === 'string')
      source.creator = data.source.creator;
    if (typeof data.source.url === 'string') source.url = data.source.url;
    note.source = source;
  }
  if (typeof data.display.cover === 'string')
    note.display.cover = data.display.cover;
  const warnings = Object.keys(extraFrontmatter).map((path): ParseWarning => ({
    code: 'unknown-frontmatter',
    message: `Unknown frontmatter key: ${path}`,
    path,
  }));
  return { ok: true, note, warnings };
}
