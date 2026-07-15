export type EntryProgressPhase =
  | 'choosing-location'
  | 'creating-space'
  | 'opening-space'
  | 'preparing-rooms'
  | 'ready';

export type StudioEntryState =
  | { kind: 'entry'; draftName?: string }
  | {
      kind: 'creating';
      attemptId: string;
      name: string;
      phase: EntryProgressPhase;
    }
  | {
      kind: 'opening';
      attemptId: string;
      phase: EntryProgressPhase;
    }
  | {
      kind: 'entry-error';
      action: 'create' | 'open';
      message: string;
      draftName?: string;
    }
  | { kind: 'active' };

export type StudioEntryAction =
  | { type: 'begin-create'; attemptId: string; name: string }
  | { type: 'begin-open'; attemptId: string }
  | {
      type: 'progress';
      attemptId: string;
      phase: EntryProgressPhase;
    }
  | { type: 'fail'; attemptId: string; message: string }
  | { type: 'activate'; attemptId?: string }
  | { type: 'cancel'; attemptId: string }
  | { type: 'return-to-entry' };

export const initialStudioEntryState: StudioEntryState = { kind: 'entry' };

function ownsAttempt(
  state: StudioEntryState,
  attemptId: string,
): state is Extract<StudioEntryState, { attemptId: string }> {
  return (
    (state.kind === 'creating' || state.kind === 'opening') &&
    state.attemptId === attemptId
  );
}

export function studioEntryReducer(
  state: StudioEntryState,
  action: StudioEntryAction,
): StudioEntryState {
  switch (action.type) {
    case 'begin-create':
      return state.kind === 'entry' || state.kind === 'entry-error'
        ? {
            kind: 'creating',
            attemptId: action.attemptId,
            name: action.name,
            phase: 'choosing-location',
          }
        : state;
    case 'begin-open':
      return state.kind === 'entry' || state.kind === 'entry-error'
        ? {
            kind: 'opening',
            attemptId: action.attemptId,
            phase: 'opening-space',
          }
        : state;
    case 'progress':
      return ownsAttempt(state, action.attemptId)
        ? { ...state, phase: action.phase }
        : state;
    case 'fail':
      if (!ownsAttempt(state, action.attemptId)) return state;
      return {
        kind: 'entry-error',
        action: state.kind === 'creating' ? 'create' : 'open',
        message: action.message,
        ...(state.kind === 'creating' ? { draftName: state.name } : {}),
      };
    case 'activate':
      if (
        action.attemptId !== undefined &&
        !ownsAttempt(state, action.attemptId)
      )
        return state;
      return { kind: 'active' };
    case 'cancel':
      if (!ownsAttempt(state, action.attemptId)) return state;
      return state.kind === 'creating'
        ? { kind: 'entry', draftName: state.name }
        : initialStudioEntryState;
    case 'return-to-entry':
      return initialStudioEntryState;
  }
}
