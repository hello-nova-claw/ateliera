import type {
  ReflectionCardProjection,
  ReflectionGardenProjection,
  SavedNote,
  StudioService,
} from '@studio/application';
import { markdownToPlainText } from '@studio/content';
import { useCallback, useEffect, useState } from 'react';

import type { ReflectionConnection } from './ReflectionPage';

const empty: ReflectionGardenProjection = { cards: [], themes: [] };

export interface ReflectionView {
  capture(
    type: 'reflection' | 'celebration',
    body: string,
    openAfter: boolean,
  ): Promise<SavedNote | undefined>;
  connect(
    card: ReflectionCardProjection,
    connection: ReflectionConnection,
  ): Promise<void>;
  connections: ReflectionConnection[];
  error?: string;
  imageUrls: Readonly<Record<string, string>>;
  model: ReflectionGardenProjection;
  state: 'ready' | 'loading' | 'stale' | 'error';
}

function titleFromBody(body: string): string {
  const text = markdownToPlainText(body).replace(/\s+/gu, ' ').trim();
  return Array.from(text).slice(0, 80).join('') || 'A reflection';
}

export function useReflection(
  service: StudioService | undefined,
  revision: number,
): ReflectionView {
  const [localRevision, setLocalRevision] = useState(0);
  const [model, setModel] = useState(empty);
  const [connections, setConnections] = useState<ReflectionConnection[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState<ReflectionView['state']>(
    service ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!service) {
      setModel(empty);
      setConnections([]);
      setState('ready');
      return undefined;
    }
    let current = true;
    setState('loading');
    void Promise.all([
      service.projectReflectionGarden(),
      service.projectRoom('identity-studio'),
      service.projectUncharted(),
      service.projectCurrentSeason(),
      service.lifeAreas.load(),
      service.repairs(),
    ]).then(async ([projection, identity, uncharted, season, areas, repairs]) => {
      const nextConnections: ReflectionConnection[] = [
        ...identity.map((card) => ({
          id: card.noteId,
          kind: 'note' as const,
          label: card.title,
        })),
        ...uncharted.cards.map((card) => ({
          id: card.noteId,
          kind: 'note' as const,
          label: card.title,
        })),
        ...areas.areas.filter((area) => !area.hidden).map((area) => ({
          id: area.id,
          kind: 'life-area' as const,
          label: area.title,
        })),
      ];
      if (season.current && season.conflicts.length === 0) {
        const saved = await service.load(season.current.path);
        const seasonId = saved.note.extraFrontmatter.season_id;
        if (typeof seasonId === 'string' && seasonId.trim() !== '') {
          nextConnections.push({
            id: seasonId,
            kind: 'season',
            label: season.current.title,
          });
        }
      }
      if (!current) return;
      const malformed = repairs.some((item) =>
        item.path.toLocaleLowerCase('en').startsWith('reflection garden/'),
      );
      const uniqueConnections = [...new Map(
        nextConnections.map((item) => [`${item.kind}:${item.id}`, item]),
      ).values()];
      setModel(projection);
      setConnections(uniqueConnections);
      setError(
        malformed
          ? 'One or more entries need metadata repair. Their words remain untouched.'
          : undefined,
      );
      setState(
        malformed
          ? 'error'
          : service.indexState() === 'ready'
            ? 'ready'
            : 'stale',
      );
    }, (reason: unknown) => {
      if (!current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : 'The garden could not be gathered.',
      );
      setState('error');
    });
    return () => { current = false; };
  }, [localRevision, revision, service]);

  useEffect(() => {
    if (!service) return undefined;
    let current = true;
    const urls: string[] = [];
    void Promise.all(
      model.cards
        .filter((card) => card.coverReference !== undefined)
        .map(async (card) => {
          const media = await service.resolveCover(card.path);
          if (media.kind !== 'available') return undefined;
          const url = URL.createObjectURL(new Blob([media.bytes], { type: media.mimeType }));
          urls.push(url);
          return [card.noteId, url] as const;
        }),
    ).then((items) => {
      if (!current) return;
      setImageUrls(Object.fromEntries(items.filter((item) => item !== undefined)));
    }).catch(() => {
      if (current) setImageUrls({});
    });
    return () => {
      current = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [model.cards, service]);

  const capture = useCallback(async (
    type: 'reflection' | 'celebration',
    body: string,
    openAfter: boolean,
  ): Promise<SavedNote | undefined> => {
    if (!service) throw new Error('Open a Studio before keeping an entry.');
    const saved = await service.capture({
      body,
      title: titleFromBody(body),
      placement: type,
    });
    setLocalRevision((value) => value + 1);
    return openAfter ? saved : undefined;
  }, [service]);

  const connect = useCallback(async (
    card: ReflectionCardProjection,
    connection: ReflectionConnection,
  ) => {
    if (!service) throw new Error('Open a Studio before making a connection.');
    await service.linkReflectionEvidence({
      path: card.path,
      expectedHash: card.hash,
      ...(connection.kind === 'note' ? { noteIds: [connection.id] } : {}),
      ...(connection.kind === 'life-area' ? { lifeAreas: [connection.id] } : {}),
      ...(connection.kind === 'season' ? { seasons: [connection.id] } : {}),
    });
    setLocalRevision((value) => value + 1);
  }, [service]);

  return {
    capture,
    connect,
    connections,
    imageUrls,
    model,
    state,
    ...(error === undefined ? {} : { error }),
  };
}

