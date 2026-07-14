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
const maximumDiagnosticEntries = 10_000;

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

type DataProperties = Record<string, PropertyDescriptor>;

function dataProperties(value: unknown): DataProperties | undefined {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    return undefined;
  }
}

function dataValue(properties: DataProperties, key: string): unknown {
  const descriptor = properties[key];
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function snapshotArray(value: unknown): unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const properties = Object.getOwnPropertyDescriptors(value);
    const length = dataValue(properties, 'length');
    if (
      typeof length !== 'number' ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > maximumDiagnosticEntries
    ) return undefined;
    return Array.from({ length }, (_, index) => dataValue(properties, String(index)));
  } catch {
    return undefined;
  }
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
  const properties = dataProperties(input);
  if (properties === undefined) return undefined;
  const operation = dataValue(properties, 'operation');
  const occurredAt = dataValue(properties, 'occurredAt');
  const outcome = dataValue(properties, 'outcome');
  if (
    typeof operation !== 'string' ||
    !diagnosticOperations.has(operation) ||
    !isIsoInstant(occurredAt) ||
    (outcome !== 'ok' && outcome !== 'error')
  ) return undefined;

  const entry: DiagnosticEntry = {
    operation: operation as DiagnosticOperation,
    occurredAt,
    outcome,
  };
  const durationMs = safeMeasure(dataValue(properties, 'durationMs'), false);
  const errorCode = safeTechnicalCode(dataValue(properties, 'errorCode'));
  const fileId = safeIdentifier(dataValue(properties, 'fileId'));
  const fileHash = safeHash(dataValue(properties, 'fileHash'));
  const itemCount = safeMeasure(dataValue(properties, 'itemCount'), true);
  const byteCount = safeMeasure(dataValue(properties, 'byteCount'), true);

  if (durationMs !== undefined) entry.durationMs = durationMs;
  if (errorCode !== undefined) entry.errorCode = errorCode;
  if (fileId !== undefined) entry.fileId = fileId;
  if (fileHash !== undefined) entry.fileHash = fileHash;
  if (itemCount !== undefined) entry.itemCount = itemCount;
  if (byteCount !== undefined) entry.byteCount = byteCount;
  return entry;
}

export function diagnosticsErrorCode(error: unknown): string {
  const properties = dataProperties(error);
  if (properties === undefined) return 'unexpected-error';
  return safeTechnicalCode(dataValue(properties, 'code')) ?? 'unexpected-error';
}

export function buildDiagnostics(input: DiagnosticsInput): DiagnosticsReport {
  const properties = dataProperties(input);
  const generatedAt = properties === undefined ? undefined : dataValue(properties, 'generatedAt');
  const entriesInput = properties === undefined ? undefined : dataValue(properties, 'entries');
  const inputEntries = snapshotArray(entriesInput);
  if (!isIsoInstant(generatedAt) || inputEntries === undefined) {
    throw new Error('Invalid diagnostics input.');
  }
  const entries: DiagnosticEntry[] = [];
  for (const candidate of inputEntries) {
    const entry = sanitizeEntry(candidate);
    if (entry !== undefined) entries.push(entry);
  }
  return {
    schemaVersion: 1,
    generatedAt,
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
    options.maximumEntries > maximumDiagnosticEntries
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
