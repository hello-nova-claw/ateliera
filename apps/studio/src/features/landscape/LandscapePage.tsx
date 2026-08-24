import type {
  LandscapeBoardProjection,
  LandscapeCardProjection,
} from '@studio/application';
import {
  defaultLifeAreas,
  landscapeAnchorDefinitions,
  type LandscapeAnchor,
  type LifeArea,
} from '@studio/domain';
import { GuidedField, RoomHeading } from '@studio/ui';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import './LandscapePage.css';
import { landscapeFieldGuidance } from './field-guidance';
import type { TourExample } from '../onboarding/tour-examples';
import {
  TourExampleCard,
  TourGlimpseLabel,
  type UseTourExample,
} from '../onboarding/TourPreview';

export interface LandscapeMove {
  card: LandscapeCardProjection;
  lifeAreas: string[];
  anchor: LandscapeAnchor;
}

export interface LandscapePageProps {
  areas: LifeArea[];
  board: LandscapeBoardProjection;
  configUnavailable?: 'unsupported' | 'unavailable';
  error?: string;
  onAddArea?: (area: { id?: string; title: string }) => void;
  onCreate?: (
    lifeArea: string,
    anchor: LandscapeAnchor,
    trigger: HTMLButtonElement,
  ) => void;
  onMove?: (move: LandscapeMove) => Promise<{ hash: string }>;
  onNavigate: (path: string) => void;
  onOpen?: (card: LandscapeCardProjection, trigger: HTMLButtonElement) => void;
  onRemoveArea?: (id: string) => void;
  onRepairAreas?: () => Promise<void>;
  onRenameArea?: (id: string, title: string) => void;
  onReorderArea?: (id: string, offset: -1 | 1) => void;
  onReorder?: (
    lifeArea: string,
    anchor: LandscapeAnchor,
    noteIds: string[],
  ) => Promise<void>;
  path: string;
  repairRequired?: boolean;
  state?: 'ready' | 'loading' | 'stale' | 'error';
  tourExamples?: readonly TourExample[];
  onUseTourExample?: UseTourExample;
}

function exampleForAnchor(
  examples: readonly TourExample[],
  anchor: LandscapeAnchor,
): TourExample | undefined {
  const index = landscapeAnchorDefinitions.findIndex(
    (definition) => definition.id === anchor,
  );
  return index < 0 ? undefined : examples[index];
}

type UndoAction =
  | { kind: 'move'; move: LandscapeMove }
  | {
      kind: 'order';
      lifeArea: string;
      anchor: LandscapeAnchor;
      noteIds: string[];
      title: string;
    };

type DragMode = 'move' | 'link';

interface ActiveLandscapeDrag {
  card: LandscapeCardProjection;
  mode: DragMode;
}

interface LandscapeDropTarget {
  lifeArea: string;
  anchor: LandscapeAnchor;
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

function viewFromPath(
  path: string,
):
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
    <div
      aria-label="Landscape view"
      className="life-landscape__views"
      role="group"
    >
      <button
        aria-pressed={view.kind === 'matrix'}
        onClick={() => onNavigate('/landscape')}
        type="button"
      >
        Matrix
      </button>
      <button
        aria-pressed={view.kind === 'focus'}
        onClick={() => onNavigate(`/landscape/${firstArea}`)}
        type="button"
      >
        Focus
      </button>
      <button
        aria-pressed={view.kind === 'lens'}
        onClick={() => onNavigate('/landscape/lens/vision')}
        type="button"
      >
        Lens
      </button>
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
  onMove?: (
    move: LandscapeMove,
    focusTarget?: HTMLButtonElement,
  ) => Promise<{ hash: string }>;
  onOpen?: LandscapePageProps['onOpen'];
  onReorder?: (
    lifeArea: string,
    anchor: LandscapeAnchor,
    noteIds: string[],
    focusCard: LandscapeCardProjection,
    focusTarget?: HTMLButtonElement,
  ) => Promise<void>;
  position: number;
  sectionCards: LandscapeCardProjection[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragMode, setDragMode] = useState<'move' | 'link'>('move');
  const [announcement, setAnnouncement] = useState('');
  const [moveError, setMoveError] = useState('');
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const failedActionFocusRef = useRef<HTMLButtonElement | undefined>(undefined);
  const restoreTriggerFocusRef = useRef(false);
  const latestCardRef = useRef(card);
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } =
    useDraggable({
      id: card.noteId,
      data: { card, currentArea, dragMode },
      disabled: !onMove || busy,
    });

  useEffect(() => {
    latestCardRef.current = card;
  }, [card.anchor, card.hash, card.lifeAreas, card]);

  function closeMenu(restoreFocus = false) {
    setMenuOpen(false);
    if (restoreFocus) menuTriggerRef.current?.focus();
  }

  useEffect(() => {
    if (!menuOpen) return undefined;
    const enabledItems = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    enabledItems?.[0]?.focus();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        menuRef.current?.contains(target) ||
        menuTriggerRef.current?.contains(target)
      )
        return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (busy || !failedActionFocusRef.current) return;
    const failedAction = failedActionFocusRef.current;
    failedActionFocusRef.current = undefined;
    if (failedAction.isConnected && !failedAction.disabled) {
      failedAction.focus();
      return;
    }
    const fallback = menuRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    (fallback ?? menuTriggerRef.current)?.focus();
  }, [busy]);

  useEffect(() => {
    if (
      busy ||
      !restoreTriggerFocusRef.current ||
      failedActionFocusRef.current ||
      moveError
    )
      return;
    restoreTriggerFocusRef.current = false;
    menuTriggerRef.current?.focus();
  }, [busy, moveError]);

  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    ];
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (
      !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) ||
      items.length === 0
    )
      return;
    event.preventDefault();
    const current = Math.max(
      0,
      items.indexOf(document.activeElement as HTMLButtonElement),
    );
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
            items.length;
    items[next]?.focus();
  }

  async function move(
    lifeAreas: string[],
    anchor: LandscapeAnchor,
    actionTarget?: HTMLButtonElement,
  ) {
    if (!onMove || busy) return;
    restoreTriggerFocusRef.current = false;
    setBusy(true);
    setMoveError('');
    setAnnouncement(`Moving ${card.title}…`);
    try {
      const saved = await onMove(
        { card: latestCardRef.current, lifeAreas, anchor },
        menuTriggerRef.current ?? undefined,
      );
      latestCardRef.current = {
        ...latestCardRef.current,
        anchor,
        hash: saved.hash,
        lifeAreas,
      };
      setAnnouncement(`${card.title} moved.`);
      restoreTriggerFocusRef.current = true;
      closeMenu();
    } catch (reason) {
      restoreTriggerFocusRef.current = false;
      failedActionFocusRef.current = actionTarget;
      const message =
        reason instanceof Error
          ? reason.message
          : `${card.title} could not be moved.`;
      setAnnouncement(message);
      setMoveError(message);
    } finally {
      setBusy(false);
    }
  }

  async function reorder(offset: -1 | 1, actionTarget?: HTMLButtonElement) {
    if (!onReorder || busy) return;
    const next = [...sectionCards];
    const target = position + offset;
    if (target < 0 || target >= next.length) return;
    [next[position], next[target]] = [next[target]!, next[position]!];
    setBusy(true);
    try {
      await onReorder(
        currentArea,
        card.anchor,
        next.map((item) => item.noteId),
        card,
        menuTriggerRef.current ?? undefined,
      );
      setAnnouncement(
        `${card.title} moved ${offset < 0 ? 'earlier' : 'later'}.`,
      );
      restoreTriggerFocusRef.current = true;
      closeMenu();
    } catch (reason) {
      failedActionFocusRef.current = actionTarget;
      const message =
        reason instanceof Error
          ? reason.message
          : 'The order could not be saved.';
      setAnnouncement(message);
      setMoveError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`life-landscape-card life-landscape-card--${card.semanticType}${isDragging ? ' life-landscape-card--dragging' : ''}`}
      data-drop-anchor={card.anchor}
      data-drop-area={currentArea}
      data-landscape-note-id={card.noteId}
      ref={setNodeRef}
    >
      <button
        {...attributes}
        {...listeners}
        className="life-landscape-card__handle"
        aria-label={`Drag ${card.title}`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            void reorder(-1, event.currentTarget);
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            void reorder(1, event.currentTarget);
          }
        }}
        ref={setActivatorNodeRef}
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
          {card.decisionHorizon === 'someday'
            ? 'Someday'
            : card.decisionHorizon.replace('d', ' days')}
        </span>
      )}
      {onMove && (
        <div className="life-landscape-card__actions">
          <label className="life-landscape-card__drag-mode">
            <span>Drag action for {card.title}</span>
            <select
              aria-label={`Drag action for ${card.title}`}
              onChange={(event) =>
                setDragMode(event.target.value as 'move' | 'link')
              }
              value={dragMode}
            >
              <option value="move">Move here</option>
              <option value="link">Also show here</option>
            </select>
          </label>
          <span className="life-landscape-card__drag-help">
            Drag, or press and hold on touch.
          </span>
          <button
            aria-controls={menuId}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Move ${card.title}`}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
            ref={menuTriggerRef}
            type="button"
          >
            Move
          </button>
          {menuOpen && (
            <div
              aria-label={`Ways to move ${card.title}`}
              className="life-landscape-card__menu"
              id={menuId}
              onKeyDown={navigateMenu}
              ref={menuRef}
              role="menu"
            >
              <div aria-label="Move within section" role="group">
                <p>Move within section</p>
                <button
                  disabled={position === 0 || busy}
                  onClick={(event) => void reorder(-1, event.currentTarget)}
                  role="menuitem"
                  type="button"
                >
                  Move earlier
                </button>
                <button
                  disabled={position === sectionCards.length - 1 || busy}
                  onClick={(event) => void reorder(1, event.currentTarget)}
                  role="menuitem"
                  type="button"
                >
                  Move later
                </button>
              </div>
              <div aria-label="Move to another anchor" role="group">
                <p>Move to another anchor</p>
                {landscapeAnchorDefinitions
                  .filter((anchor) => anchor.id !== card.anchor)
                  .map((anchor) => (
                    <button
                      disabled={busy}
                      key={anchor.id}
                      onClick={(event) =>
                        void move([currentArea], anchor.id, event.currentTarget)
                      }
                      role="menuitem"
                      type="button"
                    >
                      Move to {anchor.label} (replaces{' '}
                      {
                        landscapeAnchorDefinitions.find(
                          (item) => item.id === card.anchor,
                        )?.label
                      }
                      )
                    </button>
                  ))}
              </div>
              <div aria-label="Life areas" role="group">
                <p>Life areas</p>
                {areas
                  .filter((area) => !card.lifeAreas.includes(area.id))
                  .map((area) => (
                    <span
                      className="life-landscape-card__area-actions"
                      key={area.id}
                    >
                      <button
                        disabled={busy}
                        onClick={(event) =>
                          void move([area.id], card.anchor, event.currentTarget)
                        }
                        role="menuitem"
                        type="button"
                      >
                        Move to {area.title}
                      </button>
                      <button
                        disabled={busy}
                        onClick={(event) =>
                          void move(
                            [...card.lifeAreas, area.id],
                            card.anchor,
                            event.currentTarget,
                          )
                        }
                        role="menuitem"
                        type="button"
                      >
                        Also show in {area.title}
                      </button>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      <span aria-live="polite" className="studio-visually-hidden">
        {announcement}
      </span>
      {moveError && (
        <p className="life-landscape-card__error" role="alert">
          {moveError}
        </p>
      )}
    </article>
  );
}

function DropZone({
  anchor,
  children,
  className,
  lifeArea,
}: LandscapeDropTarget & { children: ReactNode; className: string }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${lifeArea}::${anchor}`,
    data: { lifeArea, anchor },
  });
  return (
    <div
      className={`${className}${isOver ? ` ${className}--drop-preview` : ''}`}
      data-drop-anchor={anchor}
      data-drop-area={lifeArea}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}

function AreaSwitcher({
  areas,
  current,
  onNavigate,
}: {
  areas: LifeArea[];
  current: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <nav aria-label="Life areas" className="life-landscape__area-switcher">
      {areas.map((area) => (
        <button
          aria-current={current === area.id ? 'page' : undefined}
          key={area.id}
          onClick={() =>
            onNavigate(`/landscape/${encodeURIComponent(area.id)}`)
          }
          type="button"
        >
          {area.title}
        </button>
      ))}
    </nav>
  );
}

export function LandscapePage({
  areas,
  board,
  configUnavailable,
  error,
  onAddArea,
  onCreate,
  onMove,
  onNavigate,
  onOpen,
  onUseTourExample,
  onRemoveArea,
  onRepairAreas,
  onRenameArea,
  onReorder,
  onReorderArea,
  path,
  repairRequired = false,
  state = 'ready',
  tourExamples = [],
}: LandscapePageProps) {
  const view = viewFromPath(path);
  const [undo, setUndo] = useState<UndoAction>();
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState('');
  const [interactionError, setInteractionError] = useState('');
  const [activeDrag, setActiveDrag] = useState<ActiveLandscapeDrag>();
  const [dropTarget, setDropTarget] = useState<LandscapeDropTarget>();
  const [dragSession, setDragSession] = useState(0);
  const [dragAnnouncement, setDragAnnouncement] = useState('');
  const [newAreaTitle, setNewAreaTitle] = useState('');
  const [renamingArea, setRenamingArea] = useState<string>();
  const [renameTitle, setRenameTitle] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const pendingFocus = useRef<
    | {
        card: LandscapeCardProjection;
        preferred?: HTMLButtonElement;
      }
    | undefined
  >(undefined);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 500, tolerance: 8 },
    }),
  );

  const settlePendingFocus = useCallback((clear: boolean) => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (pending.preferred?.isConnected) {
      pending.preferred.focus();
      if (clear) pendingFocus.current = undefined;
      return;
    }
    const targetArea = pending.card.lifeAreas[0];
    const title = document.querySelector<HTMLButtonElement>(
      `[data-landscape-note-id="${CSS.escape(pending.card.noteId)}"]` +
        `[data-drop-anchor="${CSS.escape(pending.card.anchor)}"]` +
        `${targetArea ? `[data-drop-area="${CSS.escape(targetArea)}"]` : ''}` +
        ' .life-landscape-card__title',
    );
    if (title) {
      title.focus();
      pendingFocus.current = undefined;
      return;
    }
    if (clear) {
      document
        .querySelector<HTMLButtonElement>('.life-landscape__undo button')
        ?.focus();
    }
  }, []);

  function restoreFocusAfterMutation(
    card: LandscapeCardProjection,
    preferred?: HTMLButtonElement,
  ) {
    pendingFocus.current = { card, ...(preferred ? { preferred } : {}) };
    requestAnimationFrame(() => settlePendingFocus(false));
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => settlePendingFocus(true), 1_000);
  }

  async function performMove(
    move: LandscapeMove,
    focusTarget?: HTMLButtonElement,
  ) {
    if (!onMove) throw new Error('This note cannot be moved right now.');
    const saved = await onMove(move);
    setUndoError('');
    setUndo({
      kind: 'move',
      move: {
        card: { ...move.card, hash: saved.hash },
        lifeAreas: move.card.lifeAreas,
        anchor: move.card.anchor,
      },
    });
    const triggerSurvivesMove =
      move.anchor === move.card.anchor &&
      move.card.lifeAreas.every((area) => move.lifeAreas.includes(area));
    restoreFocusAfterMutation(
      { ...move.card, anchor: move.anchor, lifeAreas: move.lifeAreas },
      triggerSurvivesMove ? focusTarget : undefined,
    );
    return saved;
  }

  async function performReorder(
    lifeArea: string,
    anchor: LandscapeAnchor,
    noteIds: string[],
    focusCard: LandscapeCardProjection,
    focusTarget?: HTMLButtonElement,
  ) {
    if (!onReorder) return;
    const previous = cell(board, lifeArea, anchor)?.noteIds ?? [];
    await onReorder(lifeArea, anchor, noteIds);
    const moved = cardsFor(board, lifeArea, anchor).find(
      (card, index) => card.noteId !== noteIds[index],
    );
    setUndo({
      kind: 'order',
      lifeArea,
      anchor,
      noteIds: previous,
      title: moved?.title ?? 'this note',
    });
    restoreFocusAfterMutation(focusCard, focusTarget);
  }

  function beginDrag(event: DragStartEvent) {
    const card = event.active.data.current?.card as
      LandscapeCardProjection | undefined;
    const mode = event.active.data.current?.dragMode as DragMode | undefined;
    if (!card || (mode !== 'move' && mode !== 'link')) return;
    setInteractionError('');
    setActiveDrag({ card, mode });
    setDropTarget(undefined);
    setDragAnnouncement(
      `${mode === 'move' ? 'Moving' : 'Linking'} ${card.title}. Choose a destination. Press Escape to cancel.`,
    );
  }

  function previewDrop(event: DragOverEvent) {
    const target = event.over?.data.current as LandscapeDropTarget | undefined;
    setDropTarget(target?.lifeArea && target.anchor ? target : undefined);
  }

  function finishDrag(event: DragEndEvent) {
    const active = activeDrag;
    const target = event.over?.data.current as LandscapeDropTarget | undefined;
    setActiveDrag(undefined);
    setDropTarget(undefined);
    if (!active || !target?.lifeArea || !target.anchor) {
      setDragAnnouncement('Move cancelled. Nothing changed.');
      return;
    }
    const move: LandscapeMove =
      active.mode === 'link'
        ? {
            card: active.card,
            lifeAreas: [
              ...new Set([...active.card.lifeAreas, target.lifeArea]),
            ],
            anchor: active.card.anchor,
          }
        : {
            card: active.card,
            lifeAreas: [target.lifeArea],
            anchor: target.anchor,
          };
    void performMove(move).then(
      () =>
        setDragAnnouncement(
          `${active.card.title} ${active.mode === 'link' ? 'is also shown' : 'moved'} in ${areaLabel(areas, target.lifeArea)}.`,
        ),
      (reason: unknown) => {
        const message =
          reason instanceof Error
            ? reason.message
            : 'The move could not be saved.';
        setInteractionError(message);
        setDragAnnouncement(message);
      },
    );
  }

  function cancelDrag() {
    setActiveDrag(undefined);
    setDropTarget(undefined);
    setDragAnnouncement('Move cancelled. Nothing changed.');
    setDragSession((value) => value + 1);
  }

  async function confirmRecovery() {
    if (!onRepairAreas || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      await onRepairAreas();
      setRecoveryOpen(false);
    } catch (reason) {
      setRecoveryError(
        reason instanceof Error
          ? reason.message
          : 'The life area setup could not be restored.',
      );
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function undoLastMove() {
    if (!undo || undoBusy) return;
    setUndoBusy(true);
    setUndoError('');
    try {
      if (undo.kind === 'move') await onMove?.(undo.move);
      else await onReorder?.(undo.lifeArea, undo.anchor, undo.noteIds);
      setUndo(undefined);
    } catch (reason) {
      setUndoError(
        reason instanceof Error
          ? reason.message
          : 'The move could not be undone.',
      );
    } finally {
      setUndoBusy(false);
    }
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => settlePendingFocus(true));
    return () => cancelAnimationFrame(frame);
  }, [board, settlePendingFocus]);

  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (
      !areas.length ||
      view.kind !== 'focus' ||
      areas.some((area) => area.id === view.area)
    )
      return;
    onNavigate(`/landscape/${areas[0]!.id}`);
  }, [areas, onNavigate, view]);

  return (
    <DndContext
      collisionDetection={pointerWithin}
      key={dragSession}
      onDragCancel={cancelDrag}
      onDragEnd={finishDrag}
      onDragOver={previewDrop}
      onDragStart={beginDrag}
      sensors={sensors}
    >
      <div className="life-landscape">
        <header className="life-landscape__header">
          <RoomHeading
            eyebrow="your life, held together"
            intro="See your whole life at a glance, then step into one area to tend it."
            title="Life Landscape"
          />
          <SegmentedControl areas={areas} onNavigate={onNavigate} view={view} />
        </header>
        {state === 'loading' && <p role="status">Gathering the Landscape…</p>}
        {state === 'stale' && (
          <p role="status">
            Showing this Landscape while the index catches up.
          </p>
        )}
        {state === 'error' && (
          <p className="life-landscape__error" role="alert">
            {error ??
              'The Landscape could not be gathered. Your notes remain safe.'}
          </p>
        )}
        {repairRequired && (
          <section className="life-landscape__recovery" role="alert">
            <h2>Life area setup needs attention</h2>
            <p>
              This Studio could not read the saved life area setup. The original
              file is untouched, and these defaults are only a preview.
            </p>
            {!recoveryOpen ? (
              <button onClick={() => setRecoveryOpen(true)} type="button">
                Review recovery
              </button>
            ) : (
              <div aria-label="Confirm life area recovery" role="group">
                <p>
                  Replacing the file will save these defaults over the
                  unreadable setup. Continue only if that is what you want.
                </p>
                <button
                  disabled={recoveryBusy}
                  onClick={() => setRecoveryOpen(false)}
                  type="button"
                >
                  Keep original file
                </button>
                <button
                  disabled={recoveryBusy}
                  onClick={() => void confirmRecovery()}
                  type="button"
                >
                  Replace with defaults
                </button>
              </div>
            )}
            {recoveryError && <p role="alert">{recoveryError}</p>}
          </section>
        )}
        {configUnavailable && (
          <section
            aria-label="Life area compatibility"
            className="life-landscape__recovery"
            role="status"
          >
            <h2>Life area settings are read-only</h2>
            <p>
              {configUnavailable === 'unsupported'
                ? 'These life areas were saved by a newer version of Ateliera. Update the app before managing them. The configuration file is untouched.'
                : 'Life area settings are unavailable right now. Nothing can be changed, and the configuration file remains untouched.'}
            </p>
          </section>
        )}
        {interactionError && (
          <p className="life-landscape__error" role="alert">
            {interactionError}
          </p>
        )}

        {tourExamples.length > 0 && <TourGlimpseLabel />}
        {view.kind === 'matrix' && (
          <div
            aria-label="Life Landscape matrix"
            className="life-landscape__matrix-region"
            role="region"
            tabIndex={0}
          >
            <div
              className="life-landscape__matrix"
              style={
                {
                  '--landscape-area-count': areas.length,
                  '--landscape-matrix-min': `${208 + areas.length * 132}px`,
                } as CSSProperties
              }
            >
              <div className="life-landscape__corner">Five anchors</div>
              {areas.map((area) => (
                <button
                  className="life-landscape__column-heading"
                  data-landscape-area={area.id}
                  key={area.id}
                  onClick={() => onNavigate(`/landscape/${area.id}`)}
                  type="button"
                  aria-label={`Open ${area.title}`}
                >
                  {area.title}
                </button>
              ))}
              {landscapeAnchorDefinitions.map((anchor) => (
                <div className="life-landscape__matrix-row" key={anchor.id}>
                  <div className="life-landscape__anchor">
                    <strong>{anchor.label}</strong>
                    <span>{anchor.prompt}</span>
                  </div>
                  {areas.map((area) => {
                    const projected = cell(board, area.id, anchor.id);
                    const example =
                      area.id === areas[0]?.id
                        ? exampleForAnchor(tourExamples, anchor.id)
                        : undefined;
                    return (
                      <DropZone
                        anchor={anchor.id}
                        className="life-landscape__cell"
                        key={area.id}
                        lifeArea={area.id}
                      >
                        {projected?.featured ? (
                          <button
                            aria-label={projected.featured.title}
                            className={`life-landscape__cell-title life-landscape__cell-title--${projected.featured.semanticType}`}
                            onClick={(event) =>
                              onOpen?.(projected.featured!, event.currentTarget)
                            }
                            title={projected.featured.title}
                            type="button"
                          >
                            {projected.featured.title}
                          </button>
                        ) : example ? null : onCreate ? (
                          <button
                            aria-label={`Add to ${area.title} ${anchor.label}`}
                            className="life-landscape__cell-add"
                            onClick={(event) =>
                              onCreate(area.id, anchor.id, event.currentTarget)
                            }
                            type="button"
                          />
                        ) : null}
                        {(projected?.additionalCount ?? 0) > 0 && (
                          <button
                            className="life-landscape__additional"
                            onClick={() => onNavigate(`/landscape/${area.id}`)}
                            type="button"
                          >
                            +{projected!.additionalCount} more
                          </button>
                        )}
                        {example && (
                          <TourExampleCard
                            className="life-landscape__tour-example"
                            example={example}
                            headingLevel={2}
                            {...(example.startingPoint && onUseTourExample
                              ? {
                                  onUse: (
                                    item: TourExample,
                                    trigger: HTMLButtonElement,
                                  ) =>
                                    onUseTourExample(item, trigger, {
                                      lifeArea: area.id,
                                    }),
                                }
                              : {})}
                          />
                        )}
                      </DropZone>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {view.kind === 'focus' && (
          <div className="life-landscape__focus">
            <button
              className="life-landscape__back"
              onClick={() => onNavigate('/landscape')}
              type="button"
            >
              ← Back to map
            </button>
            <AreaSwitcher
              areas={areas}
              current={view.area}
              onNavigate={onNavigate}
            />
            <h2 className="life-landscape__area-title">
              {areaLabel(areas, view.area)}
            </h2>
            {landscapeAnchorDefinitions.map((anchor) => {
              const cards = cardsFor(board, view.area, anchor.id);
              const example = exampleForAnchor(tourExamples, anchor.id);
              return (
                <section
                  className="life-landscape__section"
                  key={anchor.id}
                  aria-labelledby={`landscape-${view.area}-${anchor.id}`}
                >
                  <div className="life-landscape__section-heading">
                    <div>
                      <h2 id={`landscape-${view.area}-${anchor.id}`}>
                        {anchor.label}
                      </h2>
                      <p>{anchor.prompt}</p>
                    </div>
                    {onCreate && (
                      <button
                        onClick={(event) =>
                          onCreate(view.area, anchor.id, event.currentTarget)
                        }
                        type="button"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <DropZone
                    anchor={anchor.id}
                    className="life-landscape__section-drop"
                    lifeArea={view.area}
                  >
                    {cards.length === 0 && !example ? (
                      <p className="life-landscape__empty">
                        There is room here.
                      </p>
                    ) : (
                      <div className="life-landscape__cards">
                        {cards.map((card, index) => (
                          <NoteCard
                            areas={areas}
                            card={card}
                            currentArea={view.area}
                            key={card.noteId}
                            {...(onMove ? { onMove: performMove } : {})}
                            {...(onOpen ? { onOpen } : {})}
                            {...(onReorder
                              ? { onReorder: performReorder }
                              : {})}
                            position={index}
                            sectionCards={cards}
                          />
                        ))}
                      </div>
                    )}
                    {example && (
                      <TourExampleCard
                        className="life-landscape__tour-example"
                        example={example}
                        {...(example.startingPoint && onUseTourExample
                          ? {
                              onUse: (
                                item: TourExample,
                                trigger: HTMLButtonElement,
                              ) =>
                                onUseTourExample(item, trigger, {
                                  lifeArea: view.area,
                                }),
                            }
                          : {})}
                      />
                    )}
                  </DropZone>
                </section>
              );
            })}
          </div>
        )}

        {view.kind === 'lens' && (
          <div className="life-landscape__lens">
            <nav
              aria-label="Landscape anchors"
              className="life-landscape__anchor-switcher"
            >
              {landscapeAnchorDefinitions.map((anchor) => (
                <button
                  aria-current={anchor.id === view.anchor ? 'page' : undefined}
                  key={anchor.id}
                  onClick={() => onNavigate(`/landscape/lens/${anchor.id}`)}
                  type="button"
                >
                  {anchor.label}
                </button>
              ))}
            </nav>
            <h2>
              {
                landscapeAnchorDefinitions.find(
                  (anchor) => anchor.id === view.anchor,
                )?.label
              }
            </h2>
            <p>
              {
                landscapeAnchorDefinitions.find(
                  (anchor) => anchor.id === view.anchor,
                )?.prompt
              }
            </p>
            <div className="life-landscape__lens-grid">
              {areas.map((area) => {
                const cards = cardsFor(board, area.id, view.anchor);
                return (
                  <section key={area.id}>
                    <h3>{area.title}</h3>
                    <DropZone
                      anchor={view.anchor}
                      className="life-landscape__lens-drop"
                      lifeArea={area.id}
                    >
                      {cards.length === 0 ? (
                        <p className="life-landscape__empty">
                          There is room here.
                        </p>
                      ) : (
                        cards.map((card, index) => (
                          <NoteCard
                            areas={areas}
                            card={card}
                            currentArea={area.id}
                            key={card.noteId}
                            {...(onMove ? { onMove: performMove } : {})}
                            {...(onOpen ? { onOpen } : {})}
                            {...(onReorder
                              ? { onReorder: performReorder }
                              : {})}
                            position={index}
                            sectionCards={cards}
                          />
                        ))
                      )}
                    </DropZone>
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {!repairRequired &&
          !configUnavailable &&
          (onAddArea || onRemoveArea || onRenameArea || onReorderArea) && (
            <details className="life-landscape__manage">
              <summary>Manage life areas</summary>
              <p>
                {areas.length} active. Five to ten usually keeps the Landscape
                spacious.
              </p>
              <ol>
                {areas.map((area, index) => (
                  <li key={area.id}>
                    {renamingArea === area.id ? (
                      <GuidedField
                        controlId={`landscape-rename-${area.id}`}
                        description={landscapeFieldGuidance.renameArea.description}
                        label={`Name for ${area.title}`}
                      >
                        <input
                          id={`landscape-rename-${area.id}`}
                          maxLength={80}
                          onChange={(event) =>
                            setRenameTitle(event.target.value)
                          }
                          placeholder={landscapeFieldGuidance.renameArea.example}
                          value={renameTitle}
                        />
                      </GuidedField>
                    ) : (
                      <span>{area.title}</span>
                    )}
                    {onReorderArea && (
                      <>
                        <button
                          aria-label={`Move ${area.title} earlier`}
                          disabled={index === 0}
                          onClick={() => onReorderArea(area.id, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${area.title} later`}
                          disabled={index === areas.length - 1}
                          onClick={() => onReorderArea(area.id, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                      </>
                    )}
                    {onRenameArea &&
                      (renamingArea === area.id ? (
                        <button
                          disabled={renameTitle.trim() === ''}
                          onClick={() => {
                            onRenameArea(area.id, renameTitle.trim());
                            setRenamingArea(undefined);
                          }}
                          type="button"
                        >
                          Save {area.title} name
                        </button>
                      ) : (
                        <button
                          aria-label={`Rename ${area.title}`}
                          onClick={() => {
                            setRenamingArea(area.id);
                            setRenameTitle(area.title);
                          }}
                          type="button"
                        >
                          Rename
                        </button>
                      ))}
                    <button
                      disabled={areas.length <= 1}
                      onClick={() => onRemoveArea?.(area.id)}
                      type="button"
                    >
                      Hide
                    </button>
                  </li>
                ))}
              </ol>
              {onAddArea && (
                <div className="life-landscape__area-library">
                  {defaultLifeAreas
                    .filter(
                      (area) => !areas.some((active) => active.id === area.id),
                    )
                    .map((area) => (
                      <button
                        key={area.id}
                        onClick={() =>
                          onAddArea({ id: area.id, title: area.title })
                        }
                        type="button"
                      >
                        Add {area.title}
                      </button>
                    ))}
                  <GuidedField
                    controlId="landscape-new-area"
                    description={landscapeFieldGuidance.newArea.description}
                    label="New life area"
                  >
                    <input
                      id="landscape-new-area"
                      maxLength={80}
                      onChange={(event) => setNewAreaTitle(event.target.value)}
                      placeholder={landscapeFieldGuidance.newArea.example}
                      value={newAreaTitle}
                    />
                  </GuidedField>
                  <button
                    disabled={newAreaTitle.trim() === ''}
                    onClick={() => {
                      onAddArea({ title: newAreaTitle.trim() });
                      setNewAreaTitle('');
                    }}
                    type="button"
                  >
                    Add custom area
                  </button>
                </div>
              )}
            </details>
          )}

        {undo && (
          <div aria-live="polite" className="life-landscape__undo">
            <span>
              Moved {undo.kind === 'move' ? undo.move.card.title : undo.title}.
            </span>
            <button
              disabled={undoBusy}
              onClick={() => void undoLastMove()}
              type="button"
            >
              Undo move
            </button>
            {undoError && <p role="alert">{undoError}</p>}
          </div>
        )}
        <span aria-live="polite" className="studio-visually-hidden">
          {dragAnnouncement}
        </span>
        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div
              aria-label={`Drag preview for ${activeDrag.card.title}`}
              className="life-landscape__drag-overlay"
              role="status"
            >
              <strong>{activeDrag.card.title}</strong>
              <span>
                {activeDrag.mode === 'link' ? 'Also show' : 'Move'}
                {dropTarget
                  ? ` in ${areaLabel(areas, dropTarget.lifeArea)}${activeDrag.mode === 'move' ? ` · ${landscapeAnchorDefinitions.find((item) => item.id === dropTarget.anchor)?.label}` : ''}`
                  : ' · Choose a destination'}
              </span>
              <button
                onClick={cancelDrag}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                Cancel drag
              </button>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
