import { useEffect, useRef, useState, type ReactNode } from 'react';
import './AppShell.css';

export interface AppShellProps {
  activePath: string;
  captureEnabled?: boolean;
  children: ReactNode;
  localStatus?: string;
  onCapture: (trigger: HTMLButtonElement) => void;
  onNavigate: (path: string) => void;
  roomTitle: string;
  topbar?: ReactNode;
}

const rooms = [
  ['/foyer', 'Foyer', '⌂'],
  ['/landscape', 'Life Landscape', '◇'],
  ['/season', 'Current Season', '○'],
  ['/uncharted', 'Uncharted', '✦'],
  ['/reflection', 'Reflection Garden', '❧'],
] as const;
const utilities = [
  ['/search', 'Search', '⌕'],
  ['/inbox', 'Inbox', '□'],
  ['/settings', 'Settings', '⚙'],
] as const;

export function AppShell({
  activePath,
  captureEnabled = true,
  children,
  localStatus = 'Stored locally',
  onCapture,
  onNavigate,
  roomTitle,
  topbar,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    moreMenu.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !moreMenu.current?.contains(target) &&
        target !== moreButton.current
      ) {
        setMoreOpen(false);
      }
    };
    addEventListener('pointerdown', outside);
    return () => removeEventListener('pointerdown', outside);
  }, [moreOpen]);

  function closeMore(restoreFocus = true): void {
    setMoreOpen(false);
    if (restoreFocus) moreButton.current?.focus();
  }

  function chooseMore(path: string): void {
    closeMore();
    onNavigate(path);
  }

  function moreKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const items = Array.from(
      moreMenu.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMore();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + offset + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  }

  function studioLink(path: string, label: string, mark: string) {
    const current =
      activePath === path ||
      (path === '/landscape' && activePath.startsWith('/landscape/'));
    return (
      <a
        aria-current={current ? 'page' : undefined}
        className="studio-app-shell__nav-link"
        href={path}
        key={path}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(path);
        }}
      >
        <span aria-hidden="true" className="studio-app-shell__nav-mark">
          {mark}
        </span>
        <span>{label}</span>
      </a>
    );
  }

  return (
    <div className="studio-app-shell">
      <a className="studio-app-shell__skip-link" href="#studio-main">
        Skip to content
      </a>
      <aside className="studio-app-shell__rail">
        <div className="studio-app-shell__brand">
          <span>The Studio</span>
          <small aria-hidden="true">life by design</small>
        </div>
        <nav aria-label="Studio rooms" className="studio-app-shell__room-nav">
          {rooms.map(([path, label, mark]) => studioLink(path, label, mark))}
        </nav>
        <nav
          aria-label="Studio utilities"
          className="studio-app-shell__utility-nav"
        >
          {utilities.map(([path, label, mark]) =>
            studioLink(path, label, mark),
          )}
        </nav>
        <p className="studio-app-shell__local-note">
          <span aria-hidden="true">●</span> {localStatus}
        </p>
      </aside>
      <div className="studio-app-shell__workspace">
        <header className="studio-app-shell__topbar">{topbar}</header>
        <main
          aria-label={roomTitle}
          className="studio-app-shell__main"
          id="studio-main"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="studio-app-shell__mobile-nav"
      >
        {studioLink('/foyer', 'Home', '⌂')}
        <button
          className="studio-app-shell__capture"
          disabled={!captureEnabled}
          onClick={(event) => onCapture(event.currentTarget)}
          type="button"
        >
          <span aria-hidden="true">＋</span>
          <span>Capture</span>
        </button>
        {studioLink('/search', 'Search', '⌕')}
        <button
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          className="studio-app-shell__nav-link studio-app-shell__more-trigger"
          onClick={() => setMoreOpen((open) => !open)}
          ref={moreButton}
          type="button"
        >
          <span aria-hidden="true" className="studio-app-shell__nav-mark">
            •••
          </span>
          <span>More</span>
        </button>
      </nav>
      {moreOpen && (
        <div
          aria-label="More Studio rooms"
          className="studio-app-shell__more-menu"
          onKeyDown={moreKeyDown}
          ref={moreMenu}
          role="menu"
        >
          {[
            ...rooms.slice(1),
            ...utilities.filter(([path]) => path !== '/search'),
          ].map(([path, label, mark]) => (
            <button
              className="studio-app-shell__more-item"
              key={path}
              onClick={() => chooseMore(path)}
              role="menuitem"
              type="button"
            >
              <span aria-hidden="true">{mark}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
