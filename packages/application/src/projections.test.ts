import { describe, expect, it } from 'vitest';

import { createStudioService } from './studio-service';
import { orderedProjection } from './projections';
import { createViewStateRepository } from './view-state';
import { RecordingIndex, note, seed } from './test-helpers';

describe('room projections', () => {
  it('projects a Landscape board once with featured cards, counts, links, and decision horizons', async () => {
    const shared = note({
      id: 'shared',
      title: 'Choose a calmer rhythm',
      lifeAreas: ['home', 'family'],
      landscapeAnchor: 'decisions',
      extraFrontmatter: { decision_horizon: '60d', untouched: 'yes' },
      display: { featured: true },
    });
    const second = note({
      id: 'second',
      title: 'Clear one surface',
      lifeAreas: ['home'],
      landscapeAnchor: 'decisions',
    });
    const vault = await seed([
      { path: 'Landscape/shared.md', note: shared },
      { path: 'Landscape/second.md', note: second },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const board = await service.projectLandscapeBoard(['home', 'family']);
    expect(board.cells).toHaveLength(10);
    expect(
      board.cells.find(
        (cell) => cell.lifeArea === 'home' && cell.anchor === 'decisions',
      ),
    ).toMatchObject({
      featured: { noteId: 'shared', decisionHorizon: '60d' },
      additionalCount: 1,
      noteIds: ['shared', 'second'],
    });
    expect(
      board.cells.find(
        (cell) => cell.lifeArea === 'family' && cell.anchor === 'decisions',
      )?.featured?.noteId,
    ).toBe('shared');
  });

  it('moves or links one canonical Landscape note while preserving unknown metadata', async () => {
    const original = note({
      id: 'move-me',
      lifeAreas: ['home'],
      landscapeAnchor: 'vision',
      extraFrontmatter: { unknown_key: { preserved: true } },
    });
    const vault = await seed([{ path: 'Landscape/move.md', note: original }]);
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const linked = await service.updateLandscapePlacement({
      path: 'Landscape/move.md',
      lifeAreas: ['home', 'family'],
      anchor: 'practices',
    });
    expect(linked.note.lifeAreas).toEqual(['home', 'family']);
    expect(linked.note.landscapeAnchor).toBe('practices');
    expect(linked.note.extraFrontmatter).toEqual({
      unknown_key: { preserved: true },
    });
  });

  it('captures a Landscape note with classification in its only durable write', async () => {
    const vault = await seed([]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const saved = await service.capture({
      body: 'A calm home that supports us',
      landscape: { lifeArea: 'home', anchor: 'vision' },
    });
    expect(saved.note).toMatchObject({
      status: 'active',
      rooms: ['life-landscape'],
      lifeAreas: ['home'],
      landscapeAnchor: 'vision',
      semanticType: 'vision',
    });
  });
  it('projects one canonical note multiple ways without duplication', async () => {
    const shared = note({
      id: 'n1',
      semanticType: 'uncharted',
      rooms: ['uncharted', 'uncharted'],
      lifeAreas: ['business', 'business'],
      landscapeAnchor: 'vision',
    });
    const vault = await seed([{ path: 'Uncharted/a.md', note: shared }]);
    const service = createStudioService({ vault, index: new RecordingIndex() });

    expect(
      (await service.projectRoom('uncharted')).map((item) => item.noteId),
    ).toEqual(['n1']);
    expect(
      (await service.projectLandscape({ lifeArea: 'business' })).map(
        (item) => item.noteId,
      ),
    ).toEqual(['n1']);
    expect(
      (
        await service.projectLandscape({
          lifeArea: 'business',
          anchor: 'vision',
        })
      ).map((item) => item.noteId),
    ).toEqual(['n1']);
  });

  it('isolates corrupted notes, duplicate IDs, archived and trashed items', async () => {
    const vault = await seed([
      { path: 'A/a.md', note: note({ id: 'same', title: 'Canonical' }) },
      { path: 'Z/z.md', note: note({ id: 'same', title: 'Duplicate' }) },
      {
        path: 'Archive/a.md',
        note: note({ id: 'archived', status: 'archived' }),
      },
      { path: 'Trash/t.md', note: note({ id: 'trashed', status: 'trashed' }) },
    ]);
    await vault.writeTextAtomic(
      'Broken/bad.md',
      '---\ninvalid: [\n---\nDo not lose me',
    );
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const result = await service.projectRoom('reflection-garden');
    expect(result.map((item) => item.noteId)).toEqual(['same']);
    expect(result[0]?.title).toBe('Canonical');
    expect((await service.repairs()).map((item) => item.path)).toEqual([
      'Broken/bad.md',
      'Z/z.md',
    ]);
  });

  it('uses deterministic fallback sorting and per-view manual order', async () => {
    const vault = await seed([
      {
        path: 'Reflection/a.md',
        note: note({
          id: 'a',
          title: 'Alpha',
          updated: '2026-07-12T10:00:00+10:00',
        }),
      },
      {
        path: 'Reflection/b.md',
        note: note({
          id: 'b',
          title: 'Beta',
          updated: '2026-07-13T10:00:00+10:00',
        }),
      },
      {
        path: 'Reflection/c.md',
        note: note({
          id: 'c',
          title: 'Charlie',
          updated: '2026-07-13T10:00:00+10:00',
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    expect(
      (await service.projectRoom('reflection-garden')).map(
        (item) => item.noteId,
      ),
    ).toEqual(['b', 'c', 'a']);
    await service.views.save('room:reflection-garden', ['a', 'missing', 'c']);
    expect(
      (await service.projectRoom('reflection-garden')).map(
        (item) => item.noteId,
      ),
    ).toEqual(['a', 'c', 'b']);
  });

  it('returns one active season and separate reflection and celebration streams', async () => {
    const vault = await seed([
      {
        path: 'Season/old.md',
        note: note({
          id: 'old',
          cardType: 'season',
          semanticType: 'growth',
          rooms: ['current-season'],
          updated: '2026-07-12T10:00:00+10:00',
        }),
      },
      {
        path: 'Season/new.md',
        note: note({
          id: 'new',
          cardType: 'season',
          semanticType: 'growth',
          rooms: ['current-season', 'foyer'],
          updated: '2026-07-13T10:00:00+10:00',
        }),
      },
      {
        path: 'Reflection/r.md',
        note: note({ id: 'r', semanticType: 'reflection' }),
      },
      {
        path: 'Celebration/c.md',
        note: note({ id: 'c', semanticType: 'celebration' }),
      },
      {
        path: 'Foyer/f.md',
        note: note({
          id: 'f',
          semanticType: 'foundations',
          display: { featured: true },
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const activeSeason = await service.projectCurrentSeason();
    expect(activeSeason.current?.noteId).toBe('new');
    expect(activeSeason.repair).toEqual({
      code: 'multiple-active-seasons',
      noteIds: ['new', 'old'],
    });
    expect(
      (await service.projectStream('reflection')).map((item) => item.noteId),
    ).toEqual(['r']);
    expect(
      (await service.projectStream('celebration')).map((item) => item.noteId),
    ).toEqual(['c']);
    const foyer = await service.projectFoyer();
    expect(foyer.currentSeason?.noteId).toBe('new');
    expect(foyer.featured.map((item) => item.noteId)).toEqual(['f']);
  });

  it('composes named Foyer slots from canonical note metadata', async () => {
    const vault = await seed([
      {
        path: 'Season/winter.md',
        note: note({
          id: 'season-note-id',
          title: 'Wintering well',
          cardType: 'season',
          semanticType: 'growth',
          rooms: ['current-season'],
          status: 'active',
          extraFrontmatter: {
            season_id: '2026-winter',
            priorities: ['declared-priority'],
          },
        }),
      },
      {
        path: 'Season/create.md',
        note: note({
          id: 'create',
          title: 'Create before consuming',
          cardType: 'priority',
          semanticType: 'growth',
          seasons: ['2026-winter'],
        }),
      },
      {
        path: 'Season/declared.md',
        note: note({
          id: 'declared-priority',
          title: 'Make home easier',
          cardType: 'priority',
          semanticType: 'growth',
        }),
      },
      {
        path: 'Season/wrong-id.md',
        note: note({
          id: 'wrong-id',
          title: 'Must not join by note id',
          cardType: 'priority',
          semanticType: 'growth',
          seasons: ['season-note-id'],
        }),
      },
      {
        path: 'Foyer/becoming.md',
        note: note({
          id: 'becoming',
          title: 'A woman who creates from calm',
          cardType: 'identity',
          semanticType: 'foundations',
          rooms: ['foyer'],
          display: { featured: true },
        }),
      },
      {
        path: 'Foyer/feeling.md',
        note: note({
          id: 'feeling',
          title: 'Spacious',
          cardType: 'feeling',
          semanticType: 'vision',
          rooms: ['foyer'],
        }),
      },
      {
        path: 'Foyer/principle.md',
        note: note({
          id: 'principle',
          title: 'Structure and surprise',
          body: 'Create enough structure that imagination can surprise you.',
          cardType: 'principle',
          semanticType: 'foundations',
          rooms: ['foyer'],
        }),
      },
      {
        path: 'Reflection/return.md',
        note: note({
          id: 'return',
          title: 'A small return',
          cardType: 'reflection',
          semanticType: 'celebration',
          rooms: ['foyer'],
          updated: '2026-07-14T10:00:00+10:00',
        }),
      },
      {
        path: 'Attachments/cover.md',
        note: note({
          id: 'cover',
          title: 'Morning light',
          cardType: 'image',
          semanticType: 'reflection',
          rooms: ['foyer'],
          display: {
            featured: true,
            cover: '../Attachments/morning-light.jpg',
          },
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const foyer = await service.projectFoyer();
    expect(foyer.becoming?.noteId).toBe('becoming');
    expect(foyer.feelings.map((item) => item.noteId)).toEqual(['feeling']);
    expect(foyer.principles.map((item) => item.noteId)).toEqual(['principle']);
    expect(foyer.currentSeason?.noteId).toBe('season-note-id');
    expect(foyer.priorities.map((item) => item.noteId).sort()).toEqual([
      'create',
      'declared-priority',
    ]);
    expect(foyer.returning?.noteId).toBe('return');
    expect(foyer.image).toEqual(
      expect.objectContaining({
        noteId: 'cover',
        hash: expect.any(String),
        source: '../Attachments/morning-light.jpg',
        alt: 'Morning light',
      }),
    );
  });

  it('keeps an untitled empty Foyer image useful without inventing a caption', async () => {
    const image = note({
      id: 'image',
      body: '',
      rooms: ['foyer'],
      display: { featured: true, cover: '../Attachments/quiet.jpg' },
    });
    delete image.title;
    const service = createStudioService({
      vault: await seed([{ path: 'Foyer/image.md', note: image }]),
      index: new RecordingIndex(),
    });

    expect((await service.projectFoyer()).image).toEqual({
      noteId: 'image',
      path: 'Foyer/image.md',
      hash: expect.any(String),
      source: '../Attachments/quiet.jpg',
      alt: 'A chosen Studio image',
    });
  });

  it('supports empty, excluded, generic-room, and untitled projections', async () => {
    const bodyTitle = note({
      id: 'explicit',
      body: 'Body becomes title',
      rooms: ['identity-studio'],
    });
    const emptyTitle = note({
      id: 'empty',
      body: '',
      rooms: ['identity-studio'],
    });
    delete bodyTitle.title;
    delete emptyTitle.title;
    const vault = await seed([
      { path: 'Notes/explicit.md', note: bodyTitle },
      { path: 'Notes/empty.md', note: emptyTitle },
      {
        path: 'Notes/excluded.md',
        note: note({
          id: 'excluded',
          rooms: ['identity-studio'],
          extraFrontmatter: { excluded_from_views: true },
        }),
      },
      {
        path: 'Notes/excluded2.md',
        note: note({
          id: 'excluded2',
          rooms: ['identity-studio'],
          extraFrontmatter: { excluded: true },
        }),
      },
      {
        path: 'Notes/included.md',
        note: note({
          id: 'included',
          title: 'Included',
          rooms: ['identity-studio'],
          extraFrontmatter: { excluded: false, excluded_from_views: false },
        }),
      },
      {
        path: 'Notes/possibility.md',
        note: note({ id: 'possibility', semanticType: 'uncharted' }),
      },
      {
        path: 'Notes/win.md',
        note: note({ id: 'win', semanticType: 'celebration' }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const cards = await service.projectRoom('identity-studio');
    expect(cards.map((card) => card.title)).toEqual([
      'Untitled',
      'Body becomes title',
      'Included',
    ]);
    expect(await service.projectRoom('wisdom-garden')).toEqual([]);
    expect(
      (await service.projectRoom('uncharted')).map((card) => card.noteId),
    ).toEqual(['possibility']);
    expect(
      (await service.projectRoom('reflection-garden')).some(
        (card) => card.noteId === 'win',
      ),
    ).toBe(true);
    expect(await service.projectCurrentSeason()).toEqual({
      current: null,
      conflicts: [],
    });
  });

  it('places an otherwise-sorted item after a manually ordered item', async () => {
    const vault = await seed([
      { path: 'Reflection/a.md', note: note({ id: 'a', title: 'Alpha' }) },
      { path: 'Reflection/b.md', note: note({ id: 'b', title: 'Beta' }) },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    await service.views.save('room:reflection-garden', ['b']);
    expect(
      (await service.projectRoom('reflection-garden')).map(
        (card) => card.noteId,
      ),
    ).toEqual(['b', 'a']);
  });

  it('defensively de-duplicates canonical notes supplied to a projection', async () => {
    const vault = await seed([]);
    const shared = note({ id: 'shared' });
    const cards = await orderedProjection(
      [
        { note: shared, path: 'A.md', hash: 'a' },
        { note: shared, path: 'B.md', hash: 'b' },
      ],
      'test',
      createViewStateRepository(vault),
    );
    expect(cards.map((card) => card.noteId)).toEqual(['shared']);
  });

  it('keeps Inbox drafts out of philosophical rooms until triaged', async () => {
    const vault = await seed([
      {
        path: 'Inbox/draft.md',
        note: note({
          id: 'draft',
          status: 'draft',
          rooms: ['inbox'],
          semanticType: 'reflection',
          lifeAreas: ['home'],
          display: { featured: true },
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    expect(
      (await service.projectRoom('inbox')).map((card) => card.noteId),
    ).toEqual(['draft']);
    expect(await service.projectRoom('reflection-garden')).toEqual([]);
    expect(await service.projectLandscape({ lifeArea: 'home' })).toEqual([]);
    expect(await service.projectStream('reflection')).toEqual([]);
    expect((await service.projectFoyer()).featured).toEqual([]);
  });

  it('orders chronology by timestamp epoch and uses deterministic ties', async () => {
    const vault = await seed([
      {
        path: 'Reflection/local.md',
        note: note({
          id: 'local',
          title: 'Zulu',
          updated: '2026-07-13T10:00:00+10:00',
        }),
      },
      {
        path: 'Reflection/utc.md',
        note: note({
          id: 'utc',
          title: 'Alpha',
          updated: '2026-07-13T01:00:00Z',
        }),
      },
      {
        path: 'Reflection/tie.md',
        note: note({
          id: 'tie',
          title: 'Beta',
          updated: '2026-07-13T01:00:00+00:00',
        }),
      },
    ]);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    expect(
      (await service.projectRoom('reflection-garden')).map(
        (card) => card.noteId,
      ),
    ).toEqual(['utc', 'tie', 'local']);
  });
});
