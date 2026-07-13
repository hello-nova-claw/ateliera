import type { CaptureEntry } from '@studio/application';
import { RoomPlaceholder } from './RoomPlaceholder';

export default function FoyerRoom({ captures }: { captures: CaptureEntry[] }) {
  return <RoomPlaceholder captures={captures} foyer title="Foyer" />;
}
