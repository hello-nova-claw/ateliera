import { defaultWisdomThemes, type WisdomTheme } from '@studio/domain';
import { VaultUnavailableError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

export const WISDOM_THEME_CONFIG_PATH = '.studio/config/wisdom-themes.json';
const MAX_THEMES = 40;
const MAX_CONFIG_BYTES = 64 * 1024;

export interface WisdomThemePreference extends WisdomTheme {
  hidden: boolean;
  order: number;
}

export interface WisdomThemeSnapshot {
  themes: WisdomThemePreference[];
  revision: string | null;
  repairRequired: boolean;
}

export interface WisdomThemeRepository {
  load(): Promise<WisdomThemeSnapshot>;
  save(
    themes: readonly WisdomThemePreference[],
    expectedRevision: string | null,
  ): Promise<WisdomThemeSnapshot>;
}

export class UnsupportedWisdomThemeConfigError extends Error {
  override readonly name = 'UnsupportedWisdomThemeConfigError';

  constructor(readonly version: number) {
    super(`Wisdom Garden settings use newer version ${version}.`);
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function defaults(): WisdomThemePreference[] {
  return defaultWisdomThemes.map((theme, order) => ({
    ...theme,
    hidden: false,
    order,
  }));
}

function normalize(value: unknown): WisdomThemePreference[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_THEMES)
    throw new Error(`Wisdom Garden needs between 1 and ${MAX_THEMES} themes.`);
  const ids = new Set<string>();
  const titles = new Set<string>();
  const orders = new Set<number>();
  const themes = value.map((candidate): WisdomThemePreference => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !hasExactKeys(candidate as Record<string, unknown>, [
        'hidden',
        'id',
        'order',
        'title',
      ])
    )
      throw new Error('A Wisdom theme is invalid.');
    const { hidden, id, order, title } =
      candidate as Partial<WisdomThemePreference>;
    const normalizedTitle =
      typeof title === 'string' ? title.trim().normalize('NFC') : '';
    if (
      typeof id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) ||
      id.length > 64
    )
      throw new Error('Wisdom theme IDs must be short lowercase slugs.');
    if (normalizedTitle === '' || Array.from(normalizedTitle).length > 100)
      throw new Error('Wisdom theme titles must contain 1–100 characters.');
    if (
      typeof hidden !== 'boolean' ||
      !Number.isInteger(order) ||
      order === undefined ||
      order < 0 ||
      order >= MAX_THEMES
    )
      throw new Error(
        `Wisdom theme order must be an integer between 0 and ${MAX_THEMES - 1}.`,
      );
    const titleKey = normalizedTitle.toLocaleLowerCase('en');
    if (ids.has(id) || titles.has(titleKey) || orders.has(order))
      throw new Error(
        'Wisdom themes must have unique IDs, titles, and positions.',
      );
    ids.add(id);
    titles.add(titleKey);
    orders.add(order);
    return { id, title: normalizedTitle, hidden, order };
  });
  return themes.sort((left, right) => left.order - right.order);
}

function parse(text: string): WisdomThemePreference[] | undefined {
  if (new TextEncoder().encode(text).byteLength > MAX_CONFIG_BYTES)
    return undefined;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    typeof stored === 'object' &&
    stored !== null &&
    typeof (stored as { version?: unknown }).version === 'number' &&
    (stored as { version: number }).version > 1
  )
    throw new UnsupportedWisdomThemeConfigError(
      (stored as { version: number }).version,
    );
  try {
    if (
      typeof stored !== 'object' ||
      stored === null ||
      !hasExactKeys(stored as Record<string, unknown>, ['themes', 'version']) ||
      (stored as { version?: unknown }).version !== 1
    )
      return undefined;
    return normalize((stored as { themes?: unknown }).themes);
  } catch {
    return undefined;
  }
}

export function createWisdomThemeRepository(
  vault: VaultPort,
): WisdomThemeRepository {
  return {
    async load() {
      try {
        const current = await vault.readText(WISDOM_THEME_CONFIG_PATH);
        const themes = parse(current.text);
        return themes === undefined
          ? { themes: defaults(), revision: current.hash, repairRequired: true }
          : { themes, revision: current.hash, repairRequired: false };
      } catch (error) {
        if (!(error instanceof VaultUnavailableError)) throw error;
        if (await vault.exists(WISDOM_THEME_CONFIG_PATH)) throw error;
        return { themes: defaults(), revision: null, repairRequired: false };
      }
    },
    async save(themes, expectedRevision) {
      const normalized = normalize(themes);
      const saved = await vault.writeTextAtomic(
        WISDOM_THEME_CONFIG_PATH,
        `${JSON.stringify({ version: 1, themes: normalized }, null, 2)}\n`,
        expectedRevision === null
          ? { expectedMissing: true }
          : { expectedHash: expectedRevision },
      );
      return {
        themes: normalized,
        revision: saved.hash,
        repairRequired: false,
      };
    },
  };
}
