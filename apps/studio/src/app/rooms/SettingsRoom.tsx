import type { StudioService } from '@studio/application';
import {
  applyVaultImport,
  createVaultBackup,
  prepareVaultImport,
  type VaultBackup,
  type VaultImportPlan,
  type VaultPort,
} from '@studio/storage/portable';
import { useRef } from 'react';

import {
  PortabilitySettings,
  type PortabilityPreview,
} from '../../features/settings/PortabilitySettings';
import { RhythmProfileSettings } from '../../features/settings/RhythmProfileSettings';
import { RhythmLayersSettings } from '../../features/settings/RhythmLayersSettings';
import { RoomsSettings } from '../../features/settings/RoomsSettings';
import { resolveRhythmLayers } from '../../features/settings/rhythm-layers';
import { useRhythmProfile } from '../../features/settings/use-rhythm-profile';
import { useStudioPreferences } from '../../features/settings/use-studio-preferences';

export interface SettingsRoomProps {
  onStartTour?: () => void;
  saveBackup?: (backup: VaultBackup) => Promise<void | 'cancelled' | 'saved'>;
  service?: StudioService;
  tourAction?: 'continue' | 'restart';
  vault?: VaultPort;
}

async function saveBackupToChosenDestination(
  backup: VaultBackup,
): Promise<'cancelled' | 'saved'> {
  if ('__TAURI_INTERNALS__' in window) {
    const { saveTauriVaultBackup } = await import('@studio/storage/tauri');
    return saveTauriVaultBackup(backup.bytes, backup.fileName);
  }
  const blob = new Blob([backup.bytes.slice().buffer], {
    type: 'application/zip',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = backup.fileName;
  anchor.href = url;
  anchor.rel = 'noopener';
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
  return 'saved';
}

function previewFor(file: File, plan: VaultImportPlan): PortabilityPreview {
  return {
    archiveName: file.name,
    exportedAt: plan.manifest.generatedAt,
    items: plan.items.map((item) => ({
      action: item.action,
      ...(item.existingPath === undefined
        ? {}
        : { existingPath: item.existingPath }),
      path: item.path,
      size: item.size,
      ...(item.action !== 'conflict'
        ? {}
        : {
            reason:
              item.existingNoteId !== undefined &&
              item.incomingNoteId !== undefined
                ? `The current file belongs to ${item.existingNoteId}; this backup belongs to ${item.incomingNoteId}.`
                : 'The current file and this backup need an explicit choice.',
          }),
    })),
  };
}

export default function SettingsRoom({
  onStartTour,
  saveBackup = saveBackupToChosenDestination,
  service,
  tourAction = 'restart',
  vault,
}: SettingsRoomProps) {
  const pendingPlan = useRef<VaultImportPlan | undefined>(undefined);
  const rhythmProfile = useRhythmProfile(service);
  const preferences = useStudioPreferences(service);

  return (
    <>
      <PortabilitySettings
        {...(vault === undefined
          ? {}
          : {
              onExport: async () => {
                return saveBackup(
                  await createVaultBackup(vault, { reason: 'manual' }),
                );
              },
              onPrepareRestore: async (file: File) => {
                const plan = await prepareVaultImport(vault, file);
                pendingPlan.current = plan;
                return previewFor(file, plan);
              },
              onRestore: async (
                preview: PortabilityPreview,
                conflicts: Readonly<Record<string, 'overwrite' | 'skip'>>,
              ) => {
                const plan = pendingPlan.current;
                if (
                  plan === undefined ||
                  preview.exportedAt !== plan.manifest.generatedAt
                ) {
                  throw new Error('Check this backup again before restoring.');
                }
                await applyVaultImport(vault, plan, {
                  confirm: true,
                  conflicts,
                });
              },
            })}
      />
      {service !== undefined && (
        <RoomsSettings
          preferences={preferences.preferences}
          rhythmLayers={resolveRhythmLayers(preferences.preferences)}
          onChange={(next) => preferences.save(next)}
        />
      )}
      {service !== undefined && (
        <RhythmLayersSettings
          layers={resolveRhythmLayers(preferences.preferences)}
          onChange={(next) =>
            preferences.save({ ...preferences.preferences, rhythm: next })
          }
        />
      )}
      {service !== undefined && (
        <RhythmProfileSettings
          key={rhythmProfile.revision ?? 'new'}
          onSave={rhythmProfile.save}
          profile={rhythmProfile.profile}
        />
      )}
      {onStartTour && (
        <section
          aria-labelledby="settings-first-visit"
          className="portability-settings__section"
        >
          <div>
            <p className="portability-settings__kicker">Return gently</p>
            <h2 id="settings-first-visit">First visit</h2>
            <p className="portability-settings__description">
              Wander through the five rooms again. The examples remain temporary
              and none of your own writing is changed.
            </p>
          </div>
          <button onClick={onStartTour} type="button">
            {tourAction === 'continue'
              ? 'Continue the tour'
              : 'Start the tour again'}
          </button>
        </section>
      )}
      {vault === undefined && (
        <p className="portability-settings__notice" role="status">
          Open a Studio to create or restore a portable backup.
        </p>
      )}
    </>
  );
}
