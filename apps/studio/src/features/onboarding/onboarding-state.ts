export type EntryProgressPhase =
  | 'choosing-location'
  | 'creating-space'
  | 'opening-space'
  | 'preparing-rooms'
  | 'ready';

export type TourStep =
  'foyer' | 'landscape' | 'season' | 'uncharted' | 'reflection';

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
  | {
      kind: 'first-visit';
      mode: 'new' | 'resume';
      step?: TourStep;
    }
  | { kind: 'active'; tourStep?: TourStep; tourInvitation?: boolean };

export type StudioEntryAction =
  | { type: 'begin-create'; attemptId: string; name: string }
  | { type: 'begin-open'; attemptId: string }
  | {
      type: 'progress';
      attemptId: string;
      phase: EntryProgressPhase;
    }
  | { type: 'fail'; attemptId: string; message: string }
  | { type: 'activate'; attemptId?: string; tourInvitation?: boolean }
  | {
      type: 'first-visit';
      attemptId: string;
      mode: 'new' | 'resume';
      step?: TourStep;
    }
  | { type: 'start-tour' | 'tour-step'; step: TourStep }
  | { type: 'replay-tour' }
  | { type: 'dismiss-tour-invitation' }
  | { type: 'end-tour' }
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
      return {
        kind: 'active',
        ...(action.tourInvitation === undefined
          ? {}
          : { tourInvitation: action.tourInvitation }),
      };
    case 'first-visit':
      if (!ownsAttempt(state, action.attemptId)) return state;
      return {
        kind: 'first-visit',
        mode: action.mode,
        ...(action.step === undefined ? {} : { step: action.step }),
      };
    case 'start-tour':
      return state.kind === 'first-visit'
        ? { kind: 'active', tourStep: action.step }
        : state;
    case 'tour-step':
      return state.kind === 'active' && state.tourStep !== undefined
        ? { kind: 'active', tourStep: action.step }
        : state;
    case 'replay-tour':
      return state.kind === 'active'
        ? { kind: 'active', tourStep: 'foyer' }
        : state;
    case 'dismiss-tour-invitation':
      return state.kind === 'active' && state.tourInvitation
        ? { kind: 'active' }
        : state;
    case 'end-tour':
      return state.kind === 'active' && state.tourStep !== undefined
        ? { kind: 'active' }
        : state;
    case 'cancel':
      if (!ownsAttempt(state, action.attemptId)) return state;
      return state.kind === 'creating'
        ? { kind: 'entry', draftName: state.name }
        : initialStudioEntryState;
    case 'return-to-entry':
      return initialStudioEntryState;
  }
}
