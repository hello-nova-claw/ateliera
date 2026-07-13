import { useCallback, useEffect, useRef, useState } from 'react';

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

function canonicalLocationPath(): StudioPath {
  const normalized = normalizePath(location.pathname);
  if (normalized !== location.pathname) {
    history.replaceState(null, '', normalized);
  }
  return normalized;
}

export function useStudioRouter(guard?: (next: StudioPath) => boolean) {
  const [path, setPath] = useState<StudioPath>(canonicalLocationPath);
  const pathRef = useRef(path);
  const guardRef = useRef(guard);
  pathRef.current = path;
  guardRef.current = guard;
  useEffect(() => {
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
  }, []);
  const navigate = useCallback((next: string, force = false) => {
    const normalized = normalizePath(next);
    if (!force && guardRef.current?.(normalized) === true) return;
    if (normalized === next) history.pushState(null, '', normalized);
    else history.replaceState(null, '', normalized);
    setPath(normalized);
  }, []);
  const title = path.startsWith('/landscape/')
    ? 'Life Landscape'
    : studioRoutes[path as keyof typeof studioRoutes];
  return { navigate, path, title };
}
