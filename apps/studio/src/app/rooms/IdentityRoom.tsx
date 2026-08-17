import type { StudioCardProjection, StudioService } from '@studio/application';

import { IdentityPage } from '../../features/identity/IdentityPage';
import { useIdentity } from '../../features/identity/use-identity';

export default function IdentityRoom({
  onOpenCard,
  online = true,
  projectionRevision = 0,
  service,
}: {
  onOpenCard?: (
    card: StudioCardProjection,
    trigger: HTMLButtonElement,
  ) => void;
  online?: boolean;
  projectionRevision?: number;
  service?: StudioService;
}) {
  const identity = useIdentity(service, projectionRevision, online);
  return (
    <IdentityPage
      {...(identity.error === undefined ? {} : { error: identity.error })}
      model={identity.model}
      offline={identity.offline}
      onAdd={identity.add}
      onOpen={(card, trigger) => onOpenCard?.(card, trigger)}
      onPromote={identity.promote}
      onReorder={identity.reorder}
      state={identity.state}
    />
  );
}
