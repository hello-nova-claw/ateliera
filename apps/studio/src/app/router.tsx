import { useCallback, useEffect, useRef, useState } from 'react';

export const studioRoutes = {
  '/foyer': 'Foyer',
  '/identity': 'Identity Studio',
  '/landscape': 'Life Landscape',
  '/season': 'Current Season',
  '/uncharted': 'Uncharted',
  '/wisdom': 'Wisdom Garden',
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

function canonicalLocationPath(): StudioPath {
  const normalized = normalizePath(location.pathname);
  if (normalized !== location.pathname) {
    history.replaceState(null, '', normalized);
  }
  return normalized;
}

export function useStudioRouter(
  guard?: (next: StudioPath) => boolean,
  enabled = true,
) {
  const [path, setPath] = useState<StudioPath>(() =>
    normalizePath(location.pathname),
  );
  const pathRef = useRef(path);
  const guardRef = useRef(guard);
  pathRef.current = path;
  guardRef.current = guard;
  useEffect(() => {
    if (!enabled) return undefined;
    const current = canonicalLocationPath();
    pathRef.current = current;
    setPath(current);
    const onPop = () => {
      const next = canonicalLocationPath();
      if (guardRef.current?.(next) === true) {
        history.pushState(null, '', pathRef.current);
        return;
      }
      setPath(next);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [enabled]);
  const navigate = useCallback(
    (next: string, force = false, replace = false) => {
      const normalized = normalizePath(next);
      if (!force && guardRef.current?.(normalized) === true) return;
      if (replace || normalized !== next)
        history.replaceState(null, '', normalized);
      else history.pushState(null, '', normalized);
      setPath(normalized);
    },
    [],
  );
  const title = path.startsWith('/landscape/')
    ? 'Life Landscape'
    : studioRoutes[path as keyof typeof studioRoutes];
  return { navigate, path, title };
}
