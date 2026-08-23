import './MoonPhaseIcon.css';

export interface MoonPhaseIconProps {
  /** Illuminated fraction, 0 (new) to 1 (full). */
  illumination: number;
  /** Which limb is lit: 'right' for a waxing moon in the north, 'left' for waning. */
  litSide: 'left' | 'right';
  /** Pixel size of the square icon. */
  size?: number;
  /** Accessible label; when omitted the icon is decorative (aria-hidden). */
  label?: string;
}

const R = 11;

// The lit region is a semicircle (the illuminated limb) closed by a
// half-ellipse terminator. The terminator's x-radius shrinks to zero at the
// quarters and grows back toward the disc edge at new/full; it bulges toward
// the lit limb for a crescent and away from it for a gibbous.
function litRegionPath(k: number, litRight: boolean): string {
  const rx = R * Math.abs(1 - 2 * k);
  const crescent = k < 0.5;
  const outerSweep = litRight ? 1 : 0;
  const innerSweep = litRight ? (crescent ? 0 : 1) : (crescent ? 1 : 0);
  return `M 0 ${-R} A ${R} ${R} 0 0 ${outerSweep} 0 ${R} A ${rx} ${R} 0 0 ${innerSweep} 0 ${-R} Z`;
}

export function MoonPhaseIcon({
  illumination,
  litSide,
  size = 22,
  label,
}: MoonPhaseIconProps) {
  const k = Math.min(1, Math.max(0, illumination));
  const labelled = label !== undefined;
  return (
    <svg
      className="studio-moon-phase"
      height={size}
      viewBox="-12 -12 24 24"
      width={size}
      {...(labelled
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      <circle className="studio-moon-phase__disc" r={R} />
      {k >= 0.98 ? (
        <circle className="studio-moon-phase__lit" data-testid="moon-lit" r={R} />
      ) : k <= 0.02 ? null : (
        <path
          className="studio-moon-phase__lit"
          d={litRegionPath(k, litSide === 'right')}
          data-testid="moon-lit"
        />
      )}
    </svg>
  );
}
