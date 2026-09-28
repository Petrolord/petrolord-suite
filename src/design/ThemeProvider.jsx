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
//
// First paint. On a cold load the auth session restores after the first
// render, so for a moment the user id is unknown. The last theme resolved
// for a signed-in user on this device is kept under one device key and used
// for that moment only (while AuthContext reports loading and has no user),
// so a user who chose dark does not see one light frame. Once the id is
// known their own per-user choice applies, as before.
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { DEFAULT_THEME, THEME_NAMES, TONE_NAMES } from './tokens.js';
import { ThemeContext, useDsTheme, usePortalThemeProps } from './themeContext.js';
import { publishActiveTheme } from './activeTheme.js';

export { useDsTheme, usePortalThemeProps };

export const THEME_STORAGE_PREFIX = 'petrolord.theme.v1:';

export const LAST_THEME_KEY = 'petrolord.theme.v1.last';

// Light-grey tone experiment (owner, 2026-09-28). A tone is the shade of the
// LIGHT theme (tokens.js LIGHT_TONES); no tone means the standard off-white.
// Remembered per user next to the theme, for the apps that offer a picker.
export const TONE_STORAGE_PREFIX = 'petrolord.theme.v1.tone:';

export function toneStorageKey(userId) {
  return `${TONE_STORAGE_PREFIX}${userId || 'anon'}`;
}

/** The stored tone for a user, or null (standard off-white). */
export function readStoredTone(userId, storage = getStorage()) {
  try {
    const v = storage ? storage.getItem(toneStorageKey(userId)) : null;
    return TONE_NAMES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/** Store a tone, or clear it with null / an unknown name. */
export function writeStoredTone(userId, tone, storage = getStorage()) {
  try {
    if (!storage) return false;
    if (TONE_NAMES.includes(tone)) storage.setItem(toneStorageKey(userId), tone);
    else storage.removeItem(toneStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}

/** A valid tone name, or null. */
export function normaliseTone(tone) {
  return TONE_NAMES.includes(tone) ? tone : null;
}

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

/** The last theme resolved for a signed-in user on this device, or null. */
export function readLastTheme(storage = getStorage()) {
  try {
    const v = storage ? storage.getItem(LAST_THEME_KEY) : null;
    return THEME_NAMES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeLastTheme(theme, storage = getStorage()) {
  try {
    if (storage && THEME_NAMES.includes(theme)) storage.setItem(LAST_THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

// While the user is still being restored (userPending) the device's last
// theme stands in; otherwise the user's own stored choice, then the default.
function resolveTheme(userId, userPending, initial) {
  if (userPending) return readLastTheme() || initial;
  return readStoredTheme(userId) || initial;
}

/**
 * Theme state for one opted-in app. Most apps use <ThemedApp> instead,
 * which renders this plus the scoped root element.
 */
export function ThemeProvider({ userId = null, userPending = false, defaultTheme = DEFAULT_THEME, tone = null, children }) {
  const initial = THEME_NAMES.includes(defaultTheme) ? defaultTheme : DEFAULT_THEME;
  const pending = Boolean(userPending) && !userId;
  const [theme, setThemeState] = useState(() => resolveTheme(userId, pending, initial));

  // A different user signs in on this browser, or the user finishes
  // restoring after the first paint: load their own choice.
  useEffect(() => {
    setThemeState(resolveTheme(userId, pending, initial));
  }, [userId, pending, initial]);

  // Remember what a signed-in user resolved to, for the next cold load.
  useEffect(() => {
    if (userId && !pending) writeLastTheme(theme);
  }, [userId, pending, theme]);

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

  // tone is null unless the app passes one, so the context of every other
  // scope is what it was: { theme, setTheme, toggleTheme, tone: null }
  const activeTone = normaliseTone(tone);
  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, tone: activeTone }),
    [theme, setTheme, toggleTheme, activeTone],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Signed-in user id without throwing when there is no AuthProvider (tests,
// public pages). useAuth() throws outside the provider, so read the context.
// `pending` is true while the session is still restoring (no user yet).
function useOptionalUser() {
  const auth = useContext(AuthContext);
  const id = auth?.user?.id || null;
  return { id, pending: Boolean(auth && auth.loading && !id) };
}

/**
 * Opt-in scope for a pilot app:
 *
 *   <ThemedApp><MyApp /></ThemedApp>
 *
 * Renders a root element carrying data-pl-theme (the CSS scope) and
 * data-pl-root (page background), inside a ThemeProvider keyed to the
 * signed-in user. Nested ThemedApps reuse the outer theme (and tone).
 *
 * `tone` (optional) picks a light-grey shade of the light theme, one of
 * tokens.js TONE_NAMES. It sets data-pl-tone on the root, which only has an
 * effect while the theme is light. Omitted, nothing about the scope changes.
 */
export function ThemedApp({ as: Comp = 'div', className = '', userId, defaultTheme, tone, children, ...rest }) {
  const outer = useDsTheme();
  const authUser = useOptionalUser();
  const scopeUser = userId !== undefined ? userId : authUser.id;
  const scopePending = userId !== undefined ? false : authUser.pending;

  if (outer) {
    const outerTone = outer.tone || undefined;
    return (
      <Comp data-pl-theme={outer.theme} data-pl-tone={outerTone} className={className} {...rest}>
        {children}
      </Comp>
    );
  }
  return (
    <ThemeProvider userId={scopeUser} userPending={scopePending} defaultTheme={defaultTheme} tone={tone}>
      <ThemedRoot as={Comp} className={className} {...rest}>
        {children}
      </ThemedRoot>
    </ThemeProvider>
  );
}

// Layout effect so the toaster follows the page from the first paint.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function ThemedRoot({ as: Comp, className, children, ...rest }) {
  const { theme, tone } = useDsTheme();
  // Tell the root toaster which theme the page is in (activeTheme.js).
  const handle = useRef(null);
  useIsoLayoutEffect(() => {
    handle.current = publishActiveTheme(theme);
    return () => {
      handle.current.release();
      handle.current = null;
    };
    // publish once per mount; theme changes go through update() below
  }, []);
  useIsoLayoutEffect(() => {
    if (handle.current) handle.current.update(theme);
  }, [theme]);
  return (
    <Comp data-pl-theme={theme} data-pl-tone={tone || undefined} data-pl-root="" className={className} {...rest}>
      {children}
    </Comp>
  );
}
