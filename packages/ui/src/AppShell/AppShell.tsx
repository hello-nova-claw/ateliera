import type { ReactNode } from 'react';
import './AppShell.css';

export interface AppShellProps {
  activePath: string;
  children: ReactNode;
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
  children,
  onCapture,
  onNavigate,
  roomTitle,
  topbar,
}: AppShellProps) {
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
          <span aria-hidden="true">●</span> Stored locally
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
          onClick={(event) => onCapture(event.currentTarget)}
          type="button"
        >
          <span aria-hidden="true">＋</span>
          <span>Capture</span>
        </button>
        {studioLink('/search', 'Search', '⌕')}
        {studioLink('/settings', 'More', '•••')}
      </nav>
    </div>
  );
}
