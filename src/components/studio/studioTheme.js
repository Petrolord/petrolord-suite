// Design system bridge for the Studio kit and the apps built on it.
//
// The kit is shared by about 33 apps and only the apps wrapped in
// <ThemedApp> (docs/scope/DesignSystem.md section 4) may change, so every
// themed class here is chosen at render time: outside a [data-pl-theme]
// scope useDsTheme() is null and the legacy string comes back byte for
// byte. An app opts in at its route; its own components can use the same
// picker while both looks are still needed.
import { useDsTheme } from '@/design/themeContext';

/**
 * Returns tc(legacy, themed): the legacy class string outside a theme
 * scope, the themed one inside it.
 */
export function useStudioTheme() {
  const ds = useDsTheme();
  const tc = (legacy, themed) => (ds ? themed : legacy);
  return { ds, tc };
}

// Status chips and banners on theme roles (colour only for status, always
// paired with a word). Keys follow the tone names the Studio apps use.
export const THEMED_TONE = {
  good: 'text-pl-success-text bg-pl-success-bg border-pl-success/40',
  warn: 'text-pl-warning-text bg-pl-warning-bg border-pl-warning/40',
  danger: 'text-pl-danger-text bg-pl-danger-bg border-pl-danger/40',
  info: 'text-pl-info-text bg-pl-info-bg border-pl-info/40',
  neutral: 'text-pl-muted bg-pl-sunken border-pl-border',
};

// The same tones as text only (table cells, inline notes).
export const THEMED_TONE_TEXT = {
  good: 'text-pl-success-text',
  warn: 'text-pl-warning-text',
  danger: 'text-pl-danger-text',
  info: 'text-pl-info-text',
  neutral: 'text-pl-muted',
};
