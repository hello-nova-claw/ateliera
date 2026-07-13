import type { StudioCardProjection, StudioService } from '@studio/application';
import { markdownToPlainText } from '@studio/content';
import { ReflectionPage } from '../../features/reflection/ReflectionPage';
import { useReflection } from '../../features/reflection/use-reflection';

export default function ReflectionRoom({
  onOpenCard,
  projectionRevision = 0,
  service,
}: {
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  projectionRevision?: number;
  service?: StudioService;
}) {
  const view = useReflection(service, projectionRevision);
  return (
    <ReflectionPage
      connections={view.connections}
      {...(view.error ? { error: view.error } : {})}
      imageUrls={view.imageUrls}
      model={view.model}
      onCapture={async (type, body, openAfter, trigger) => {
        const saved = await view.capture(type, body, openAfter);
        if (saved && onOpenCard) {
          const plain = markdownToPlainText(saved.note.body);
          onOpenCard({
            noteId: saved.note.id,
            path: saved.path,
            title: saved.note.title?.trim() || plain.slice(0, 80) || 'Untitled',
            excerpt: plain.slice(0, 240),
            semanticType: saved.note.semanticType,
            cardType: saved.note.cardType,
            status: saved.note.status,
            updated: saved.note.updated,
          }, trigger);
        }
      }}
      onConnect={view.connect}
      {...(onOpenCard ? { onOpen: onOpenCard } : {})}
      state={view.state}
    />
  );
}
