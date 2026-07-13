import { parseNote, serializeNote } from '@studio/content';
import { describe, expect, it } from 'vitest';

import { StudioSaveConflictError, createStudioService } from './studio-service';
import { RecordingIndex, note, seed } from './test-helpers';

describe('Uncharted and Reflection Garden application behavior', () => {
  it('captures classified notes atomically in human-readable room folders', async () => {
    const vault = await seed([]);
    const service = createStudioService({
      vault,
      index: new RecordingIndex(),
      clock: () => new Date('2026-07-14T01:02:03.000Z'),
      generateId: () => '01UNCHARTEDCAPTURE000000000001',
    });

    const uncharted = await service.capture({
      body: 'What if there were a place for thoughtful retreats?',
      title: 'A thoughtful retreat',
      placement: 'uncharted',
      unchartedHorizon: 'beyond',
    });
    expect(uncharted.note).toMatchObject({
      cardType: 'possibility',
      semanticType: 'uncharted',
      status: 'active',
      rooms: ['uncharted'],
      extraFrontmatter: { beyond_gate: true },
    });
    expect(uncharted.path).toMatch(
      /^Uncharted\/2026-07-14--a-thoughtful-retreat--[a-z0-9]{6}\.md$/,
    );

    const reflection = await service.capture({
      body: 'I returned gently.',
      title: 'A gentle return',
      placement: 'reflection',
    });
    expect(reflection.note).toMatchObject({
      cardType: 'reflection',
      semanticType: 'reflection',
      rooms: ['reflection-garden'],
    });
    expect(reflection.path).toContain('Reflection Garden/Reflections/');

    const celebration = await service.capture({
      body: 'The small morning practice held.',
      title: 'A morning that held',
      placement: 'celebration',
    });
    expect(celebration.note).toMatchObject({
      cardType: 'celebration',
      semanticType: 'celebration',
      rooms: ['reflection-garden'],
    });
    expect(celebration.path).toContain('Reflection Garden/Celebrations/');
  });

  it('invites an Uncharted note into a season by exact-CAS link only', async () => {
    const original = note({
      id: 'possibility',
      cardType: 'possibility',
      semanticType: 'uncharted',
      status: 'active',
      rooms: ['uncharted'],
      seasons: [],
      extraFrontmatter: { beyond_gate: true, unknown_key: 'kept' },
    });
    const vault = await seed([{ path: 'Uncharted/retreat.md', note: original }]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const visible = (await service.projectUncharted()).cards[0]!;

    const linked = await service.inviteUnchartedToSeason({
      path: visible.path,
      expectedHash: visible.hash,
      seasonId: '2026-winter',
    });

    expect(linked.note.seasons).toEqual(['2026-winter']);
    expect(linked.note.semanticType).toBe('uncharted');
    expect(linked.note.cardType).toBe('possibility');
    expect(linked.note.extraFrontmatter).toEqual({
      beyond_gate: true,
      unknown_key: 'kept',
    });
    expect(linked.note.extraFrontmatter).not.toHaveProperty('priority');
  });

  it('preserves the concurrent version when an invitation uses a stale hash', async () => {
    const vault = await seed([
      {
        path: 'Uncharted/retreat.md',
        note: note({
          id: 'possibility',
          cardType: 'possibility',
          semanticType: 'uncharted',
          status: 'active',
          rooms: ['uncharted'],
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const visible = (await service.projectUncharted()).cards[0]!;
    const current = await vault.readText(visible.path);
    const parsed = parseNote(current.text);
    if (!parsed.ok) throw new Error('Expected a valid note.');
    await vault.writeTextAtomic(
      visible.path,
      serializeNote({ ...parsed.note, title: 'Changed elsewhere' }),
      { expectedHash: current.hash },
    );

    await expect(
      service.inviteUnchartedToSeason({
        path: visible.path,
        expectedHash: visible.hash,
        seasonId: '2026-winter',
      }),
    ).rejects.toBeInstanceOf(StudioSaveConflictError);
    const durable = parseNote((await vault.readText(visible.path)).text);
    expect(durable.ok && durable.note.title).toBe('Changed elsewhere');
    expect(durable.ok && durable.note.seasons).toEqual([]);
  });

  it('projects deterministic streams, themes, links, then-and-now and secure image references', async () => {
    const vault = await seed([
      {
        path: 'Reflection Garden/Reflections/now.md',
        note: note({
          id: 'now',
          title: 'Now I return gently',
          cardType: 'reflection',
          semanticType: 'reflection',
          rooms: ['reflection-garden'],
          tags: ['calm', 'returning'],
          lifeAreas: ['family'],
          seasons: ['2026-winter'],
          display: { featured: false, cover: '../../Attachments/morning.png' },
          extraFrontmatter: {
            related_notes: ['identity-1', 'uncharted-1'],
            then_note_id: 'then',
          },
          created: '2026-07-14T08:00:00.000Z',
          updated: '2026-07-14T08:00:00.000Z',
        }),
      },
      {
        path: 'Reflection Garden/Celebrations/then.md',
        note: note({
          id: 'then',
          title: 'Then I needed perfect quiet',
          cardType: 'celebration',
          semanticType: 'celebration',
          rooms: ['reflection-garden'],
          tags: ['calm'],
          created: '2025-07-14T08:00:00.000Z',
          updated: '2025-07-14T08:00:00.000Z',
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const garden = await service.projectReflectionGarden();
    expect(garden.cards.map((card) => card.noteId)).toEqual(['now', 'then']);
    expect(garden.cards[0]).toMatchObject({
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      linkedNoteIds: ['identity-1', 'uncharted-1'],
      lifeAreas: ['family'],
      seasons: ['2026-winter'],
      thenNoteId: 'then',
      coverReference: '../../Attachments/morning.png',
    });
    expect(garden.themes).toEqual([
      { name: 'calm', count: 2 },
      { name: 'returning', count: 1 },
    ]);
  });

  it('adds canonical evidence links once with exact CAS and unknown-key fidelity', async () => {
    const vault = await seed([
      {
        path: 'Reflection Garden/Reflections/note.md',
        note: note({
          id: 'reflection',
          cardType: 'reflection',
          semanticType: 'reflection',
          rooms: ['reflection-garden'],
          lifeAreas: ['family'],
          seasons: ['2026-winter'],
          extraFrontmatter: {
            related_notes: ['identity-1'],
            unknown_key: { preserved: true },
          },
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const card = (await service.projectReflectionGarden()).cards[0]!;

    const linked = await service.linkReflectionEvidence({
      path: card.path,
      expectedHash: card.hash,
      noteIds: ['identity-1', 'uncharted-1', 'uncharted-1'],
      lifeAreas: ['family', 'home', 'home'],
      seasons: ['2026-winter', '2026-spring', '2026-spring'],
    });

    expect(linked.note.lifeAreas).toEqual(['family', 'home']);
    expect(linked.note.seasons).toEqual(['2026-winter', '2026-spring']);
    expect(linked.note.extraFrontmatter).toEqual({
      related_notes: ['identity-1', 'uncharted-1'],
      unknown_key: { preserved: true },
    });
  });

  it('validates room-specific link mutations before writing', async () => {
    const vault = await seed([
      {
        path: 'Uncharted/question.md',
        note: note({
          id: 'question',
          semanticType: 'uncharted',
          rooms: ['uncharted'],
        }),
      },
      {
        path: 'Elsewhere/note.md',
        note: note({ id: 'elsewhere', semanticType: 'vision' }),
      },
      {
        path: 'Reflection Garden/Reflections/empty-links.md',
        note: note({
          id: 'empty-links',
          semanticType: 'reflection',
          rooms: ['reflection-garden'],
          extraFrontmatter: {},
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const uncharted = await service.load('Uncharted/question.md');
    const elsewhere = await service.load('Elsewhere/note.md');
    const reflection = await service.load(
      'Reflection Garden/Reflections/empty-links.md',
    );

    await expect(
      service.inviteUnchartedToSeason({
        path: uncharted.path,
        expectedHash: uncharted.hash,
        seasonId: '   ',
      }),
    ).rejects.toThrow('Choose a season');
    await expect(
      service.inviteUnchartedToSeason({
        path: elsewhere.path,
        expectedHash: elsewhere.hash,
        seasonId: '2026-winter',
      }),
    ).rejects.toThrow('Only an Uncharted');
    await expect(
      service.linkReflectionEvidence({
        path: elsewhere.path,
        expectedHash: elsewhere.hash,
      }),
    ).rejects.toThrow('Evidence links belong');

    const unchangedLinks = await service.linkReflectionEvidence({
      path: reflection.path,
      expectedHash: reflection.hash,
    });
    expect(unchangedLinks.note.extraFrontmatter.related_notes).toEqual([]);
  });

  it('rejects an Uncharted horizon on any other capture shape', async () => {
    const service = createStudioService({
      vault: await seed([]),
      index: new RecordingIndex(),
    });
    await expect(service.capture({
      body: 'Not an Uncharted capture',
      placement: 'reflection',
      unchartedHorizon: 'near',
    })).rejects.toThrow('only classify an Uncharted capture');
    await expect(service.capture({
      body: 'Unknown horizon',
      placement: 'uncharted',
      unchartedHorizon: 'elsewhere' as 'near',
    })).rejects.toThrow('only classify an Uncharted capture');
  });

  it('sorts equally recurring themes by name', async () => {
    const vault = await seed([
      {
        path: 'Reflection Garden/Reflections/themes.md',
        note: note({
          id: 'themes',
          semanticType: 'reflection',
          rooms: ['reflection-garden'],
          tags: ['zest', 'calm'],
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    expect((await service.projectReflectionGarden()).themes).toEqual([
      { name: 'calm', count: 1 },
      { name: 'zest', count: 1 },
    ]);
  });
});
