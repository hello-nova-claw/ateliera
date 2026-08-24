import './room-reveal-invitation.css';

/**
 * The guided-reveal invitation surface (plan §6.2, §10). A quiet, single,
 * dismissible offer to open a currently-off optional room — never modal, never
 * focus-stealing, never a badge or count. It announces itself through a polite
 * live region and offers two plain actions: open the room, or not yet.
 */
export function RoomRevealInvitation({
  busy = false,
  copy,
  onAccept,
  onDismiss,
}: {
  busy?: boolean;
  copy: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside
      aria-labelledby="room-reveal-invitation-title"
      aria-live="polite"
      className="room-reveal-invitation"
    >
      <p className="room-reveal-invitation__eyebrow">A door has appeared</p>
      <p className="room-reveal-invitation__copy" id="room-reveal-invitation-title">
        {copy}
      </p>
      <div className="room-reveal-invitation__actions">
        <button
          aria-busy={busy}
          className="room-reveal-invitation__accept"
          disabled={busy}
          onClick={onAccept}
          type="button"
        >
          Open it
        </button>
        <button
          className="room-reveal-invitation__dismiss"
          disabled={busy}
          onClick={onDismiss}
          type="button"
        >
          Not yet
        </button>
      </div>
    </aside>
  );
}
