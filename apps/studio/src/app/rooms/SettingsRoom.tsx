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

export interface SettingsRoomProps {
  saveBackup?: (
    backup: VaultBackup,
  ) => Promise<void | 'cancelled' | 'saved'>;
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
  saveBackup = saveBackupToChosenDestination,
  vault,
}: SettingsRoomProps) {
  const pendingPlan = useRef<VaultImportPlan | undefined>(undefined);

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
      {vault === undefined && (
        <p className="portability-settings__notice" role="status">
          Open a Studio to create or restore a portable backup.
        </p>
      )}
    </>
  );
}
