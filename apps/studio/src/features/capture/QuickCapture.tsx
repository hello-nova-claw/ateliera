import type { CaptureNoteInput, SavedNote } from '@studio/application';
import type { SemanticType } from '@studio/domain';
import { useState } from 'react';

export interface QuickCaptureProps {
  capture: (input: QuickCaptureInput) => Promise<SavedNote>;
  onCancel: () => void;
  onRemembered: (saved: SavedNote) => void;
}

export interface QuickCaptureInput extends CaptureNoteInput {
  semanticType?: SemanticType;
}

export function QuickCapture({
  capture,
  onCancel,
  onRemembered,
}: QuickCaptureProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [semanticType, setSemanticType] = useState<'' | SemanticType>('');

  async function remember(): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await capture(
        semanticType === '' ? { body } : { body, semanticType },
      );
      onRemembered(saved);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'This thought could not be remembered.',
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
        id="capture-meaning"
        onChange={(event) =>
          setSemanticType(event.target.value as '' | SemanticType)
        }
        value={semanticType}
      >
        <option value="">Place later</option>
        <option value="foundation">Foundation</option>
        <option value="vision">Vision</option>
        <option value="growth">Growth</option>
        <option value="reflection">Reflection</option>
        <option value="celebration">Celebration</option>
        <option value="uncharted">Uncharted</option>
      </select>
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
