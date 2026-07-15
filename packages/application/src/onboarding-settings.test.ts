import { createInMemoryVault } from '@studio/storage';
import {
  VaultConflictError,
  VaultUnavailableError,
  type VaultPort,
} from '@studio/storage/portable';
import { describe, expect, it } from 'vitest';
import {
  createOnboardingSettingsRepository,
  transitionOnboarding,
} from './onboarding-settings';
import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

const NOW = '2026-07-15T01:00:00.000Z';
const clock = () => new Date(NOW);

function initialState() {
  return {
    version: 1 as const,
    status: 'not-started' as const,
    currentStep: 'welcome' as const,
    updatedAt: NOW,
  };
}

describe('onboarding settings', () => {
  it('treats a missing settings file as a first visit', async () => {
    const repository = createOnboardingSettingsRepository(
      createInMemoryVault(),
      { clock },
    );

    await expect(repository.load()).resolves.toEqual({
      onboarding: initialState(),
      extra: {},
      revision: null,
      repairRequired: false,
    });
  });

  it('loads valid v1 state and preserves unknown settings keys on save', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      '.studio/settings.json',
      `${JSON.stringify({
        version: 1,
        onboarding: {
          version: 1,
          status: 'in-progress',
          currentStep: 'landscape',
          startedAt: NOW,
          updatedAt: NOW,
        },
        futurePreference: { quiet: true },
      })}\n`,
    );
    const repository = createOnboardingSettingsRepository(vault, { clock });
    const loaded = await repository.load();

    expect(loaded).toMatchObject({
      onboarding: {
        status: 'in-progress',
        currentStep: 'landscape',
        updatedAt: NOW,
      },
      extra: { futurePreference: { quiet: true } },
      repairRequired: false,
    });
    const saved = await repository.save(
      {
        ...loaded,
        onboarding: transitionOnboarding(loaded.onboarding, {
          type: 'complete',
          at: '2026-07-15T02:00:00.000Z',
        }),
      },
      loaded.revision,
    );
    expect(saved.onboarding.status).toBe('completed');
    expect(
      JSON.parse((await vault.readText('.studio/settings.json')).text),
    ).toMatchObject({ futurePreference: { quiet: true } });
  });

  it('fails soft on malformed state while retaining its exact revision', async () => {
    const vault = createInMemoryVault();
    const malformed = await vault.writeTextAtomic(
      '.studio/settings.json',
      '{not json',
    );

    await expect(
      createOnboardingSettingsRepository(vault, { clock }).load(),
    ).resolves.toEqual({
      onboarding: initialState(),
      extra: {},
      revision: malformed.hash,
      repairRequired: true,
    });
  });

  it('treats optional onboarding metadata as not started without losing settings', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      '.studio/settings.json',
      JSON.stringify({ version: 1, displayName: 'Anna' }),
    );

    await expect(
      createOnboardingSettingsRepository(vault, { clock }).load(),
    ).resolves.toMatchObject({
      onboarding: initialState(),
      extra: { displayName: 'Anna' },
      repairRequired: false,
    });
  });

  it('uses the exact loaded revision and rejects concurrent replacement', async () => {
    const vault = createInMemoryVault();
    const repository = createOnboardingSettingsRepository(vault, { clock });
    const missing = await repository.load();
    await vault.writeTextAtomic('.studio/settings.json', '{}');

    await expect(
      repository.save(missing, missing.revision),
    ).rejects.toBeInstanceOf(VaultConflictError);
  });

  it('reloads and retries a transition after a concurrent write wins', async () => {
    const durable = createInMemoryVault();
    let conflictInjected = false;
    const vault = new Proxy(durable, {
      get(target, property) {
        if (property !== 'writeTextAtomic') {
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (
          path: string,
          text: string,
          condition?: Parameters<VaultPort['writeTextAtomic']>[2],
        ) => {
        if (path === '.studio/settings.json' && !conflictInjected) {
          conflictInjected = true;
          await durable.writeTextAtomic(
            path,
            JSON.stringify({
              version: 1,
              displayName: 'Anna',
              onboarding: initialState(),
            }),
          );
        }
        return durable.writeTextAtomic(path, text, condition);
        };
      },
    }) as VaultPort;
    const repository = createOnboardingSettingsRepository(vault, { clock });

    const saved = await repository.transition({
      type: 'visit',
      step: 'foyer',
      at: '2026-07-15T02:00:00.000Z',
    });

    expect(saved).toMatchObject({
      onboarding: { status: 'in-progress', currentStep: 'foyer' },
      extra: { displayName: 'Anna' },
    });
  });

  it('leaves the last valid settings readable when an atomic write is interrupted', async () => {
    const durable = createInMemoryVault();
    await durable.writeTextAtomic(
      '.studio/settings.json',
      JSON.stringify({ version: 1, onboarding: initialState() }),
    );
    const loaded = await createOnboardingSettingsRepository(durable, {
      clock,
    }).load();
    const unavailable = new Proxy(durable, {
      get(target, property) {
        if (property === 'writeTextAtomic') {
          return async () => {
            throw new VaultUnavailableError();
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as VaultPort;

    await expect(
      createOnboardingSettingsRepository(unavailable, { clock }).save(
        {
          ...loaded,
          onboarding: transitionOnboarding(loaded.onboarding, {
            type: 'visit',
            step: 'foyer',
            at: '2026-07-15T02:00:00.000Z',
          }),
        },
        loaded.revision,
      ),
    ).rejects.toBeInstanceOf(VaultUnavailableError);
    await expect(
      createOnboardingSettingsRepository(durable, { clock }).load(),
    ).resolves.toMatchObject({ onboarding: initialState() });
  });

  it('supports start, resume, dismiss, complete, replay, and invitation dismissal', () => {
    const started = transitionOnboarding(initialState(), {
      type: 'visit',
      step: 'foyer',
      at: NOW,
    });
    expect(started).toMatchObject({
      status: 'in-progress',
      currentStep: 'foyer',
      startedAt: NOW,
    });
    expect(
      transitionOnboarding(started, {
        type: 'visit',
        step: 'uncharted',
        at: '2026-07-15T02:00:00.000Z',
      }),
    ).toMatchObject({ status: 'in-progress', currentStep: 'uncharted' });
    expect(
      transitionOnboarding(started, {
        type: 'dismiss',
        at: '2026-07-15T03:00:00.000Z',
      }),
    ).toMatchObject({
      status: 'dismissed',
      dismissedAt: '2026-07-15T03:00:00.000Z',
    });
    const completed = transitionOnboarding(started, {
      type: 'complete',
      at: '2026-07-15T04:00:00.000Z',
    });
    expect(completed).toMatchObject({
      status: 'completed',
      currentStep: 'complete',
      completedAt: '2026-07-15T04:00:00.000Z',
    });
    expect(
      transitionOnboarding(completed, {
        type: 'replay',
        at: '2026-07-15T05:00:00.000Z',
      }),
    ).toMatchObject({
      status: 'in-progress',
      currentStep: 'welcome',
      startedAt: '2026-07-15T05:00:00.000Z',
    });
    expect(
      transitionOnboarding(initialState(), {
        type: 'dismiss-invitation',
        at: '2026-07-15T06:00:00.000Z',
      }),
    ).toMatchObject({
      invitationDismissedAt: '2026-07-15T06:00:00.000Z',
    });
  });

  it('exposes onboarding settings through the active Studio service', async () => {
    const vault = createInMemoryVault();
    const service = createStudioService({ vault, index: new RecordingIndex() });

    await expect(service.onboarding.load()).resolves.toMatchObject({
      onboarding: { status: 'not-started', currentStep: 'welcome' },
      repairRequired: false,
    });
  });
});
