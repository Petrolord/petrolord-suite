// Petrolord theme provider and the opt-in <ThemedApp> scope.
//
// Owner decision 2026-09-27: application consoles move to a LIGHT default
// with DARK as a per-user choice, rolled out app by app. Only an app wrapped
// in <ThemedApp> gets the new theme; everything else keeps the legacy dark
// console exactly as it is, because:
//   - src/design/theme.css only has selectors under [data-pl-theme], and
//   - the adapted @/components/ui/* pieces only switch to token classes when
//     useDsTheme() finds a provider above them.
//
// The choice is remembered per user in localStorage (keyed by the signed-in
// user id, or "anon"), wrapped in try/catch because storage can be missing
// or blocked. The operating-system colour preference is deliberately not
// read: the Suite never followed it, and the owner asked for light by default.
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { DEFAULT_THEME, THEME_NAMES } from './tokens.js';
import { ThemeContext, useDsTheme, usePortalThemeProps } from './themeContext.js';

export { useDsTheme, usePortalThemeProps };

export const THEME_STORAGE_PREFIX = 'petrolord.theme.v1:';

export function themeStorageKey(userId) {
  return `${THEME_STORAGE_PREFIX}${userId || 'anon'}`;
}

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readStoredTheme(userId, storage = getStorage()) {
  try {
    const v = storage ? storage.getItem(themeStorageKey(userId)) : null;
    return THEME_NAMES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(userId, theme, storage = getStorage()) {
  try {
    if (storage) storage.setItem(themeStorageKey(userId), theme);
    return true;
  } catch {
    return false;
  }
}

/**
 * Theme state for one opted-in app. Most apps use <ThemedApp> instead,
 * which renders this plus the scoped root element.
 */
export function ThemeProvider({ userId = null, defaultTheme = DEFAULT_THEME, children }) {
  const initial = THEME_NAMES.includes(defaultTheme) ? defaultTheme : DEFAULT_THEME;
  const [theme, setThemeState] = useState(() => readStoredTheme(userId) || initial);

  // A different user signs in on this browser: load their own choice.
  useEffect(() => {
    setThemeState(readStoredTheme(userId) || initial);
  }, [userId, initial]);

  // Another tab changed the same user's choice.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (e) => {
      if (e.key === themeStorageKey(userId) && THEME_NAMES.includes(e.newValue)) {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const setTheme = useCallback((next) => {
    if (!THEME_NAMES.includes(next)) return;
    setThemeState(next);
    writeStoredTheme(userId, next);
  }, [userId]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Signed-in user id without throwing when there is no AuthProvider (tests,
// public pages). useAuth() throws outside the provider, so read the context.
function useOptionalUserId() {
  const auth = useContext(AuthContext);
  return auth?.user?.id || null;
}

/**
 * Opt-in scope for a pilot app:
 *
 *   <ThemedApp><MyApp /></ThemedApp>
 *
 * Renders a root element carrying data-pl-theme (the CSS scope) and
 * data-pl-root (page background), inside a ThemeProvider keyed to the
 * signed-in user. Nested ThemedApps reuse the outer theme.
 */
export function ThemedApp({ as: Comp = 'div', className = '', userId, defaultTheme, children, ...rest }) {
  const outer = useDsTheme();
  const authUserId = useOptionalUserId();
  const scopeUser = userId !== undefined ? userId : authUserId;

  if (outer) {
    return (
      <Comp data-pl-theme={outer.theme} className={className} {...rest}>
        {children}
      </Comp>
    );
  }
  return (
    <ThemeProvider userId={scopeUser} defaultTheme={defaultTheme}>
      <ThemedRoot as={Comp} className={className} {...rest}>
        {children}
      </ThemedRoot>
    </ThemeProvider>
  );
}

function ThemedRoot({ as: Comp, className, children, ...rest }) {
  const { theme } = useDsTheme();
  return (
    <Comp data-pl-theme={theme} data-pl-root="" className={className} {...rest}>
      {children}
    </Comp>
  );
}
