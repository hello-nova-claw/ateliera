import { expect, test } from '@playwright/test';

test('browser adapter preserves CAS, move, remove, and backend selection', async ({
  page,
  browserName,
}) => {
  await page.goto('/vault-contract.html');
  const storage: 'auto' | 'indexeddb' =
    browserName === 'webkit' ? 'indexeddb' : 'auto';
  const result = await page.evaluate(async ({ backend }) => {
    const name = `contract-${crypto.randomUUID()}`;
    const first = window.studioVaultTest.create(name, backend);
    const initial = await window.studioVaultTest.write(first, 'Inbox/a.md', 'one');
    let conflicted = false;
    try {
      await window.studioVaultTest.write(first, 'Inbox/a.md', 'lost', 'wrong');
    } catch {
      conflicted = true;
    }
    const afterConflict = await window.studioVaultTest.read(first, 'Inbox/a.md');
    const outcomes = await Promise.allSettled([
      window.studioVaultTest.write(first, 'Inbox/a.md', 'two', initial.hash),
      window.studioVaultTest.write(first, 'Inbox/a.md', 'three', initial.hash),
    ]);
    await window.studioVaultTest.move(first, 'Inbox/a.md', 'Inbox/b.md');
    const moved = await window.studioVaultTest.read(first, 'Inbox/b.md');
    await window.studioVaultTest.remove(first, 'Inbox/b.md');
    const removed = !(await window.studioVaultTest.exists(first, 'Inbox/b.md'));
    await window.studioVaultTest.write(first, 'Inbox/reopen.md', 'stable');
    const reopened = window.studioVaultTest.create(name, backend);
    const stable = await window.studioVaultTest.read(reopened, 'Inbox/reopen.md');
    return {
      conflicted,
      preserved: afterConflict.text,
      winners: outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
      moved: moved.text,
      removed,
      stable: stable.text,
    };
  }, { backend: storage });

  expect(result).toEqual({
    conflicted: true,
    preserved: 'one',
    winners: 1,
    moved: expect.stringMatching(/two|three/),
    removed: true,
    stable: 'stable',
  });
});

test('watch events cross browser tabs for the same vault', async ({ context, browserName }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([
    first.goto('/vault-contract.html'),
    second.goto('/vault-contract.html'),
  ]);
  const name = `watch-${crypto.randomUUID()}`;
  const backend: 'auto' | 'indexeddb' =
    browserName === 'webkit' ? 'indexeddb' : 'auto';
  const firstId = await first.evaluate(
    ({ vaultName, storage }) => window.studioVaultTest.create(vaultName, storage),
    { vaultName: name, storage: backend },
  );
  const secondId = await second.evaluate(
    ({ vaultName, storage }) => window.studioVaultTest.create(vaultName, storage),
    { vaultName: name, storage: backend },
  );
  await second.evaluate((id) => window.studioVaultTest.watch(id), secondId);
  await first.evaluate(
    ({ id }) => window.studioVaultTest.write(id, 'Inbox/hill.md', 'hill'),
    { id: firstId },
  );
  await expect
    .poll(() => second.evaluate((id) => window.studioVaultTest.events(id), secondId))
    .toContainEqual(expect.objectContaining({ kind: 'created', path: 'Inbox/hill.md' }));
});
