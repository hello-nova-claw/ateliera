import {
  type DraftRecoveryRecord,
  type SavedNote,
  type StudioService,
} from '@studio/application';
import { parseNote } from '@studio/content';
import { CardEditor, type RecoveryDraftView } from '@studio/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserDraftRecovery } from './browser-draft-recovery';
import { useAutosave } from './use-autosave';

export interface NoteEditorSessionProps {
  initial: SavedNote;
  onClose: () => void;
  requestClose: number;
  service: StudioService;
}

export function NoteEditorSession({
  initial,
  onClose,
  requestClose,
  service,
}: NoteEditorSessionProps) {
  const recovery = useMemo(browserDraftRecovery, []);
  const [version, setVersion] = useState(initial);
  const [restored, setRestored] = useState<SavedNote>();

  async function beginManualMerge(local: SavedNote['note']): Promise<void> {
    const remote = await service.load(version.path);
    const merged = {
      ...remote,
      note: {
        ...remote.note,
        body: `${local.body}\n\n---\n\n${remote.note.body}`,
      },
    };
    recovery.write({
      key: remote.path,
      body: merged.note.body,
      ...(merged.note.title === undefined ? {} : { title: merged.note.title }),
      expectedHash: remote.hash,
      updatedAt: new Date().toISOString(),
    });
    setVersion(remote);
    setRestored(merged);
  }

  return (
    <AutosaveEditor
      initial={version}
      key={`${version.hash}:${restored?.note.body ?? ''}`}
      onClose={onClose}
      onManualMerge={beginManualMerge}
      recovery={recovery}
      requestClose={requestClose}
      {...(restored === undefined ? {} : { restored })}
      service={service}
    />
  );
}

function AutosaveEditor({
  initial,
  onClose,
  onManualMerge,
  recovery,
  requestClose,
  restored,
  service,
}: {
  initial: SavedNote;
  onClose: () => void;
  onManualMerge: (local: SavedNote['note']) => Promise<void>;
  recovery: ReturnType<typeof browserDraftRecovery>;
  requestClose: number;
  restored?: SavedNote;
  service: StudioService;
}) {
  const pending = recovery.readForDurable(initial.path, initial.hash);
  const [recoveryView, setRecoveryView] = useState<RecoveryDraftView | undefined>(
    pending.kind === 'none'
      ? undefined
      : {
          body: pending.draft.body,
          ...(pending.draft.title === undefined ? {} : { title: pending.draft.title }),
        },
  );
  const autosave = useAutosave({
    initial: restored ?? initial,
    save: (note, expectedHash) =>
      service.save({ note, path: initial.path, expectedHash }),
    writeRecovery: (note, expectedHash) => {
      const record: DraftRecoveryRecord = {
        key: initial.path,
        body: note.body,
        ...(note.title === undefined ? {} : { title: note.title }),
        expectedHash,
        updatedAt: new Date().toISOString(),
      };
      recovery.write(record);
    },
    removeRecovery: () => recovery.remove(initial.path),
  });
  const flush = autosave.flush;

  const close = useCallback(async (): Promise<void> => {
    await flush();
    onClose();
  }, [flush, onClose]);

  useEffect(() => {
    if (requestClose > 0) void close();
  }, [close, requestClose]);

  return (
    <div className="note-editor-session">
      <button className="note-editor-session__close" onClick={() => void close()} type="button">
        Close editor
      </button>
      <CardEditor
        {...(autosave.conflict === undefined
          ? {}
          : { conflict: {
                local: autosave.conflict.attemptedNote,
                remoteBody: readableBody(autosave.conflict.durableText),
              } })}
        note={autosave.note}
        onChange={autosave.update}
        onDiscardDraft={() => {
          recovery.remove(initial.path);
          setRecoveryView(undefined);
        }}
        onFlush={autosave.flush}
        onKeepMine={() => {
          if (autosave.conflict === undefined) return;
          void service
            .capture({
              body: autosave.conflict.attemptedNote.body,
              ...(autosave.conflict.attemptedNote.title === undefined
                ? {}
                : { title: autosave.conflict.attemptedNote.title }),
            })
            .then(() => {
              recovery.remove(initial.path);
              onClose();
            });
        }}
        onKeepOther={() => {
          recovery.remove(initial.path);
          onClose();
        }}
        onManualMerge={() => {
          if (autosave.conflict !== undefined) {
            void onManualMerge(autosave.conflict.attemptedNote);
          }
        }}
        onRestoreDraft={() => {
          if (pending.kind === 'none') return;
          autosave.update({
            ...autosave.note,
            body: pending.draft.body,
            ...(pending.draft.title === undefined
              ? {}
              : { title: pending.draft.title }),
          });
          setRecoveryView(undefined);
        }}
        {...(recoveryView === undefined ? {} : { recoveryDraft: recoveryView })}
        saveState={autosave.state}
      />
    </div>
  );
}

function readableBody(markdown: string): string {
  const parsed = parseNote(markdown);
  return parsed.ok ? parsed.note.body : markdown;
}
