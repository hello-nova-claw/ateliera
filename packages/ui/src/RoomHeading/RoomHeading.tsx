import './RoomHeading.css';
import type { ReactNode } from 'react';

export interface RoomHeadingProps {
  eyebrow: ReactNode;
  intro?: ReactNode;
  title: ReactNode;
  titleId?: string;
}

export function RoomHeading({
  eyebrow,
  intro,
  title,
  titleId,
}: RoomHeadingProps) {
  return (
    <div className="studio-room-heading">
      <p className="studio-room-heading__script">{eyebrow}</p>
      <h1 id={titleId}>{title}</h1>
      {intro !== undefined && (
        <p className="studio-room-heading__intro">{intro}</p>
      )}
    </div>
  );
}
