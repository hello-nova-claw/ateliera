import {
  createStudioControlVault,
  VaultConflictError,
  VaultUnavailableError,
  type VaultPort,
} from '@studio/storage/portable';

export const STUDIO_SETTINGS_PATH = '.studio/settings.json';

const MAX_SETTINGS_BYTES = 64 * 1024;
const MAX_CONFLICT_RETRIES = 3;
const encoder = new TextEncoder();

export type OnboardingStep =
  | 'welcome'
  | 'foyer'
  | 'landscape'
  | 'season'
  | 'uncharted'
  | 'reflection'
  | 'complete';

export type OnboardingStatus =
  | 'not-started'
  | 'in-progress'
  | 'completed'
  | 'dismissed';

export interface StudioOnboardingState {
  version: 1;
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  dismissedAt?: string;
  invitationDismissedAt?: string;
}

export interface StudioSettingsSnapshot {
  onboarding: StudioOnboardingState;
  extra: Record<string, unknown>;
  revision: string | null;
  repairRequired: boolean;
}

export type OnboardingTransition =
  | { type: 'visit'; step: Exclude<OnboardingStep, 'complete'>; at: string }
  | { type: 'dismiss' | 'complete' | 'replay'; at: string }
  | { type: 'dismiss-invitation'; at: string };

export interface OnboardingSettingsRepository {
  load(): Promise<StudioSettingsSnapshot>;
  save(
    settings: Pick<StudioSettingsSnapshot, 'extra' | 'onboarding'>,
    expectedRevision: string | null,
  ): Promise<StudioSettingsSnapshot>;
  transition(change: OnboardingTransition): Promise<StudioSettingsSnapshot>;
}

export interface OnboardingSettingsOptions {
  clock?: () => Date;
}

function initialState(at: string): StudioOnboardingState {
  return {
    version: 1,
    status: 'not-started',
    currentStep: 'welcome',
    updatedAt: at,
  };
}

function fallback(
  revision: string | null,
  repairRequired: boolean,
  at: string,
  extra: Record<string, unknown> = {},
): StudioSettingsSnapshot {
  return {
    onboarding: initialState(at),
    extra,
    revision,
    repairRequired,
  };
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    !Number.isNaN(Date.parse(value))
  );
}

const steps: readonly OnboardingStep[] = [
  'welcome',
  'foyer',
  'landscape',
  'season',
  'uncharted',
  'reflection',
  'complete',
];

const statuses: readonly OnboardingStatus[] = [
  'not-started',
  'in-progress',
  'completed',
  'dismissed',
];

function parseOnboarding(value: unknown): StudioOnboardingState | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    !statuses.includes(candidate.status as OnboardingStatus) ||
    !steps.includes(candidate.currentStep as OnboardingStep) ||
    !isTimestamp(candidate.updatedAt)
  )
    return undefined;

  for (const key of [
    'startedAt',
    'completedAt',
    'dismissedAt',
    'invitationDismissedAt',
  ] as const) {
    if (candidate[key] !== undefined && !isTimestamp(candidate[key]))
      return undefined;
  }

  const state = candidate as unknown as StudioOnboardingState;
  if (state.status === 'completed' && state.currentStep !== 'complete')
    return undefined;
  if (state.status === 'completed' && state.completedAt === undefined)
    return undefined;
  if (state.status === 'dismissed' && state.dismissedAt === undefined)
    return undefined;
  return { ...state };
}

function parseSettings(
  text: string,
  revision: string,
  at: string,
): StudioSettingsSnapshot {
  if (encoder.encode(text).byteLength > MAX_SETTINGS_BYTES)
    return fallback(revision, true, at);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fallback(revision, true, at);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fallback(revision, true, at);
  const stored = value as Record<string, unknown>;
  if (stored.version !== 1)
    return fallback(revision, true, at);
  const extra = Object.fromEntries(
    Object.entries(stored).filter(
      ([key]) => key !== 'onboarding' && key !== 'version',
    ),
  );
  if (stored.onboarding === undefined) {
    return {
      onboarding: initialState(at),
      extra,
      revision,
      repairRequired: false,
    };
  }
  const onboarding = parseOnboarding(stored.onboarding);
  if (onboarding === undefined)
    return fallback(revision, true, at, extra);
  return { onboarding, extra, revision, repairRequired: false };
}

function serialize(
  settings: Pick<StudioSettingsSnapshot, 'extra' | 'onboarding'>,
): string {
  return `${JSON.stringify(
    { ...settings.extra, version: 1, onboarding: settings.onboarding },
    null,
    2,
  )}\n`;
}

export function transitionOnboarding(
  current: StudioOnboardingState,
  transition: OnboardingTransition,
): StudioOnboardingState {
  if (transition.type === 'dismiss-invitation') {
    return {
      ...current,
      updatedAt: transition.at,
      invitationDismissedAt: transition.at,
    };
  }
  if (transition.type === 'visit') {
    return {
      version: 1,
      status: 'in-progress',
      currentStep: transition.step,
      startedAt: current.startedAt ?? transition.at,
      updatedAt: transition.at,
      ...(current.invitationDismissedAt === undefined
        ? {}
        : { invitationDismissedAt: current.invitationDismissedAt }),
    };
  }
  if (transition.type === 'dismiss') {
    return {
      version: 1,
      status: 'dismissed',
      currentStep: current.currentStep,
      updatedAt: transition.at,
      dismissedAt: transition.at,
      ...(current.startedAt === undefined
        ? {}
        : { startedAt: current.startedAt }),
      ...(current.invitationDismissedAt === undefined
        ? {}
        : { invitationDismissedAt: current.invitationDismissedAt }),
    };
  }
  if (transition.type === 'complete') {
    return {
      version: 1,
      status: 'completed',
      currentStep: 'complete',
      updatedAt: transition.at,
      completedAt: transition.at,
      ...(current.startedAt === undefined
        ? {}
        : { startedAt: current.startedAt }),
      ...(current.invitationDismissedAt === undefined
        ? {}
        : { invitationDismissedAt: current.invitationDismissedAt }),
    };
  }
  return {
    version: 1,
    status: 'in-progress',
    currentStep: 'welcome',
    startedAt: transition.at,
    updatedAt: transition.at,
    ...(current.invitationDismissedAt === undefined
      ? {}
      : { invitationDismissedAt: current.invitationDismissedAt }),
  };
}

export function createOnboardingSettingsRepository(
  vault: VaultPort,
  options: OnboardingSettingsOptions = {},
): OnboardingSettingsRepository {
  const control = createStudioControlVault(vault);
  const clock = options.clock ?? (() => new Date());

  async function load(): Promise<StudioSettingsSnapshot> {
    const at = clock().toISOString();
    try {
      const current = await control.readText(STUDIO_SETTINGS_PATH);
      return parseSettings(current.text, current.hash, at);
    } catch (error) {
      if (!(error instanceof VaultUnavailableError)) throw error;
      if (await control.exists(STUDIO_SETTINGS_PATH)) throw error;
      return fallback(null, false, at);
    }
  }

  async function save(
    settings: Pick<StudioSettingsSnapshot, 'extra' | 'onboarding'>,
    expectedRevision: string | null,
  ): Promise<StudioSettingsSnapshot> {
    const onboarding = parseOnboarding(settings.onboarding);
    if (onboarding === undefined)
      throw new Error('Onboarding settings are invalid.');
    const saved = await control.writeTextAtomic(
      STUDIO_SETTINGS_PATH,
      serialize({ extra: settings.extra, onboarding }),
      expectedRevision === null
        ? { expectedMissing: true }
        : { expectedHash: expectedRevision },
    );
    return {
      onboarding,
      extra: { ...settings.extra },
      revision: saved.hash,
      repairRequired: false,
    };
  }

  return {
    load,
    save,
    async transition(change) {
      let lastConflict: VaultConflictError | undefined;
      for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt += 1) {
        const current = await load();
        try {
          return await save(
            {
              extra: current.extra,
              onboarding: transitionOnboarding(current.onboarding, change),
            },
            current.revision,
          );
        } catch (error) {
          if (!(error instanceof VaultConflictError)) throw error;
          lastConflict = error;
        }
      }
      throw lastConflict ?? new VaultConflictError();
    },
  };
}
