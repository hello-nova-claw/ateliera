import './BrandMark.css';

export interface BrandMarkProps {
  variant?: 'mark' | 'lockup';
  tone?: 'ink' | 'foil';
  /** Height of the glyph in pixels (min 20). */
  size?: number;
  /** Accessible name for the mark-only variant. */
  title?: string;
}

// Seven stars in the shape of an A — two legs and a crossbar — with the
// lower-right foot as the single bright star. Drawn on a 40-unit grid.
const stars = [
  { cx: 20, cy: 4 },
  { cx: 13, cy: 20 },
  { cx: 27, cy: 20 },
  { cx: 10.8, cy: 27 },
  { cx: 29.2, cy: 27 },
  { cx: 8, cy: 36 },
];
const brightStar = { cx: 32, cy: 36 };

function Glyph({ decorative, label }: { decorative: boolean; label: string }) {
  return (
    <svg
      className="studio-brand-mark__glyph"
      height="1em"
      viewBox="0 0 40 40"
      width="1em"
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <path
        className="studio-brand-mark__line"
        d="M20 4 13 20 10.8 27 8 36M20 4 27 20 29.2 27 32 36M10.8 27H29.2"
      />
      {stars.map((s) => (
        <circle
          className="studio-brand-mark__star"
          cx={s.cx}
          cy={s.cy}
          key={`${s.cx}-${s.cy}`}
          r={1.7}
        />
      ))}
      <circle
        className="studio-brand-mark__star studio-brand-mark__star--bright"
        cx={brightStar.cx}
        cy={brightStar.cy}
        r={2.6}
      />
    </svg>
  );
}

export function BrandMark({
  variant = 'mark',
  tone = 'ink',
  size = 40,
  title = 'Ateliera',
}: BrandMarkProps) {
  const px = Math.max(20, size);

  return (
    <span
      className={`studio-brand-mark studio-brand-mark--${tone} studio-brand-mark--${variant}`}
      style={{ fontSize: `${px}px` }}
    >
      <Glyph decorative={variant === 'lockup'} label={title} />
      {variant === 'lockup' ? (
        <span className="studio-brand-mark__lockup">
          <span className="studio-brand-mark__wordmark">Ateliera</span>
          <span className="studio-brand-mark__tagline">STUDIO</span>
        </span>
      ) : null}
    </span>
  );
}
