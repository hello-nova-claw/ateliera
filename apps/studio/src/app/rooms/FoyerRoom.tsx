import type { CaptureEntry } from '@studio/application';
import { RoomPlaceholder } from './RoomPlaceholder';

export default function FoyerRoom({
  captures,
  onOpenCapture,
}: {
  captures: CaptureEntry[];
  onOpenCapture?: (id: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <RoomPlaceholder
      captures={captures}
      foyer
      {...(onOpenCapture === undefined ? {} : { onOpenCapture })}
      title="Foyer"
    />
  );
}
