export function StudioTourInvitation({
  busy = false,
  onDismiss,
  onStart,
}: {
  busy?: boolean;
  onDismiss: () => void;
  onStart: () => void;
}) {
  return (
    <section
      aria-labelledby="studio-tour-invitation-title"
      className="studio-tour-invitation"
    >
      <p className="studio-tour-invitation__eyebrow">A gentle introduction</p>
      <h2 id="studio-tour-invitation-title">New here?</h2>
      <p>
        Take a quiet wander through the five rooms, with temporary examples of
        what each space could hold.
      </p>
      <div className="studio-tour-invitation__actions">
        <button aria-busy={busy} disabled={busy} onClick={onStart} type="button">
          Take a gentle tour
        </button>
        <button disabled={busy} onClick={onDismiss} type="button">
          Not now
        </button>
      </div>
    </section>
  );
}
