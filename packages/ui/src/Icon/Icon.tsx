import type { ReactNode, SVGProps } from 'react';
import './Icon.css';

export type IconName =
  | 'waves'
  | 'sun'
  | 'leaf'
  | 'moon'
  | 'sparkle'
  | 'constellation'
  | 'chevron'
  | 'back'
  | 'plus'
  | 'more';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: IconName;
  /** Pixel size of the square icon. */
  size?: number;
  /** Accessible label; when omitted the icon is decorative (aria-hidden). */
  title?: string;
}

// Every glyph is drawn on a 24-unit grid with a 1.3px round stroke and
// currentColor, so an Icon inherits the ink of whatever it sits in.
const glyphs: Record<IconName, ReactNode> = {
  waves: (
    <>
      <path d="M3 8c1.6-2 3.4-2 5 0s3.4 2 5 0 3.4-2 5 0 3.4 2 3 2" />
      <path d="M3 12c1.6-2 3.4-2 5 0s3.4 2 5 0 3.4-2 5 0 3.4 2 3 2" />
      <path d="M3 16c1.6-2 3.4-2 5 0s3.4 2 5 0 3.4-2 5 0 3.4 2 3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4C10 4 4 9.5 4 17c0 1 .2 2 .6 3C13 20 20 14 20 4Z" />
      <path d="M4.6 20C7 15 11 11 16 8.5" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5Z" />,
  sparkle: (
    <path d="M12 3c.6 4.4 1.6 5.4 6 6-4.4.6-5.4 1.6-6 6-.6-4.4-1.6-5.4-6-6 4.4-.6 5.4-1.6 6-6Z" />
  ),
  constellation: (
    <>
      <path d="M5 17 9.5 7l5 4.5L19 6" />
      <circle className="studio-icon__star" cx="5" cy="17" r="1.4" />
      <circle className="studio-icon__star" cx="9.5" cy="7" r="1.4" />
      <circle
        className="studio-icon__star studio-icon__star--bright"
        cx="14.5"
        cy="11.5"
        r="2"
      />
      <circle className="studio-icon__star" cx="19" cy="6" r="1.4" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle className="studio-icon__star" cx="5" cy="12" r="1.4" />
      <circle className="studio-icon__star" cx="12" cy="12" r="1.4" />
      <circle className="studio-icon__star" cx="19" cy="12" r="1.4" />
    </>
  ),
};

export function Icon({ name, size = 24, title, className, ...rest }: IconProps) {
  const labelled = title !== undefined;

  return (
    <svg
      className={['studio-icon', `studio-icon--${name}`, className]
        .filter(Boolean)
        .join(' ')}
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
      {...(labelled
        ? { role: 'img', 'aria-label': title }
        : { 'aria-hidden': true })}
    >
      {glyphs[name]}
    </svg>
  );
}
