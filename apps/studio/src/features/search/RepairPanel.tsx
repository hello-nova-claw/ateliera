import {
  SearchRepairConflictError,
  type BrokenLinkRepairItem,
  type MetadataRepairItem,
  type StudioSearchRepairItem,
} from '@studio/application';
import { inspectRepairSource } from '@studio/content';
import {
  landscapeAnchors,
  noteStatuses,
  semanticTypes,
  type LandscapeAnchor,
  type NoteStatus,
  type SemanticType,
  type StudioNote,
} from '@studio/domain';
import type { MarkdownLinkEdit } from '@studio/content';
import { useId, useRef, useState } from 'react';

import './RepairPanel.css';

export interface RepairPanelProps {
  items: StudioSearchRepairItem[];
  onRepairLink?: (
    item: BrokenLinkRepairItem,
    edit: MarkdownLinkEdit,
  ) => Promise<void> | void;
  onRepairMetadata?: (
    item: MetadataRepairItem,
    metadata: StudioNote,
  ) => Promise<void> | void;
}

interface RepairConflictView {
  attemptedText: string;
  durableText: string;
}

function conflictFrom(reason: unknown): RepairConflictView | undefined {
  return reason instanceof SearchRepairConflictError
    ? { attemptedText: reason.attemptedText, durableText: reason.durableText }
    : undefined;
}

function RepairConflict({ conflict }: { conflict: RepairConflictView }) {
  return (
    <section aria-label="Repair conflict versions" className="repair-card__conflict">
      <h4>Review both versions</h4>
      <div>
        <section><h5>Your attempted repair</h5><pre>{conflict.attemptedText}</pre></section>
        <section><h5>Current stored note</h5><pre>{conflict.durableText}</pre></section>
      </div>
    </section>
  );
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function selectedSemantic(value: unknown): SemanticType {
  return semanticTypes.includes(value as SemanticType)
    ? value as SemanticType
    : 'reflection';
}

function selectedStatus(value: unknown): NoteStatus {
  return noteStatuses.includes(value as NoteStatus) && value !== 'trashed'
    ? value as NoteStatus
    : 'draft';
}

function selectedLandscapeAnchor(value: unknown): LandscapeAnchor | undefined {
  return landscapeAnchors.includes(value as LandscapeAnchor)
    ? value as LandscapeAnchor
    : undefined;
}

function selectedSource(value: unknown): StudioNote['source'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const selected = {
    ...(typeof source.title === 'string' ? { title: source.title } : {}),
    ...(typeof source.creator === 'string' ? { creator: source.creator } : {}),
    ...(typeof source.url === 'string' ? { url: source.url } : {}),
  };
  return Object.keys(selected).length > 0 ? selected : undefined;
}

function listInput(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function withTitle(note: StudioNote, title: string): StudioNote {
  if (title !== '') return { ...note, title };
  const result = { ...note };
  delete result.title;
  return result;
}

function metadataFromItem(item: MetadataRepairItem): StudioNote {
  const source = inspectRepairSource(item.sourceText);
  const data = source.frontmatter;
  const display = typeof data.display === 'object' && data.display !== null
    ? data.display as Record<string, unknown>
    : {};
  const privacy = typeof data.privacy === 'object' && data.privacy !== null
    ? data.privacy as Record<string, unknown>
    : {};
  const now = new Date().toISOString();
  const landscapeAnchor = selectedLandscapeAnchor(data.landscape_anchor);
  const sourceContext = selectedSource(data.source);
  return {
    schemaVersion: 1,
    id: stringValue(data.id),
    ...(stringValue(data.title) ? { title: stringValue(data.title) } : {}),
    body: source.body,
    cardType: stringValue(data.card_type, 'text'),
    semanticType: selectedSemantic(data.semantic_type),
    status: selectedStatus(data.status),
    rooms: stringList(data.rooms),
    lifeAreas: stringList(data.life_areas),
    ...(landscapeAnchor === undefined ? {} : { landscapeAnchor }),
    seasons: stringList(data.seasons),
    tags: stringList(data.tags),
    created: stringValue(data.created, now),
    updated: stringValue(data.updated, now),
    ...(sourceContext === undefined ? {} : { source: sourceContext }),
    attachments: stringList(data.attachments),
    display: {
      featured: display.featured === true,
      ...(typeof display.cover === 'string' ? { cover: display.cover } : {}),
    },
    privacy: {
      sensitivity: privacy.sensitivity === 'sensitive' ? 'sensitive' : 'private',
      aiAccess:
        privacy.ai_access === 'never' ||
        privacy.ai_access === 'selected' ||
        privacy.ai_access === 'scoped'
          ? privacy.ai_access
          : 'ask',
    },
    extraFrontmatter: {},
    lineEnding: source.lineEnding,
  };
}

function MetadataRepair({
  item,
  onRepair,
}: {
  item: MetadataRepairItem;
  onRepair?: RepairPanelProps['onRepairMetadata'];
}) {
  const [draft, setDraft] = useState(() => metadataFromItem(item));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<RepairConflictView>();
  const button = useRef<HTMLButtonElement>(null);
  const timestampHelpId = useId();

  function setList(key: 'rooms' | 'lifeAreas' | 'seasons' | 'tags', value: string) {
    setDraft((current) => ({ ...current, [key]: listInput(value) }));
  }

  return (
    <article className="repair-card repair-card--metadata">
      <p className="repair-card__eyebrow">Metadata</p>
      <h3>{item.path}</h3>
      <ul className="repair-card__errors">
        {item.errors.map((error, index) => (
          <li key={`${error.code}:${error.path ?? ''}:${index}`}>
            {error.path ? `${error.path} · ` : ''}{error.message}
          </li>
        ))}
      </ul>
      <details>
        <summary>Read the untouched body</summary>
        <pre>{item.rawBody}</pre>
      </details>
      <form
        className="repair-card__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!onRepair || busy) return;
          setBusy(true);
          setMessage(undefined);
          setConflict(undefined);
          void Promise.resolve(onRepair(item, draft)).then(
            () => setMessage('Metadata repaired.'),
            (reason: unknown) => {
              setConflict(conflictFrom(reason));
              setMessage(
                reason instanceof Error ? reason.message : 'This metadata could not be repaired.',
              );
            },
          ).finally(() => {
            setBusy(false);
            requestAnimationFrame(() => requestAnimationFrame(() => button.current?.focus()));
          });
        }}
      >
        <label>
          <span>Stable note ID</span>
          <input
            onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
            required
            value={draft.id}
          />
        </label>
        <label>
          <span>Title</span>
          <input
            onChange={(event) => setDraft((current) => withTitle(current, event.target.value))}
            value={draft.title ?? ''}
          />
        </label>
        <label>
          <span>Card type</span>
          <input
            onChange={(event) => setDraft((current) => ({ ...current, cardType: event.target.value }))}
            required
            value={draft.cardType}
          />
        </label>
        <label>
          <span>Meaning</span>
          <select
            onChange={(event) => setDraft((current) => ({
              ...current,
              semanticType: event.target.value as SemanticType,
            }))}
            value={draft.semanticType}
          >
            {semanticTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            onChange={(event) => setDraft((current) => ({
              ...current,
              status: event.target.value as NoteStatus,
            }))}
            value={draft.status}
          >
            {noteStatuses.filter((status) => status !== 'trashed').map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Created</span>
          <input
            aria-describedby={timestampHelpId}
            onChange={(event) => setDraft((current) => ({
              ...current,
              created: event.target.value,
            }))}
            required
            spellCheck={false}
            value={draft.created}
          />
        </label>
        <label>
          <span>Updated</span>
          <input
            aria-describedby={timestampHelpId}
            onChange={(event) => setDraft((current) => ({
              ...current,
              updated: event.target.value,
            }))}
            required
            spellCheck={false}
            value={draft.updated}
          />
        </label>
        <p className="repair-card__hint" id={timestampHelpId}>
          Use an ISO 8601 timestamp including a timezone, for example 2026-07-14T09:00:00.000Z.
        </p>
        {([
          ['rooms', 'Rooms'],
          ['lifeAreas', 'Life areas'],
          ['seasons', 'Seasons'],
          ['tags', 'Tags'],
        ] as const).map(([key, label]) => (
          <label key={key}>
            <span>{label} <small>comma separated</small></span>
            <input onChange={(event) => setList(key, event.target.value)} value={draft[key].join(', ')} />
          </label>
        ))}
        <button disabled={busy || !onRepair} ref={button} type="submit">
          {busy ? 'Repairing…' : 'Repair metadata'}
        </button>
      </form>
      {message && <p className="repair-card__message" role={message.includes('repaired.') ? 'status' : 'alert'}>{message}</p>}
      {conflict && <RepairConflict conflict={conflict} />}
    </article>
  );
}

function BrokenLinkRepair({
  item,
  onRepair,
}: {
  item: BrokenLinkRepairItem;
  onRepair?: RepairPanelProps['onRepairLink'];
}) {
  const [kind, setKind] = useState(item.linkKind);
  const [target, setTarget] = useState(item.target);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<RepairConflictView>();
  const pending = useRef(false);
  const relink = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);

  function repair(edit: MarkdownLinkEdit, trigger: HTMLButtonElement): void {
    if (!onRepair || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage(undefined);
    setConflict(undefined);
    void Promise.resolve(onRepair(item, edit)).then(
      () => setMessage(edit.kind === 'remove' ? 'Link removed.' : 'Link repaired.'),
      (reason: unknown) => {
        setConflict(conflictFrom(reason));
        setMessage(
          reason instanceof Error ? reason.message : 'This link could not be repaired.',
        );
      },
    ).finally(() => {
      pending.current = false;
      setBusy(false);
      requestAnimationFrame(() => requestAnimationFrame(() => trigger.focus()));
    });
  }

  return (
    <article className="repair-card repair-card--link">
      <p className="repair-card__eyebrow">{item.state === 'ambiguous' ? 'Ambiguous link' : 'Broken link'}</p>
      <h3>{item.label}</h3>
      <p><code>{item.target}</code> in {item.path}</p>
      {item.candidateIds && (
        <p className="repair-card__candidates">
          Possible notes: {item.candidateIds.join(', ')}
        </p>
      )}
      <div className="repair-card__link-fields">
        <label>
          <span>Link kind</span>
          <select onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}>
            <option value="wiki">Wiki title</option>
            <option value="path">Relative path</option>
            <option value="id">Stable note ID</option>
          </select>
        </label>
        <label>
          <span>New target</span>
          <input onChange={(event) => setTarget(event.target.value)} value={target} />
        </label>
      </div>
      <div className="repair-card__actions">
        <button
          disabled={busy || !onRepair || target.trim() === ''}
          onClick={(event) => repair({ kind, target: target.trim() }, event.currentTarget)}
          ref={relink}
          type="button"
        >
          {busy ? 'Repairing…' : 'Relink'}
        </button>
        <button
          disabled={busy || !onRepair}
          onClick={(event) => repair({ kind: 'remove' }, event.currentTarget)}
          ref={remove}
          type="button"
        >
          Remove link
        </button>
      </div>
      {message && <p className="repair-card__message" role={message.endsWith('repaired.') || message.endsWith('removed.') ? 'status' : 'alert'}>{message}</p>}
      {conflict && <RepairConflict conflict={conflict} />}
    </article>
  );
}

export function RepairPanel({ items, onRepairLink, onRepairMetadata }: RepairPanelProps) {
  return (
    <section aria-labelledby="repair-panel-title" className="repair-panel">
      <header>
        <p className="repair-panel__eyebrow">Nothing is discarded</p>
        <h2 id="repair-panel-title">Repair</h2>
        <p>Review the exact problem, then choose what should change.</p>
      </header>
      {items.length === 0 ? (
        <p className="repair-panel__empty">Nothing needs repair.</p>
      ) : (
        <div className="repair-panel__items">
          {items.map((item) => item.kind === 'metadata' ? (
            <MetadataRepair item={item} key={`metadata:${item.path}`} onRepair={onRepairMetadata} />
          ) : (
            <BrokenLinkRepair item={item} key={`link:${item.path}:${item.occurrence}`} onRepair={onRepairLink} />
          ))}
        </div>
      )}
    </section>
  );
}
