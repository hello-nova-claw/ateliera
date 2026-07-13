import { createContext, useContext } from 'react';
import type { ThemeId } from './themes';

export interface ThemeContextValue {
  announce: string;
  setTheme: (theme: ThemeId) => void;
  theme: ThemeId;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme requires StudioProviders.');
  return value;
}
