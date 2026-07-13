import { defaultLifeAreas, type LifeArea } from '@studio/domain';
import { VaultUnavailableError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

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
  /** True only when this load safely replaced malformed state with defaults. */
  repaired: boolean;
}

export interface LifeAreaRepository {
  load(): Promise<LifeAreaSnapshot>;
  save(
    areas: readonly LifeAreaPreference[],
    expectedRevision: string | null,
  ): Promise<LifeAreaSnapshot>;
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
  try {
    const value: unknown = JSON.parse(text);
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
      let current: { text: string; hash: string };
      try {
        current = await vault.readText(LIFE_AREA_CONFIG_PATH);
      } catch (error) {
        if (!(error instanceof VaultUnavailableError)) throw error;
        if (await vault.exists(LIFE_AREA_CONFIG_PATH)) throw error;
        return { areas: defaults(), revision: null, repaired: false };
      }

      const areas = parseStored(current.text);
      if (areas !== undefined) {
        return { areas, revision: current.hash, repaired: false };
      }

      const repairedAreas = defaults();
      const repaired = await vault.writeTextAtomic(
        LIFE_AREA_CONFIG_PATH,
        serialize(repairedAreas),
        { expectedHash: current.hash },
      );
      return { areas: repairedAreas, revision: repaired.hash, repaired: true };
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
      return { areas: normalized, revision: saved.hash, repaired: false };
    },
  };
}
