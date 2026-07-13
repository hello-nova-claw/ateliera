import type {
  StudioService,
  UnchartedCardProjection,
  UnchartedProjection,
} from '@studio/application';
import { markdownToPlainText } from '@studio/content';
import { useCallback, useEffect, useState } from 'react';

const empty: UnchartedProjection = { cards: [] };

export interface UnchartedView {
  activeSeason?: { id: string; title: string };
  capture(body: string, horizon: 'near' | 'beyond'): Promise<void>;
  error?: string;
  invite(card: UnchartedCardProjection): Promise<void>;
  model: UnchartedProjection;
  state: 'ready' | 'loading' | 'stale' | 'error';
}

function titleFromBody(body: string): string {
  const text = markdownToPlainText(body).replace(/\s+/gu, ' ').trim();
  return Array.from(text).slice(0, 80).join('') || 'An Uncharted possibility';
}

export function useUncharted(
  service: StudioService | undefined,
  revision: number,
): UnchartedView {
  const [localRevision, setLocalRevision] = useState(0);
  const [model, setModel] = useState(empty);
  const [activeSeason, setActiveSeason] = useState<UnchartedView['activeSeason']>();
  const [state, setState] = useState<UnchartedView['state']>(
    service ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!service) {
      setModel(empty);
      setActiveSeason(undefined);
      setState('ready');
      return undefined;
    }
    let current = true;
    setState('loading');
    void Promise.all([
      service.projectUncharted(),
      service.projectCurrentSeason(),
      service.repairs(),
    ]).then(async ([projection, season, repairs]) => {
      let selected: UnchartedView['activeSeason'];
      if (season.current && season.conflicts.length === 0) {
        const saved = await service.load(season.current.path);
        const seasonId = saved.note.extraFrontmatter.season_id;
        if (typeof seasonId === 'string' && seasonId.trim() !== '') {
          selected = { id: seasonId, title: season.current.title };
        }
      }
      if (!current) return;
      const malformed = repairs.some((item) =>
        item.path.toLocaleLowerCase('en').startsWith('uncharted/'),
      );
      setModel(projection);
      setActiveSeason(selected);
      setError(
        malformed
          ? 'One or more possibilities need metadata repair. Their words remain untouched.'
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
          : 'Uncharted could not be gathered.',
      );
      setState('error');
    });
    return () => { current = false; };
  }, [localRevision, revision, service]);

  const capture = useCallback(async (body: string, horizon: 'near' | 'beyond') => {
    if (!service) throw new Error('Open a Studio before keeping a possibility.');
    await service.capture({
      body,
      title: titleFromBody(body),
      placement: 'uncharted',
      unchartedHorizon: horizon,
    });
    setLocalRevision((value) => value + 1);
  }, [service]);

  const invite = useCallback(async (card: UnchartedCardProjection) => {
    if (!service || !activeSeason) {
      throw new Error('Begin one current season before making this connection.');
    }
    await service.inviteUnchartedToSeason({
      path: card.path,
      expectedHash: card.hash,
      seasonId: activeSeason.id,
    });
    setLocalRevision((value) => value + 1);
  }, [activeSeason, service]);

  return {
    capture,
    invite,
    model,
    state,
    ...(activeSeason === undefined ? {} : { activeSeason }),
    ...(error === undefined ? {} : { error }),
  };
}

