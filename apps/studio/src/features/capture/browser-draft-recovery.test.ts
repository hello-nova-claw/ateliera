import { browserDraftRecovery } from './browser-draft-recovery';

it('falls back to session memory when reading the sessionStorage getter is blocked', () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get() {
      throw new DOMException('blocked', 'SecurityError');
    },
  });

  try {
    const recovery = browserDraftRecovery();
    expect(recovery.available).toBe(false);
    expect(
      recovery.write({
        studioId: 'studio-a',
        path: 'Inbox/a.md',
        body: 'Still held in memory',
        expectedHash: 'hash-a',
        updatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(recovery.read('studio-a', 'Inbox/a.md')).toMatchObject({
      body: 'Still held in memory',
    });
  } finally {
    if (descriptor !== undefined) Object.defineProperty(window, 'sessionStorage', descriptor);
  }
});
