// The theme context on its own, with no other imports, so every
// @/components/ui/* piece can read it without pulling in auth or Supabase.
import { createContext, useContext } from 'react';

export const ThemeContext = createContext(null);

/**
 * The theme of the nearest scope ({ theme, setTheme, toggleTheme, fixed? }),
 * or null outside one. ThemeToggle renders nothing without one.
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
