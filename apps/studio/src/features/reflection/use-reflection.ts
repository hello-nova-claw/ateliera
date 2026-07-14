import type {
  ReflectionCardProjection,
  ReflectionGardenProjection,
  SavedNote,
  StudioService,
} from '@studio/application';
import { markdownToPlainText } from '@studio/content';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  imageUnavailableIds: ReadonlySet<string>;
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
  const [imageUnavailableIds, setImageUnavailableIds] = useState<Set<string>>(new Set());
  const [state, setState] = useState<ReflectionView['state']>(
    service ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();
  const pendingConnections = useRef(new Map<string, Promise<void>>());

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
          card,
          id: card.noteId,
          kind: 'note' as const,
          label: card.title,
        })),
        ...uncharted.cards.map((card) => ({
          card,
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
          try {
            const media = await service.resolveCover(card.path);
            if (media.kind !== 'available') return { noteId: card.noteId } as const;
            const url = URL.createObjectURL(
              new Blob([media.bytes], { type: media.mimeType }),
            );
            if (!current) {
              URL.revokeObjectURL(url);
              return { noteId: card.noteId } as const;
            }
            urls.push(url);
            return { noteId: card.noteId, url } as const;
          } catch {
            return { noteId: card.noteId } as const;
          }
        }),
    ).then((items) => {
      if (!current) return;
      setImageUrls(Object.fromEntries(
        items.flatMap((item) => 'url' in item ? [[item.noteId, item.url]] : []),
      ));
      setImageUnavailableIds(new Set(
        items.flatMap((item) => 'url' in item ? [] : [item.noteId]),
      ));
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
    const key = `${card.noteId}:${connection.kind}:${connection.id}`;
    const pending = pendingConnections.current.get(key);
    if (pending) return pending;
    const operation = (async () => {
      try {
        await service.linkReflectionEvidence({
          path: card.path,
          expectedHash: card.hash,
          ...(connection.kind === 'note' ? { noteIds: [connection.id] } : {}),
          ...(connection.kind === 'life-area' ? { lifeAreas: [connection.id] } : {}),
          ...(connection.kind === 'season' ? { seasons: [connection.id] } : {}),
        });
      } finally {
        setLocalRevision((value) => value + 1);
      }
    })();
    pendingConnections.current.set(key, operation);
    const clear = () => {
      if (pendingConnections.current.get(key) === operation) {
        pendingConnections.current.delete(key);
      }
    };
    void operation.then(clear, clear);
    return operation;
  }, [service]);

  return {
    capture,
    connect,
    connections,
    imageUrls,
    imageUnavailableIds,
    model,
    state,
    ...(error === undefined ? {} : { error }),
  };
}
