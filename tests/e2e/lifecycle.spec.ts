import { expect, test } from '@playwright/test';

test('archives, trashes, and safely restores through the persistent browser adapter while offline', async ({
  context,
  page,
}) => {
  await page.goto('/vault-contract.html');
  const id = await page.evaluate(() => window.studioVaultTest.create(`lifecycle-${crypto.randomUUID()}`));
  await page.evaluate((handle) => window.studioVaultTest.seedLifecycleNote(
    handle,
    'n1',
    'Reflection Garden/n1.md',
    ['Attachments/missing.jpg'],
  ), id);

  await context.setOffline(true);
  await expect(page.evaluate((handle) => window.studioVaultTest.archive(handle, 'n1'), id))
    .resolves.toMatchObject({ status: 'archived' });
  await expect(page.evaluate((handle) => window.studioVaultTest.unarchive(handle, 'n1'), id))
    .resolves.toMatchObject({ status: 'active' });
  const trashed = await page.evaluate((handle) => window.studioVaultTest.trash(handle, 'n1'), id);
  expect(await page.evaluate(
    ({ handle, path }) => window.studioVaultTest.exists(handle, path),
    { handle: id, path: 'Reflection Garden/n1.md' },
  )).toBe(false);
  expect(trashed.attachments).toEqual([{
    path: 'Attachments/missing.jpg',
    availability: 'missing',
  }]);

  await page.evaluate((handle) => window.studioVaultTest.write(
    handle,
    'Reflection Garden/n1.md',
    'occupied by another note',
  ), id);
  const restored = await page.evaluate((handle) => window.studioVaultTest.restore(handle, 'n1'), id);
  expect(restored).toMatchObject({
    kind: 'restored',
    path: 'Reflection Garden/n1--restored.md',
    relocated: true,
    missingAttachments: ['Attachments/missing.jpg'],
    unknownAttachments: [],
  });
  expect(await page.evaluate(
    ({ handle, path }) => window.studioVaultTest.exists(handle, path),
    { handle: id, path: trashed.trashPath },
  )).toBe(false);
  expect(await page.evaluate((handle) => window.studioVaultTest.reconcileTrash(handle), id)).toEqual([]);
});
