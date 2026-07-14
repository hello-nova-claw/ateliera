const diagnosticOperationValues = [
  'backup',
  'capture',
  'export',
  'import',
  'index-rebuild',
  'load',
  'media-read',
  'migration',
  'restore',
  'save',
  'search',
  'season-close',
  'watcher',
] as const;
const diagnosticOperations = new Set<string>(diagnosticOperationValues);

const diagnosticErrorCodes = new Set([
  'active-content',
  'archive-too-large',
  'checksum-failed',
  'confirmation-required',
  'index-stale',
  'invalid-frontmatter',
  'invalid-manifest',
  'invalid-path',
  'listener-error',
  'malformed-frontmatter',
  'missing-frontmatter',
  'path-collision',
  'path-escape',
  'recovery-scheduler',
  'revision-limit',
  'source-changed',
  'target-changed',
  'unexpected-error',
  'unknown-frontmatter',
  'unresolved-conflict',
  'vault-conflict',
  'vault-unavailable',
  'yaml-alias',
]);

export type DiagnosticOperation = typeof diagnosticOperationValues[number];

export type DiagnosticOutcome = 'ok' | 'error';

export interface DiagnosticEntry {
  operation: DiagnosticOperation;
  occurredAt: string;
  outcome: DiagnosticOutcome;
  durationMs?: number;
  errorCode?: string;
  fileId?: string;
  fileHash?: string;
  itemCount?: number;
  byteCount?: number;
}

export interface DiagnosticsReport {
  schemaVersion: 1;
  generatedAt: string;
  privacy: {
    contentIncluded: false;
    errorMessagesIncluded: false;
    filePathsIncluded: false;
    noteTitlesIncluded: false;
  };
  entries: DiagnosticEntry[];
}

export interface DiagnosticsInput {
  generatedAt: string;
  entries: readonly unknown[];
}

export interface PreparedDiagnosticsExport {
  filename: string;
  report: DiagnosticsReport;
  /** The exact human-readable payload that will be exported. */
  preview: string;
  /** Alias for consumers that name the exported payload rather than its preview. */
  text: string;
  bytes: Uint8Array;
  byteLength: number;
}

export interface DiagnosticsRecorder {
  record(input: unknown): boolean;
  entries(): DiagnosticEntry[];
  clear(): void;
}

const noteIdPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function safeTechnicalCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return diagnosticErrorCodes.has(normalized) ? normalized : undefined;
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && noteIdPattern.test(value) ? value : undefined;
}

function safeHash(value: unknown): string | undefined {
  return typeof value === 'string' && sha256Pattern.test(value) ? value : undefined;
}

function safeMeasure(value: unknown, integer: boolean): number | undefined {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER ||
    (integer && !Number.isInteger(value))
  ) return undefined;
  return value;
}

function sanitizeEntry(input: unknown): DiagnosticEntry | undefined {
  if (!isRecord(input)) return undefined;
  if (
    typeof input.operation !== 'string' ||
    !diagnosticOperations.has(input.operation) ||
    !isIsoInstant(input.occurredAt) ||
    (input.outcome !== 'ok' && input.outcome !== 'error')
  ) return undefined;

  const entry: DiagnosticEntry = {
    operation: input.operation as DiagnosticOperation,
    occurredAt: input.occurredAt,
    outcome: input.outcome,
  };
  const durationMs = safeMeasure(input.durationMs, false);
  const errorCode = safeTechnicalCode(input.errorCode);
  const fileId = safeIdentifier(input.fileId);
  const fileHash = safeHash(input.fileHash);
  const itemCount = safeMeasure(input.itemCount, true);
  const byteCount = safeMeasure(input.byteCount, true);

  if (durationMs !== undefined) entry.durationMs = durationMs;
  if (errorCode !== undefined) entry.errorCode = errorCode;
  if (fileId !== undefined) entry.fileId = fileId;
  if (fileHash !== undefined) entry.fileHash = fileHash;
  if (itemCount !== undefined) entry.itemCount = itemCount;
  if (byteCount !== undefined) entry.byteCount = byteCount;
  return entry;
}

export function diagnosticsErrorCode(error: unknown): string {
  if (!isRecord(error) || !Object.hasOwn(error, 'code')) return 'unexpected-error';
  return safeTechnicalCode(error.code) ?? 'unexpected-error';
}

export function buildDiagnostics(input: DiagnosticsInput): DiagnosticsReport {
  if (!isIsoInstant(input.generatedAt) || !Array.isArray(input.entries)) {
    throw new Error('Invalid diagnostics input.');
  }
  const entries: DiagnosticEntry[] = [];
  for (const candidate of input.entries) {
    const entry = sanitizeEntry(candidate);
    if (entry !== undefined) entries.push(entry);
  }
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    privacy: {
      contentIncluded: false,
      errorMessagesIncluded: false,
      filePathsIncluded: false,
      noteTitlesIncluded: false,
    },
    entries,
  };
}

export function createDiagnosticsRecorder(
  options: { maximumEntries: number },
): DiagnosticsRecorder {
  if (
    !Number.isSafeInteger(options.maximumEntries) ||
    options.maximumEntries < 1 ||
    options.maximumEntries > 10_000
  ) throw new Error('Invalid diagnostics retention limit.');

  let retained: DiagnosticEntry[] = [];
  return {
    record(input) {
      const entry = sanitizeEntry(input);
      if (entry === undefined) return false;
      retained = [...retained, entry].slice(-options.maximumEntries);
      return true;
    },
    entries() {
      return retained.map((entry) => ({ ...entry }));
    },
    clear() {
      retained = [];
    },
  };
}

function exportFilename(generatedAt: string): string {
  return `the-studio-diagnostics-${generatedAt.replaceAll(':', '-').replace('.', '-')}.json`;
}

export function prepareDiagnosticsExport(input: DiagnosticsInput): PreparedDiagnosticsExport {
  const report = buildDiagnostics(input);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const bytes = new TextEncoder().encode(text);
  return {
    filename: exportFilename(report.generatedAt),
    report,
    preview: text,
    text,
    bytes,
    byteLength: bytes.byteLength,
  };
}
