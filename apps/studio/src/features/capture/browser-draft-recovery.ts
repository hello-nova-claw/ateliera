import { createDraftRecoveryStore } from '@studio/application';

export function browserDraftRecovery() {
  return createDraftRecoveryStore(sessionStorage);
}
