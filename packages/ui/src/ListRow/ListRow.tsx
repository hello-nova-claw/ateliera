import { Icon } from '../Icon/Icon';
import './ListRow.css';

export interface ListRowProps {
  title: string;
  meta?: string;
  /** Optional thumbnail; rendered as a decorative image. */
  thumbSrc?: string;
  /** When set, the row is a link. Otherwise it is a button using onOpen. */
  href?: string;
  onOpen?: () => void;
}

export function ListRow({ title, meta, thumbSrc, href, onOpen }: ListRowProps) {
  const inner = (
    <>
      <span aria-hidden="true" className="studio-list-row__thumb">
        {thumbSrc ? <img alt="" src={thumbSrc} /> : null}
      </span>
      <span className="studio-list-row__text">
        <span className="studio-list-row__title">{title}</span>
        {meta ? <span className="studio-list-row__meta">{meta}</span> : null}
      </span>
      <Icon aria-hidden="true" className="studio-list-row__chevron" name="chevron" size={18} />
    </>
  );

  if (href !== undefined) {
    return (
      <a className="studio-list-row" href={href}>
        {inner}
      </a>
    );
  }

  return (
    <button className="studio-list-row" onClick={onOpen} type="button">
      {inner}
    </button>
  );
}
