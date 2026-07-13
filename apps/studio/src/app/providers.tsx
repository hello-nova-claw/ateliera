import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext } from './theme-context';
import { defaultTheme, isThemeId, themes, type ThemeId } from './themes';

const THEME_KEY = 'studio:theme';

export function StudioProviders({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const saved =
      typeof localStorage.getItem === 'function'
        ? localStorage.getItem(THEME_KEY)
        : null;
    return isThemeId(saved) ? saved : defaultTheme;
  });
  const [announce, setAnnounce] = useState('');
  const setTheme = (next: ThemeId) => {
    setThemeState(next);
    if (typeof localStorage.setItem === 'function')
      localStorage.setItem(THEME_KEY, next);
    setAnnounce(
      `${themes.find((item) => item.id === next)?.name ?? 'Theme'} theme selected.`,
    );
  };
  const mode = themes.find((item) => item.id === theme)?.mode ?? 'light';
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  const value = useMemo(
    () => ({ announce, setTheme, theme }),
    [announce, theme],
  );
  return (
    <ThemeContext.Provider value={value}>
      <div
        className="studio-app"
        data-theme={theme}
        style={{ colorScheme: mode }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
