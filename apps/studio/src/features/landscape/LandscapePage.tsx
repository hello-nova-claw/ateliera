import type {
  LandscapeBoardProjection,
  LandscapeCardProjection,
} from '@studio/application';
import {
  landscapeAnchorDefinitions,
  type LandscapeAnchor,
  type LifeArea,
} from '@studio/domain';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import './LandscapePage.css';

export interface LandscapeMove {
  card: LandscapeCardProjection;
  lifeAreas: string[];
  anchor: LandscapeAnchor;
}

export interface LandscapePageProps {
  areas: LifeArea[];
  board: LandscapeBoardProjection;
  error?: string;
  onAddArea?: (id: string) => void;
  onCreate?: (
    lifeArea: string,
    anchor: LandscapeAnchor,
    trigger: HTMLButtonElement,
  ) => void;
  onMove?: (move: LandscapeMove) => Promise<void>;
  onNavigate: (path: string) => void;
  onOpen?: (
    card: LandscapeCardProjection,
    trigger: HTMLButtonElement,
  ) => void;
  onRemoveArea?: (id: string) => void;
  onReorder?: (
    lifeArea: string,
    anchor: LandscapeAnchor,
    noteIds: string[],
  ) => Promise<void>;
  path: string;
  state?: 'ready' | 'loading' | 'stale' | 'error';
}

function cell(
  board: LandscapeBoardProjection,
  lifeArea: string,
  anchor: LandscapeAnchor,
) {
  return board.cells.find(
    (candidate) =>
      candidate.lifeArea === lifeArea && candidate.anchor === anchor,
  );
}

function cardsFor(
  board: LandscapeBoardProjection,
  lifeArea: string,
  anchor: LandscapeAnchor,
): LandscapeCardProjection[] {
  const projected = cell(board, lifeArea, anchor);
  if (projected === undefined) return [];
  if (projected.cards.length > 0) return projected.cards;
  return projected.featured === null ? [] : [projected.featured];
}

function areaLabel(areas: LifeArea[], id: string): string {
  return areas.find((area) => area.id === id)?.title ?? id;
}

function viewFromPath(path: string):
  | { kind: 'matrix' }
  | { kind: 'focus'; area: string }
  | { kind: 'lens'; anchor: LandscapeAnchor } {
  const parts = path.split('/').filter(Boolean);
  if (
    parts[1] === 'lens' &&
    landscapeAnchorDefinitions.some((anchor) => anchor.id === parts[2])
  ) {
    return { kind: 'lens', anchor: parts[2] as LandscapeAnchor };
  }
  if (parts[1]) return { kind: 'focus', area: decodeURIComponent(parts[1]) };
  return { kind: 'matrix' };
}

function SegmentedControl({
  areas,
  onNavigate,
  view,
}: {
  areas: LifeArea[];
  onNavigate: (path: string) => void;
  view: ReturnType<typeof viewFromPath>;
}) {
  const firstArea = areas[0]?.id ?? 'family';
  return (
    <div aria-label="Landscape view" className="life-landscape__views" role="group">
      <button aria-pressed={view.kind === 'matrix'} onClick={() => onNavigate('/landscape')} type="button">Matrix</button>
      <button aria-pressed={view.kind === 'focus'} onClick={() => onNavigate(`/landscape/${firstArea}`)} type="button">Focus</button>
      <button aria-pressed={view.kind === 'lens'} onClick={() => onNavigate('/landscape/lens/vision')} type="button">Lens</button>
    </div>
  );
}

function NoteCard({
  areas,
  card,
  currentArea,
  onMove,
  onOpen,
  onReorder,
  position,
  sectionCards,
}: {
  areas: LifeArea[];
  card: LandscapeCardProjection;
  currentArea: string;
  onMove?: (move: LandscapeMove) => Promise<void>;
  onOpen?: LandscapePageProps['onOpen'];
  onReorder?: LandscapePageProps['onReorder'];
  position: number;
  sectionCards: LandscapeCardProjection[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const [announcement, setAnnouncement] = useState('');

  async function move(lifeAreas: string[], anchor: LandscapeAnchor) {
    if (!onMove || busy) return;
    setBusy(true);
    setAnnouncement(`Moving ${card.title}…`);
    try {
      await onMove({ card, lifeAreas, anchor });
      setAnnouncement(`${card.title} moved.`);
      setMenuOpen(false);
    } catch (reason) {
      setAnnouncement(
        reason instanceof Error ? reason.message : `${card.title} could not be moved.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function reorder(offset: -1 | 1) {
    if (!onReorder || busy) return;
    const next = [...sectionCards];
    const target = position + offset;
    if (target < 0 || target >= next.length) return;
    [next[position], next[target]] = [next[target]!, next[position]!];
    setBusy(true);
    try {
      await onReorder(currentArea, card.anchor, next.map((item) => item.noteId));
      setAnnouncement(`${card.title} moved ${offset < 0 ? 'earlier' : 'later'}.`);
      setMenuOpen(false);
    } catch (reason) {
      setAnnouncement(reason instanceof Error ? reason.message : 'The order could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="life-landscape-card"
      data-drop-anchor={card.anchor}
      data-drop-area={currentArea}
    >
      <button
        className="life-landscape-card__handle"
        aria-label={`Drag ${card.title}`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') { event.preventDefault(); void reorder(-1); }
          if (event.key === 'ArrowDown') { event.preventDefault(); void reorder(1); }
        }}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const origin = start.current;
          start.current = undefined;
          if (!origin || !onMove || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 8) return;
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-area][data-drop-anchor]');
          const targetArea = target?.dataset.dropArea;
          const targetAnchor = target?.dataset.dropAnchor as LandscapeAnchor | undefined;
          if (targetArea && targetAnchor) void move([targetArea], targetAnchor);
        }}
        type="button"
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <button
        className="life-landscape-card__title"
        onClick={(event) => onOpen?.(card, event.currentTarget)}
        title={card.title}
        type="button"
      >
        {card.title}
      </button>
      {card.excerpt && <p>{card.excerpt}</p>}
      {card.decisionHorizon && (
        <span className="life-landscape-card__horizon">
          {card.decisionHorizon === 'someday' ? 'Someday' : card.decisionHorizon.replace('d', ' days')}
        </span>
      )}
      {onMove && (
        <div className="life-landscape-card__actions">
          <button aria-expanded={menuOpen} aria-label={`Move ${card.title}`} onClick={() => setMenuOpen((open) => !open)} type="button">Move</button>
          {menuOpen && (
            <div aria-label={`Ways to move ${card.title}`} className="life-landscape-card__menu" role="menu">
              <p>Move within section</p>
              <button disabled={position === 0 || busy} onClick={() => void reorder(-1)} role="menuitem" type="button">Move earlier</button>
              <button disabled={position === sectionCards.length - 1 || busy} onClick={() => void reorder(1)} role="menuitem" type="button">Move later</button>
              <p>Move to another anchor</p>
              {landscapeAnchorDefinitions.filter((anchor) => anchor.id !== card.anchor).map((anchor) => (
                <button disabled={busy} key={anchor.id} onClick={() => void move([currentArea], anchor.id)} role="menuitem" type="button">Move to {anchor.label} (replaces {landscapeAnchorDefinitions.find((item) => item.id === card.anchor)?.label})</button>
              ))}
              <p>Life areas</p>
              {areas.filter((area) => !card.lifeAreas.includes(area.id)).map((area) => (
                <span className="life-landscape-card__area-actions" key={area.id}>
                  <button disabled={busy} onClick={() => void move([area.id], card.anchor)} role="menuitem" type="button">Move to {area.title}</button>
                  <button disabled={busy} onClick={() => void move([...card.lifeAreas, area.id], card.anchor)} role="menuitem" type="button">Also show in {area.title}</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <span aria-live="polite" className="studio-visually-hidden">{announcement}</span>
    </article>
  );
}

function AreaSwitcher({ areas, current, onNavigate }: { areas: LifeArea[]; current: string; onNavigate: (path: string) => void }) {
  return (
    <nav aria-label="Life areas" className="life-landscape__area-switcher">
      {areas.map((area) => (
        <button aria-current={current === area.id ? 'page' : undefined} key={area.id} onClick={() => onNavigate(`/landscape/${encodeURIComponent(area.id)}`)} type="button">{area.title}</button>
      ))}
    </nav>
  );
}

export function LandscapePage({ areas, board, error, onAddArea, onCreate, onMove, onNavigate, onOpen, onRemoveArea, onReorder, path, state = 'ready' }: LandscapePageProps) {
  const view = viewFromPath(path);
  const [undo, setUndo] = useState<LandscapeMove>();
  const [undoBusy, setUndoBusy] = useState(false);

  async function performMove(move: LandscapeMove) {
    await onMove?.(move);
    setUndo({ card: move.card, lifeAreas: move.card.lifeAreas, anchor: move.card.anchor });
  }

  useEffect(() => {
    if (!areas.length || view.kind !== 'focus' || areas.some((area) => area.id === view.area)) return;
    onNavigate(`/landscape/${areas[0]!.id}`);
  }, [areas, onNavigate, view]);

  return (
    <div className="life-landscape">
      <header className="life-landscape__header">
        <div><p className="life-landscape__eyebrow">Your life, held together</p><h1>Life Landscape</h1><p>Look across the whole, then step gently into one area.</p></div>
        <SegmentedControl areas={areas} onNavigate={onNavigate} view={view} />
      </header>
      {state === 'loading' && <p role="status">Gathering the Landscape…</p>}
      {state === 'stale' && <p role="status">Showing this Landscape while the index catches up.</p>}
      {state === 'error' && <p className="life-landscape__error" role="alert">{error ?? 'The Landscape could not be gathered. Your notes remain safe.'}</p>}

      {view.kind === 'matrix' && (
        <div aria-label="Life Landscape matrix" className="life-landscape__matrix-region" role="region" tabIndex={0}>
          <div
            className="life-landscape__matrix"
            style={{
              '--landscape-area-count': areas.length,
              '--landscape-matrix-min': `${184 + areas.length * 132}px`,
            } as CSSProperties}
          >
            <div className="life-landscape__corner">Five anchors</div>
            {areas.map((area) => <button className="life-landscape__column-heading" data-landscape-area={area.id} key={area.id} onClick={() => onNavigate(`/landscape/${area.id}`)} type="button" aria-label={`Open ${area.title}`}>{area.title}</button>)}
            {landscapeAnchorDefinitions.map((anchor) => (
              <div className="life-landscape__matrix-row" key={anchor.id}>
                <div className="life-landscape__anchor"><strong>{anchor.label}</strong><span>{anchor.prompt}</span></div>
                {areas.map((area) => {
                  const projected = cell(board, area.id, anchor.id);
                  return (
                    <div className="life-landscape__cell" data-drop-anchor={anchor.id} data-drop-area={area.id} key={area.id}>
                      {projected?.featured ? <button aria-label={projected.featured.title} className="life-landscape__cell-title" onClick={(event) => onOpen?.(projected.featured!, event.currentTarget)} title={projected.featured.title} type="button">{projected.featured.title}</button> : <span>There is room here.</span>}
                      {(projected?.additionalCount ?? 0) > 0 && <button onClick={() => onNavigate(`/landscape/${area.id}`)} type="button">+{projected!.additionalCount} more</button>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {view.kind === 'focus' && (
        <div className="life-landscape__focus">
          <button className="life-landscape__back" onClick={() => onNavigate('/landscape')} type="button">← Back to map</button>
          <AreaSwitcher areas={areas} current={view.area} onNavigate={onNavigate} />
          <h2 className="life-landscape__area-title">{areaLabel(areas, view.area)}</h2>
          {landscapeAnchorDefinitions.map((anchor) => {
            const cards = cardsFor(board, view.area, anchor.id);
            return <section className="life-landscape__section" data-drop-anchor={anchor.id} data-drop-area={view.area} key={anchor.id} aria-labelledby={`landscape-${view.area}-${anchor.id}`}><div className="life-landscape__section-heading"><div><h2 id={`landscape-${view.area}-${anchor.id}`}>{anchor.label}</h2><p>{anchor.prompt}</p></div>{onCreate && <button onClick={(event) => onCreate(view.area, anchor.id, event.currentTarget)} type="button">+ Add</button>}</div>{cards.length === 0 ? <p className="life-landscape__empty">There is room here.</p> : <div className="life-landscape__cards">{cards.map((card, index) => <NoteCard areas={areas} card={card} currentArea={view.area} key={card.noteId} {...(onMove ? { onMove: performMove } : {})} {...(onOpen ? { onOpen } : {})} {...(onReorder ? { onReorder } : {})} position={index} sectionCards={cards} />)}</div>}</section>;
          })}
        </div>
      )}

      {view.kind === 'lens' && (
        <div className="life-landscape__lens">
          <nav aria-label="Landscape anchors" className="life-landscape__anchor-switcher">{landscapeAnchorDefinitions.map((anchor) => <button aria-current={anchor.id === view.anchor ? 'page' : undefined} key={anchor.id} onClick={() => onNavigate(`/landscape/lens/${anchor.id}`)} type="button">{anchor.label}</button>)}</nav>
          <h2>{landscapeAnchorDefinitions.find((anchor) => anchor.id === view.anchor)?.label}</h2>
          <p>{landscapeAnchorDefinitions.find((anchor) => anchor.id === view.anchor)?.prompt}</p>
          <div className="life-landscape__lens-grid">{areas.map((area) => { const cards = cardsFor(board, area.id, view.anchor); return <section data-drop-anchor={view.anchor} data-drop-area={area.id} key={area.id}><h3>{area.title}</h3>{cards.length === 0 ? <p className="life-landscape__empty">There is room here.</p> : cards.map((card, index) => <NoteCard areas={areas} card={card} currentArea={area.id} key={card.noteId} {...(onMove ? { onMove: performMove } : {})} {...(onOpen ? { onOpen } : {})} {...(onReorder ? { onReorder } : {})} position={index} sectionCards={cards} />)}</section>; })}</div>
        </div>
      )}

      {(onAddArea || onRemoveArea) && <details className="life-landscape__manage"><summary>Manage life areas</summary><p>{areas.length} active. Five to ten usually keeps the Landscape spacious.</p><div>{areas.map((area) => <button disabled={areas.length <= 1} key={area.id} onClick={() => onRemoveArea?.(area.id)} type="button">Hide {area.title}</button>)}</div>{onAddArea && <button onClick={() => onAddArea('learning')} type="button">Add another life area</button>}</details>}

      {undo && <div className="life-landscape__undo" role="status"><span>Moved {undo.card.title}.</span><button disabled={undoBusy} onClick={() => { setUndoBusy(true); void onMove?.(undo).then(() => setUndo(undefined)).finally(() => setUndoBusy(false)); }} type="button">Undo move</button></div>}
    </div>
  );
}
