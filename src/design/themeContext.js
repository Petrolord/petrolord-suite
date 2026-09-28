// The theme context on its own, with no other imports, so every
// @/components/ui/* piece can read it without pulling in auth or Supabase.
import { createContext, useContext } from 'react';

export const ThemeContext = createContext(null);

/**
 * The theme of the nearest opted-in scope ({ theme, setTheme, toggleTheme }),
 * or null outside one. The adapted ui components treat null as "render the
 * legacy classes unchanged".
 */
export function useDsTheme() {
  return useContext(ThemeContext);
}

/**
 * Props for a Radix portal content element (dialog, popover, select, menu,
 * tooltip). Portals render into document.body, outside the scope element, so
 * they carry the attribute themselves. Empty outside a scope.
 */
export function usePortalThemeProps() {
  const ds = useContext(ThemeContext);
  return ds ? { 'data-pl-theme': ds.theme } : {};
}
