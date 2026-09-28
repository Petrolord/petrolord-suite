// The theme context on its own, with no other imports, so every
// @/components/ui/* piece can read it without pulling in auth or Supabase.
import { createContext, useContext } from 'react';

export const ThemeContext = createContext(null);

/**
 * The theme of the nearest opted-in scope ({ theme, setTheme, toggleTheme,
 * tone }; tone is null unless the app picked a light-grey shade),
 * or null outside one. The adapted ui components treat null as "render the
 * legacy classes unchanged".
 */
export function useDsTheme() {
  return useContext(ThemeContext);
}

/**
 * Props for a Radix portal content element (dialog, popover, select, menu,
 * tooltip). Portals render into document.body, outside the scope element, so
 * they carry the attribute themselves (and the tone, when one is set).
 * Empty outside a scope.
 */
export function usePortalThemeProps() {
  const ds = useContext(ThemeContext);
  if (!ds) return {};
  return ds.tone ? { 'data-pl-theme': ds.theme, 'data-pl-tone': ds.tone } : { 'data-pl-theme': ds.theme };
}
