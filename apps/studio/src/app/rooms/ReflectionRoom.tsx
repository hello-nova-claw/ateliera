import type { StudioCardProjection, StudioService } from '@studio/application';
import { markdownToPlainText } from '@studio/content';
import { ReflectionPage } from '../../features/reflection/ReflectionPage';
import { useReflection } from '../../features/reflection/use-reflection';
import { canonicalReflectionConnection } from './reflection-connection';

export default function ReflectionRoom({
  onNavigate,
  onOpenCard,
  online = true,
  projectionRevision = 0,
  service,
}: {
  onNavigate?: (path: string, options?: { replace?: boolean }) => void;
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  online?: boolean;
  projectionRevision?: number;
  service?: StudioService;
}) {
  const view = useReflection(service, projectionRevision);
  return (
    <ReflectionPage
      connections={view.connections}
      {...(view.error ? { error: view.error } : {})}
      imageUrls={view.imageUrls}
      imageUnavailableIds={view.imageUnavailableIds}
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
      onOpenConnection={(connection, trigger) => {
        const canonical = canonicalReflectionConnection(connection, view.connections);
        if (!canonical) return;
        if (canonical.kind === 'note' && canonical.card && onOpenCard) {
          onOpenCard(canonical.card, trigger);
          return;
        }
        if (canonical.kind === 'life-area') {
          onNavigate?.(`/landscape/${canonical.id}`);
          return;
        }
        if (canonical.kind === 'season') onNavigate?.('/season');
      }}
      {...(onOpenCard ? { onOpen: onOpenCard } : {})}
      state={!online && view.state !== 'loading' && view.state !== 'error'
        ? 'offline'
        : view.state}
    />
  );
}
