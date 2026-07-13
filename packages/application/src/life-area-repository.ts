import { defaultLifeAreas, type LifeArea } from '@studio/domain';
import { VaultUnavailableError } from '@studio/storage/portable';
import type { VaultEntry, VaultPort } from '@studio/storage/portable';

export const LIFE_AREA_CONFIG_PATH = '.studio/config/landscape-areas.json';
export const MAX_LIFE_AREAS = 32;

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_ID_LENGTH = 64;
const MAX_TITLE_LENGTH = 100;
const encoder = new TextEncoder();

export interface LifeAreaPreference extends LifeArea {
  hidden: boolean;
  order: number;
}

export interface LifeAreaSnapshot {
  areas: LifeAreaPreference[];
  /** Exact durable content hash, or null when the config file is absent. */
  revision: string | null;
  /** The defaults are a recoverable view; the original bytes remain untouched. */
  repairRequired: boolean;
}

export interface LifeAreaRepository {
  load(): Promise<LifeAreaSnapshot>;
  save(
    areas: readonly LifeAreaPreference[],
    expectedRevision: string | null,
  ): Promise<LifeAreaSnapshot>;
}

export class UnsupportedLifeAreaConfigError extends Error {
  override readonly name = 'UnsupportedLifeAreaConfigError';

  constructor(readonly version: number) {
    super(`Life area configuration version ${version} is newer than this Studio supports.`);
  }
}

interface StoredLifeAreaConfig {
  version: 1;
  areas: LifeAreaPreference[];
}

function defaults(): LifeAreaPreference[] {
  return defaultLifeAreas.map((area, order) => ({
    ...area,
    hidden: order >= 5,
    order,
  }));
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function normalizeAreas(value: unknown): LifeAreaPreference[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LIFE_AREAS) {
    throw new Error(`Life area state must contain between 1 and ${MAX_LIFE_AREAS} areas.`);
  }

  const ids = new Set<string>();
  const titles = new Set<string>();
  const orders = new Set<number>();
  const normalized = value.map((candidate): LifeAreaPreference => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !hasExactKeys(candidate as Record<string, unknown>, [
        'hidden',
        'id',
        'order',
        'title',
      ])
    ) {
      throw new Error('Life area state contains an invalid record.');
    }
    const { hidden, id, order, title } = candidate as Partial<LifeAreaPreference>;
    const normalizedTitle = typeof title === 'string' ? title.trim().normalize('NFC') : '';
    if (
      typeof id !== 'string' ||
      id.length > MAX_ID_LENGTH ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)
    ) {
      throw new Error('Life area IDs must be lowercase slugs of at most 64 characters.');
    }
    if (
      normalizedTitle === '' ||
      Array.from(normalizedTitle).length > MAX_TITLE_LENGTH
    ) {
      throw new Error('Life area titles must contain between 1 and 100 characters.');
    }
    if (typeof hidden !== 'boolean') {
      throw new Error('Life area visibility must be true or false.');
    }
    if (!Number.isInteger(order) || order === undefined || order < 0 || order >= MAX_LIFE_AREAS) {
      throw new Error(`Life area order must be an integer between 0 and ${MAX_LIFE_AREAS - 1}.`);
    }
    const titleKey = normalizedTitle.toLocaleLowerCase('en');
    if (ids.has(id)) throw new Error(`Life area ID "${id}" is duplicated.`);
    if (titles.has(titleKey)) {
      throw new Error(`Life area title "${normalizedTitle}" is duplicated.`);
    }
    if (orders.has(order)) throw new Error(`Life area order ${order} is duplicated.`);
    ids.add(id);
    titles.add(titleKey);
    orders.add(order);
    return { id, title: normalizedTitle, hidden, order };
  });

  return normalized.sort((left, right) => left.order - right.order);
}

function parseStored(text: string): LifeAreaPreference[] | undefined {
  if (encoder.encode(text).byteLength > MAX_CONFIG_BYTES) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { version?: unknown }).version === 'number' &&
    (value as { version: number }).version > 1
  ) {
    throw new UnsupportedLifeAreaConfigError(
      (value as { version: number }).version,
    );
  }
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      !hasExactKeys(value as Record<string, unknown>, ['areas', 'version']) ||
      (value as Partial<StoredLifeAreaConfig>).version !== 1
    ) {
      return undefined;
    }
    return normalizeAreas((value as Partial<StoredLifeAreaConfig>).areas);
  } catch {
    return undefined;
  }
}

function serialize(areas: readonly LifeAreaPreference[]): string {
  return `${JSON.stringify({ version: 1, areas }, null, 2)}\n`;
}

export function createLifeAreaRepository(vault: VaultPort): LifeAreaRepository {
  return {
    async load() {
      let entries: VaultEntry[];
      try {
        entries = await vault.list(LIFE_AREA_CONFIG_PATH);
      } catch (error) {
        if (!(error instanceof VaultUnavailableError)) throw error;
        if (await vault.exists(LIFE_AREA_CONFIG_PATH)) throw error;
        return { areas: defaults(), revision: null, repairRequired: false };
      }
      const entry = entries.find(
        (candidate) => candidate.path === LIFE_AREA_CONFIG_PATH,
      );
      if (entry === undefined) {
        return { areas: defaults(), revision: null, repairRequired: false };
      }
      if (
        entry.kind !== 'file' ||
        entry.size === undefined ||
        entry.contentHash === undefined
      ) {
        throw new VaultUnavailableError('Life area configuration metadata is unavailable.');
      }
      if (entry.size > MAX_CONFIG_BYTES) {
        return {
          areas: defaults(),
          revision: entry.contentHash,
          repairRequired: true,
        };
      }
      let current: { text: string; hash: string };
      try {
        current = await vault.readText(LIFE_AREA_CONFIG_PATH);
      } catch (error) {
        if (!(error instanceof VaultUnavailableError)) throw error;
        if (await vault.exists(LIFE_AREA_CONFIG_PATH)) throw error;
        return { areas: defaults(), revision: null, repairRequired: false };
      }

      const areas = parseStored(current.text);
      if (areas !== undefined) {
        return { areas, revision: current.hash, repairRequired: false };
      }
      return {
        areas: defaults(),
        revision: current.hash,
        repairRequired: true,
      };
    },

    async save(areas, expectedRevision) {
      const normalized = normalizeAreas(areas);
      const saved = await vault.writeTextAtomic(
        LIFE_AREA_CONFIG_PATH,
        serialize(normalized),
        expectedRevision === null
          ? { expectedMissing: true }
          : { expectedHash: expectedRevision },
      );
      return { areas: normalized, revision: saved.hash, repairRequired: false };
    },
  };
}
