import type { StudioNote } from '@studio/domain';

export function note(overrides: Partial<StudioNote> = {}): StudioNote {
  return {
    schemaVersion: 1,
    id: '01H00000000000000000000000',
    title: 'Calm home',
    body: 'A calm and spacious home.',
    cardType: 'text',
    semanticType: 'vision',
    status: 'active',
    rooms: ['foyer'],
    lifeAreas: ['home'],
    seasons: ['2026-winter'],
    tags: ['calm'],
    created: '2026-07-01T00:00:00.000Z',
    updated: '2026-07-13T00:00:00.000Z',
    attachments: [],
    display: { featured: false },
    privacy: { sensitivity: 'private', aiAccess: 'never' },
    extraFrontmatter: {},
    ...overrides,
  };
}
