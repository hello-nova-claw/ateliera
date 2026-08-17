import type { CaptureNoteInput, SavedNote } from '@studio/application';
import type { DecisionHorizon, SemanticType } from '@studio/domain';
import { useState } from 'react';

export interface QuickCaptureProps {
  capture: (input: QuickCaptureInput) => Promise<SavedNote>;
  decisionHorizon?: boolean;
  initialBody?: string;
  initialSemanticType?: SemanticType;
  meaningLocked?: boolean;
  onCancel: () => void;
  onRemembered: (saved: SavedNote) => void | Promise<void>;
}

export type QuickCaptureInput = CaptureNoteInput & {
  decisionHorizon?: DecisionHorizon;
};

export function QuickCapture({
  capture,
  decisionHorizon = false,
  initialBody = '',
  initialSemanticType,
  meaningLocked = false,
  onCancel,
  onRemembered,
}: QuickCaptureProps) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [semanticType, setSemanticType] = useState<'' | SemanticType>(
    initialSemanticType ?? '',
  );
  const [horizon, setHorizon] = useState<DecisionHorizon>('30d');

  async function remember(): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await capture({
        body,
        ...(semanticType === '' ? {} : { semanticType }),
        ...(decisionHorizon ? { decisionHorizon: horizon } : {}),
      });
      await onRemembered(saved);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'This thought could not be remembered.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="quick-capture studio-form"
      onSubmit={(event) => {
        event.preventDefault();
        void remember();
      }}
    >
      <p className="studio-form__eyebrow">Quick capture</p>
      <h2>Hold this thought</h2>
      <label htmlFor="capture-text">What would you like remembered?</label>
      <textarea
        autoFocus
        id="capture-text"
        onChange={(event) => setBody(event.target.value)}
        rows={6}
        value={body}
      />
      <label htmlFor="capture-meaning">Meaning (optional)</label>
      <select
        aria-describedby={`capture-meaning-guide${
          initialSemanticType === undefined ? '' : ' capture-meaning-hint'
        }`}
        disabled={meaningLocked}
        id="capture-meaning"
        onChange={(event) =>
          setSemanticType(event.target.value as '' | SemanticType)
        }
        value={semanticType}
      >
        <option value="">Place later</option>
        <option value="foundations">Foundations</option>
        <option value="vision">Vision — what I am creating</option>
        <option value="growth">Growth</option>
        <option value="reflection">Reflection</option>
        <option value="celebration">Celebration</option>
        <option value="uncharted">Uncharted</option>
      </select>
      <p className="quick-capture__meaning-guide" id="capture-meaning-guide">
        Meaning is the colour lens. In Life Landscape, an anchor describes where
        the card sits.
      </p>
      {initialSemanticType !== undefined && (
        <p className="quick-capture__meaning-hint" id="capture-meaning-hint">
          {meaningLocked
            ? 'This meaning belongs to the place you are adding it.'
            : 'Suggested from where you opened capture.'}
        </p>
      )}
      {decisionHorizon && (
        <>
          <label htmlFor="capture-decision-horizon">Decision horizon</label>
          <select
            id="capture-decision-horizon"
            onChange={(event) =>
              setHorizon(event.target.value as DecisionHorizon)
            }
            value={horizon}
          >
            <option value="30d">Next 30 days</option>
            <option value="60d">Next 60 days</option>
            <option value="90d">Next 90 days</option>
            <option value="someday">Someday</option>
          </select>
        </>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
      <div className="studio-form__actions">
        <button
          className="studio-form__button studio-form__button--secondary"
          onClick={onCancel}
          type="button"
        >
          Not now
        </button>
        <button
          aria-busy={saving}
          className="studio-form__button"
          disabled={saving || body.trim() === ''}
          type="submit"
        >
          {saving ? 'Remembering…' : 'Remember'}
        </button>
      </div>
    </form>
  );
}
