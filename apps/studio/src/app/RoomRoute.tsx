import type { CaptureEntry } from '@studio/application';
import { lazy, Suspense, type LazyExoticComponent } from 'react';
import type { StudioPath } from './router';

interface RoomProps {
  captures: CaptureEntry[];
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
  path,
  title,
}: {
  captures: CaptureEntry[];
  path: StudioPath;
  title: string;
}) {
  const Room = roomRoutes[routeKey(path)];
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
      <Room captures={captures} />
    </Suspense>
  );
}
