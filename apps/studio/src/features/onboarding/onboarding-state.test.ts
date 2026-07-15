import { describe, expect, it } from 'vitest';
import {
  initialStudioEntryState,
  studioEntryReducer,
  type StudioEntryState,
} from './onboarding-state';

describe('studioEntryReducer', () => {
  it('moves create and open attempts through honest phases', () => {
    const creating = studioEntryReducer(initialStudioEntryState, {
      type: 'begin-create',
      attemptId: 'create-1',
      name: 'Anna’s Studio',
    });
    expect(creating).toEqual({
      kind: 'creating',
      attemptId: 'create-1',
      name: 'Anna’s Studio',
      phase: 'choosing-location',
    });
    expect(
      studioEntryReducer(creating, {
        type: 'progress',
        attemptId: 'create-1',
        phase: 'preparing-rooms',
      }),
    ).toEqual({ ...creating, phase: 'preparing-rooms' });

    expect(
      studioEntryReducer(initialStudioEntryState, {
        type: 'begin-open',
        attemptId: 'open-1',
      }),
    ).toEqual({
      kind: 'opening',
      attemptId: 'open-1',
      phase: 'opening-space',
    });
  });

  it('retains the create name when cancellation returns to entry', () => {
    const creating: StudioEntryState = {
      kind: 'creating',
      attemptId: 'create-1',
      name: 'Anna’s Studio',
      phase: 'choosing-location',
    };

    expect(
      studioEntryReducer(creating, {
        type: 'cancel',
        attemptId: 'create-1',
      }),
    ).toEqual({ kind: 'entry', draftName: 'Anna’s Studio' });
  });

  it('ignores late progress, failure, and activation from abandoned attempts', () => {
    const state: StudioEntryState = {
      kind: 'creating',
      attemptId: 'create-2',
      name: 'Quiet Work',
      phase: 'creating-space',
    };
    const staleActions = [
      {
        type: 'progress' as const,
        attemptId: 'create-1',
        phase: 'ready' as const,
      },
      {
        type: 'fail' as const,
        attemptId: 'create-1',
        message: 'Too late',
      },
      { type: 'activate' as const, attemptId: 'create-1' },
    ];

    for (const action of staleActions) {
      expect(studioEntryReducer(state, action)).toBe(state);
    }
  });

  it('stops progress on failure and supports retry or a return to entry', () => {
    const opening: StudioEntryState = {
      kind: 'opening',
      attemptId: 'open-1',
      phase: 'preparing-rooms',
    };
    const failed = studioEntryReducer(opening, {
      type: 'fail',
      attemptId: 'open-1',
      message: 'This Studio Space could not be opened.',
    });
    expect(failed).toEqual({
      kind: 'entry-error',
      action: 'open',
      message: 'This Studio Space could not be opened.',
    });
    expect(studioEntryReducer(failed, { type: 'return-to-entry' })).toEqual(
      initialStudioEntryState,
    );
  });

  it('moves a newly created Studio through welcome, tour rooms, and completion', () => {
    const creating: StudioEntryState = {
      kind: 'creating',
      attemptId: 'create-1',
      name: 'Anna’s Studio',
      phase: 'preparing-rooms',
    };
    const welcome = studioEntryReducer(creating, {
      type: 'first-visit',
      attemptId: 'create-1',
      mode: 'new',
    });
    expect(welcome).toEqual({ kind: 'first-visit', mode: 'new' });
    const touring = studioEntryReducer(welcome, {
      type: 'start-tour',
      step: 'foyer',
    });
    expect(touring).toEqual({ kind: 'active', tourStep: 'foyer' });
    expect(
      studioEntryReducer(touring, {
        type: 'tour-step',
        step: 'landscape',
      }),
    ).toEqual({ kind: 'active', tourStep: 'landscape' });
    expect(studioEntryReducer(touring, { type: 'end-tour' })).toEqual({
      kind: 'active',
    });
  });

  it('offers an explicitly interrupted tour without replaying it for everyone', () => {
    const opening: StudioEntryState = {
      kind: 'opening',
      attemptId: 'open-1',
      phase: 'preparing-rooms',
    };
    expect(
      studioEntryReducer(opening, {
        type: 'first-visit',
        attemptId: 'open-1',
        mode: 'resume',
        step: 'uncharted',
      }),
    ).toEqual({
      kind: 'first-visit',
      mode: 'resume',
      step: 'uncharted',
    });
    expect(
      studioEntryReducer(opening, {
        type: 'activate',
        attemptId: 'open-1',
      }),
    ).toEqual({ kind: 'active' });
  });

  it('keeps a legacy tour invitation optional and dismissible', () => {
    const active = studioEntryReducer(
      {
        kind: 'opening',
        attemptId: 'open-1',
        phase: 'preparing-rooms',
      },
      {
        type: 'activate',
        attemptId: 'open-1',
        tourInvitation: true,
      },
    );
    expect(active).toEqual({ kind: 'active', tourInvitation: true });
    expect(
      studioEntryReducer(active, { type: 'dismiss-tour-invitation' }),
    ).toEqual({ kind: 'active' });
  });
});
