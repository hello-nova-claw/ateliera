import type {
  CaptureEntry,
  FoyerImageProjection,
  StudioCardProjection,
  StudioService,
} from '@studio/application';
import type { LandscapeAnchor } from '@studio/domain';
import type { FoyerSlot } from '../features/foyer/FoyerPage';
import { lazy, Suspense, type LazyExoticComponent } from 'react';
import type { StudioPath } from './router';

interface RoomProps {
  captures: CaptureEntry[];
  onOpenCapture?: (id: string, trigger: HTMLButtonElement) => void;
  onCreateFoyer?: (slot: FoyerSlot, trigger: HTMLButtonElement) => void;
  onCreateLandscape?: (lifeArea: string, anchor: LandscapeAnchor, trigger: HTMLButtonElement) => void;
  onNavigate?: (path: string) => void;
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  onRemoveFoyerImage?: (
    image: FoyerImageProjection,
    trigger: HTMLButtonElement,
  ) => void;
  projectionRevision?: number;
  service?: StudioService;
  path?: StudioPath;
}

type LazyRoom = LazyExoticComponent<(props: RoomProps) => React.JSX.Element>;

const roomRoutes = {
  foyer: lazy(() => import('./rooms/FoyerRoom')),
  inbox: lazy(() => import('./rooms/InboxRoom')),
  landscape: lazy(() => import('./rooms/LandscapeRoom')),
  reflection: lazy(() => import('./rooms/ReflectionRoom')),
  search: lazy(() => import('./rooms/SearchRoom')),
  season: lazy(() => import('./rooms/SeasonRoom')),
  settings: lazy(() => import('./rooms/SettingsRoom')),
  uncharted: lazy(() => import('./rooms/UnchartedRoom')),
} satisfies Record<string, LazyRoom>;

function routeKey(path: StudioPath): keyof typeof roomRoutes {
  if (path.startsWith('/landscape')) return 'landscape';
  return path.slice(1) as keyof typeof roomRoutes;
}

export function RoomRoute({
  captures,
  onOpenCapture,
  onCreateFoyer,
  onCreateLandscape,
  onNavigate,
  onOpenCard,
  onRemoveFoyerImage,
  path,
  projectionRevision,
  service,
  title,
}: {
  captures: CaptureEntry[];
  onOpenCapture?: (id: string, trigger: HTMLButtonElement) => void;
  onCreateFoyer?: (slot: FoyerSlot, trigger: HTMLButtonElement) => void;
  onCreateLandscape?: (lifeArea: string, anchor: LandscapeAnchor, trigger: HTMLButtonElement) => void;
  onNavigate?: (path: string) => void;
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  onRemoveFoyerImage?: (
    image: FoyerImageProjection,
    trigger: HTMLButtonElement,
  ) => void;
  path: StudioPath;
  projectionRevision?: number;
  service?: StudioService;
  title: string;
}) {
  const Room = roomRoutes[routeKey(path)] as LazyRoom;
  return (
    <Suspense
      fallback={
        <p
          aria-label={`Opening ${title}`}
          className="studio-room__loading"
          role="status"
        >
          Opening this room…
        </p>
      }
    >
      <Room
        captures={captures}
        {...(onCreateFoyer === undefined ? {} : { onCreateFoyer })}
        {...(onCreateLandscape === undefined ? {} : { onCreateLandscape })}
        {...(onNavigate === undefined ? {} : { onNavigate })}
        {...(onOpenCard === undefined ? {} : { onOpenCard })}
        {...(onRemoveFoyerImage === undefined ? {} : { onRemoveFoyerImage })}
        {...(onOpenCapture === undefined ? {} : { onOpenCapture })}
        {...(projectionRevision === undefined ? {} : { projectionRevision })}
        {...(service === undefined ? {} : { service })}
        path={path}
      />
    </Suspense>
  );
}
