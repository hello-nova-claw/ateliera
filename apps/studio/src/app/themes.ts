export const themes = [
  { id: 'chamomile', name: 'Chamomile', mode: 'light' },
  { id: 'fig-leaf', name: 'Fig Leaf', mode: 'light' },
  { id: 'sunrise', name: 'Sunrise', mode: 'light' },
  { id: 'wisteria', name: 'Wisteria', mode: 'light' },
  { id: 'deep-ocean', name: 'Deep Ocean', mode: 'dark' },
  { id: 'sunset', name: 'Sunset', mode: 'dark' },
  { id: 'forest', name: 'Forest', mode: 'dark' },
] as const;

export type ThemeId = (typeof themes)[number]['id'];
export const defaultTheme: ThemeId = 'chamomile';

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
