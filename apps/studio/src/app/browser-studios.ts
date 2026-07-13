const registryKey = 'studio:browser-studios';
const activeKey = 'studio:active-browser-studio';

export interface BrowserStudioRecord {
  name: string;
  vaultId: string;
  createdAt: string;
}

function isBrowserStudioRecord(value: unknown): value is BrowserStudioRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BrowserStudioRecord>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.vaultId === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

export function createBrowserStudioRecord(name: string): BrowserStudioRecord {
  const trimmed = name.trim().normalize('NFC');
  if (trimmed.length === 0) throw new Error('Give this Studio a name.');
  if (trimmed.length > 80)
    throw new Error('Studio names must be 80 characters or fewer.');
  return {
    name: trimmed,
    vaultId: `studio:${encodeURIComponent(trimmed.toLocaleLowerCase('en-AU'))}`,
    createdAt: new Date().toISOString(),
  };
}

export function readBrowserStudios(storage: Storage): BrowserStudioRecord[] {
  try {
    const stored = storage.getItem(registryKey);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isBrowserStudioRecord) : [];
  } catch {
    return [];
  }
}

export function registerBrowserStudio(
  storage: Storage,
  record: BrowserStudioRecord,
): void {
  const records = readBrowserStudios(storage);
  if (
    records.some(
      (existing) =>
        existing.name.localeCompare(record.name, undefined, {
          sensitivity: 'accent',
        }) === 0,
    )
  ) {
    throw new Error(`A local Studio named “${record.name}” already exists.`);
  }
  storage.setItem(registryKey, JSON.stringify([...records, record]));
}

export function activateBrowserStudio(storage: Storage, vaultId: string): void {
  if (!readBrowserStudios(storage).some((record) => record.vaultId === vaultId))
    throw new Error('That local Studio is no longer available.');
  storage.setItem(activeKey, vaultId);
}

export function readActiveBrowserStudio(
  storage: Storage,
): BrowserStudioRecord | undefined {
  const active = storage.getItem(activeKey);
  return readBrowserStudios(storage).find(
    (record) => record.vaultId === active,
  );
}
