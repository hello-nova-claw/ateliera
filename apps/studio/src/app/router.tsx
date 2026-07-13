import { useCallback, useEffect, useState } from 'react';

export const studioRoutes = {
  '/foyer': 'Foyer',
  '/landscape': 'Life Landscape',
  '/season': 'Current Season',
  '/uncharted': 'Uncharted',
  '/reflection': 'Reflection Garden',
  '/search': 'Search',
  '/inbox': 'Inbox',
  '/settings': 'Settings',
} as const;

export type StudioPath = keyof typeof studioRoutes | `/landscape/${string}`;

function normalizePath(path: string): StudioPath {
  if (path.startsWith('/landscape/')) return path as `/landscape/${string}`;
  return path in studioRoutes ? (path as keyof typeof studioRoutes) : '/foyer';
}

export function useStudioRouter() {
  const [path, setPath] = useState<StudioPath>(() =>
    normalizePath(location.pathname),
  );
  useEffect(() => {
    const onPop = () => setPath(normalizePath(location.pathname));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((next: string) => {
    const normalized = normalizePath(next);
    history.pushState(null, '', normalized);
    setPath(normalized);
  }, []);
  const title = path.startsWith('/landscape/')
    ? 'Life Landscape'
    : studioRoutes[path as keyof typeof studioRoutes];
  return { navigate, path, title };
}
