import { exportVault } from './export';
import type { ExportVaultOptions } from './export';
import { importVault } from './import';
import type { ApplyVaultImportOptions } from './import';
import type { VaultPort } from './vault-port';

export type VaultBackupReason = 'automatic' | 'manual' | 'pre-migration';

export interface CreateVaultBackupOptions extends ExportVaultOptions {
  reason: VaultBackupReason;
}

export interface VaultBackup {
  bytes: Uint8Array;
  fileName: string;
  generatedAt: string;
  reason: VaultBackupReason;
}

function backupFileName(generatedAt: string): string {
  const [date, time = '000000.000Z'] = generatedAt.split('T');
  return `the-studio-backup-${date}T${time.replace(/:/g, '').replace('.000', '')}.zip`;
}

export async function createVaultBackup(
  vault: VaultPort,
  options: CreateVaultBackupOptions,
): Promise<VaultBackup> {
  const generatedAt = new Date(options.generatedAt ?? Date.now()).toISOString();
  return {
    bytes: await exportVault(vault, { generatedAt }),
    fileName: backupFileName(generatedAt),
    generatedAt,
    reason: options.reason,
  };
}

export async function restoreVaultBackup(
  vault: VaultPort,
  bytes: Blob | Uint8Array,
  options: ApplyVaultImportOptions,
) {
  return importVault(vault, bytes, options);
}
