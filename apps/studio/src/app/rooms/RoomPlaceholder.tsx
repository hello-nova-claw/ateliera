import type { CaptureEntry } from '@studio/application';

export interface RoomPlaceholderProps {
  captures?: CaptureEntry[];
  foyer?: boolean;
  onOpenCapture?: (id: string, trigger: HTMLButtonElement) => void;
  title: string;
}

export function RoomPlaceholder({
  captures = [],
  foyer = false,
  onOpenCapture,
  title,
}: RoomPlaceholderProps) {
  return (
    <>
      <p className="studio-room__eyebrow">
        {foyer ? 'Welcome home' : 'A room in your Studio'}
      </p>
      <h1>{foyer ? 'Ateliera' : title}</h1>
      <p className="studio-room__intro">
        {foyer
          ? 'A quiet place to design a life, notice who you are becoming, and keep what you learn.'
          : 'This room is ready for its focused content in the next stage of the build.'}
      </p>
      {foyer && (
        <section
          className="studio-room__remembered"
          aria-labelledby="remembered-heading"
        >
          <h2 id="remembered-heading">Remembered</h2>
          {captures.length === 0 ? (
            <p>There is room for whatever arrives.</p>
          ) : (
            <ul>
              {captures.map((capture) => (
                <li key={capture.id}>
                  {onOpenCapture === undefined ? (
                    capture.text
                  ) : (
                    <button
                      className="studio-room__remembered-button"
                      onClick={(event) =>
                        onOpenCapture(capture.id, event.currentTarget)
                      }
                      type="button"
                    >
                      {capture.text}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
