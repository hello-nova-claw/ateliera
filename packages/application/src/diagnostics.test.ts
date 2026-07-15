import { describe, expect, it, vi } from 'vitest';

import {
  buildDiagnostics,
  createDiagnosticsRecorder,
  diagnosticsErrorCode,
  prepareDiagnosticsExport,
} from './diagnostics';

const generatedAt = '2026-07-14T03:04:05.000Z';

describe('content-redacted diagnostics', () => {
  it('retains only allowlisted technical metadata', () => {
    const report = buildDiagnostics({
      generatedAt,
      entries: [{
        operation: 'save',
        occurredAt: '2026-07-14T03:03:05.000Z',
        outcome: 'error',
        durationMs: 18.75,
        errorCode: 'vault-conflict',
        fileId: '01J00000000000000000000000',
        fileHash: 'a'.repeat(64),
        itemCount: 1,
        byteCount: 240,
        noteTitle: 'The private hill',
        noteBody: 'private words',
        path: '/Users/anna/Studio/Identity/private.md',
        error: new Error('private words at /Users/anna/Studio'),
        metadata: { title: 'still private' },
      }],
    });

    expect(report).toEqual({
      schemaVersion: 1,
      generatedAt,
      privacy: {
        contentIncluded: false,
        errorMessagesIncluded: false,
        filePathsIncluded: false,
        noteTitlesIncluded: false,
      },
      entries: [{
        operation: 'save',
        occurredAt: '2026-07-14T03:03:05.000Z',
        outcome: 'error',
        durationMs: 18.75,
        errorCode: 'vault-conflict',
        fileId: '01J00000000000000000000000',
        fileHash: 'a'.repeat(64),
        itemCount: 1,
        byteCount: 240,
      }],
    });
    expect(JSON.stringify(report)).not.toMatch(/private|Users|Identity/);
  });

  it('drops malformed or non-allowlisted values instead of reflecting them', () => {
    const report = buildDiagnostics({
      generatedAt,
      entries: [
        {
          operation: 'The private hill',
          occurredAt: 'not-a-date',
          outcome: 'oh no',
          durationMs: -1,
          errorCode: '/Users/anna/private words',
          fileId: 'private words with spaces',
          fileHash: 'not-a-hash',
          itemCount: 1.5,
          byteCount: Number.POSITIVE_INFINITY,
        },
        null,
      ],
    });

    expect(report.entries).toEqual([]);
    expect(JSON.stringify(report)).not.toMatch(/private|Users/);

    const invalidTime = buildDiagnostics({
      generatedAt,
      entries: [{ operation: 'save', occurredAt: 42, outcome: 'ok' }],
    });
    expect(invalidTime.entries).toEqual([]);
  });

  it('never evaluates accessor-backed, inherited, or hostile proxy entry fields', () => {
    const privatePath = '/Users/anna/PRIVATE-diagnostic.md';
    const getter = vi.fn(() => 'save');
    const inherited = Object.create({ operation: 'save' }) as Record<string, unknown>;
    inherited.occurredAt = '2026-07-14T03:03:05.000Z';
    inherited.outcome = 'ok';
    const accessor = {
      get operation() {
        return getter();
      },
      occurredAt: '2026-07-14T03:03:05.000Z',
      outcome: 'ok',
      path: privatePath,
    };
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error(privatePath);
      },
    });

    const report = buildDiagnostics({ generatedAt, entries: [accessor, inherited, hostile] });

    expect(report.entries).toEqual([]);
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain(privatePath);
  });

  it('snapshots top-level data properties without evaluating getters twice', () => {
    const privatePath = '/Users/anna/PRIVATE-generated-at';
    let calls = 0;
    const input = {
      get generatedAt() {
        calls += 1;
        return calls === 1 ? generatedAt : privatePath;
      },
      entries: [],
    };

    expect(() => buildDiagnostics(input)).toThrow('Invalid diagnostics input.');
    expect(calls).toBe(0);
  });

  it('fails closed when report metadata is malformed', () => {
    expect(() => buildDiagnostics(null as never)).toThrow('Invalid diagnostics input.');
    expect(() => buildDiagnostics({ generatedAt: 'private words', entries: [] })).toThrow(
      'Invalid diagnostics input.',
    );
    expect(() => buildDiagnostics({ generatedAt, entries: null as never })).toThrow(
      'Invalid diagnostics input.',
    );
    expect(() => buildDiagnostics({
      generatedAt,
      entries: Array.from({ length: 10_001 }),
    })).toThrow('Invalid diagnostics input.');
    const hostileEntries = new Proxy<unknown[]>([], {
      ownKeys() {
        throw new Error('/Users/anna/PRIVATE-array');
      },
    });
    expect(() => buildDiagnostics({ generatedAt, entries: hostileEntries })).toThrow(
      'Invalid diagnostics input.',
    );
  });

  it('extracts only an own, technical error code and never an error message or stack', () => {
    const coded = Object.assign(new Error('private words at /Users/anna'), {
      code: 'INDEX_STALE',
    });
    const inherited = Object.create({ code: 'INHERITED_PRIVATE_CODE' }) as Error;
    inherited.message = 'private words';

    expect(diagnosticsErrorCode(coded)).toBe('index-stale');
    expect(diagnosticsErrorCode(inherited)).toBe('unexpected-error');
    expect(diagnosticsErrorCode({ code: '/Users/anna/private' })).toBe('unexpected-error');
    expect(diagnosticsErrorCode({ code: 'private_words' })).toBe('unexpected-error');
    expect(diagnosticsErrorCode({ code: 42 })).toBe('unexpected-error');
    expect(diagnosticsErrorCode('private words')).toBe('unexpected-error');
  });

  it('keeps a bounded local chronology and snapshots caller-owned input', () => {
    const recorder = createDiagnosticsRecorder({ maximumEntries: 2 });
    const first = {
      operation: 'save' as const,
      occurredAt: '2026-07-14T03:01:05.000Z',
      outcome: 'ok' as const,
      fileId: '01J00000000000000000000000',
    };

    expect(recorder.record(first)).toBe(true);
    first.fileId = 'MUTATED';
    expect(recorder.entries()).toEqual([{
      operation: 'save',
      occurredAt: '2026-07-14T03:01:05.000Z',
      outcome: 'ok',
      fileId: '01J00000000000000000000000',
    }]);
    expect(recorder.record({
      operation: 'search',
      occurredAt: '2026-07-14T03:02:05.000Z',
      outcome: 'ok',
    })).toBe(true);
    expect(recorder.record({
      operation: 'restore',
      occurredAt: '2026-07-14T03:03:05.000Z',
      outcome: 'error',
    })).toBe(true);
    expect(recorder.record({ operation: 'private words' })).toBe(false);

    expect(recorder.entries()).toEqual([
      {
        operation: 'search',
        occurredAt: '2026-07-14T03:02:05.000Z',
        outcome: 'ok',
      },
      {
        operation: 'restore',
        occurredAt: '2026-07-14T03:03:05.000Z',
        outcome: 'error',
      },
    ]);
    recorder.clear();
    expect(recorder.entries()).toEqual([]);
  });

  it('rejects unsafe retention bounds', () => {
    expect(() => createDiagnosticsRecorder({ maximumEntries: 0 })).toThrow(
      'Invalid diagnostics retention limit.',
    );
    expect(() => createDiagnosticsRecorder({ maximumEntries: 1.5 })).toThrow(
      'Invalid diagnostics retention limit.',
    );
    expect(() => createDiagnosticsRecorder({ maximumEntries: 10_001 })).toThrow(
      'Invalid diagnostics retention limit.',
    );
  });

  it('previews the exact UTF-8 payload that will be exported', () => {
    const prepared = prepareDiagnosticsExport({
      generatedAt,
      entries: [{
        operation: 'backup',
        occurredAt: '2026-07-14T03:03:05.000Z',
        outcome: 'ok',
        durationMs: 42,
        path: '/Users/anna/private.md',
        noteBody: 'private words',
      }],
    });

    expect(prepared.filename).toBe('ateliera-diagnostics-2026-07-14T03-04-05-000Z.json');
    expect(prepared.preview).toBe(prepared.text);
    expect(new TextDecoder().decode(prepared.bytes)).toBe(prepared.preview);
    expect(prepared.byteLength).toBe(prepared.bytes.byteLength);
    expect(prepared.preview.endsWith('\n')).toBe(true);
    expect(JSON.parse(prepared.preview)).toEqual(prepared.report);
    expect(prepared.preview).not.toMatch(/private|Users/);
  });
});
