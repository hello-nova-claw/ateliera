import { vaultContract } from './__contract__/vault-contract';
import { createInMemoryVault } from './in-memory-vault';

vaultContract('InMemoryVault', async () => createInMemoryVault());
