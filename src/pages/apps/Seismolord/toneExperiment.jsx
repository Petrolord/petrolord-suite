// Light-grey tone experiment on Seismolord (owner, 2026-09-28: "I was
// expecting light grey for the apps consoles and not off white. Let us try
// light grey please. Experiment it on Seismolord").
//
// A shade picker beside the ribbon's theme toggle offers the standard
// off-white and the three grey tones in src/design/tokens.js LIGHT_TONES.
// It is shown ONLY on a Vite dev server (local dev and staging, which is a
// dev server) or on a *.studio.petrolord.com host. In a production build on
// petrolord.com the picker is not rendered, no stored tone is read, and
// Seismolord keeps the standard off-white light theme.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { IS_DEV_BUILD } from '@/lib/devBuildFlag';
import { useDsTheme } from '@/design/themeContext';
import { readStoredTone, writeStoredTone, normaliseTone } from '@/design/ThemeProvider';

export const TONE_OPTIONS = [
  { value: '', label: 'Off-white (current)' },
  { value: 'grey-soft', label: 'Grey soft' },
  { value: 'grey-panel', label: 'Grey panel' },
  { value: 'grey-classic', label: 'Grey classic' },
];

const STAGING_HOST = 'studio.petrolord.com';

function currentHostname() {
  try {
    return typeof window !== 'undefined' ? window.location.hostname || '' : '';
  } catch {
    return '';
  }
}

/** True on a dev server or a studio.petrolord.com host; false in production. */
export function isToneExperimentEnabled({ dev = IS_DEV_BUILD, hostname = currentHostname() } = {}) {
  if (dev) return true;
  const h = String(hostname || '').toLowerCase();
  return h === STAGING_HOST || h.endsWith(`.${STAGING_HOST}`);
}

/**
 * The tone Seismolord renders with and its setter. Off the experiment hosts
 * the tone is always null (standard off-white) and nothing is read or written.
 */
export function useSeismolordTone({ enabled: enabledOverride } = {}) {
  const auth = useContext(AuthContext);
  const userId = auth?.user?.id || null;
  const enabled = enabledOverride !== undefined ? Boolean(enabledOverride) : isToneExperimentEnabled();
  const [tone, setToneState] = useState(() => (enabled ? readStoredTone(userId) : null));

  useEffect(() => {
    setToneState(enabled ? readStoredTone(userId) : null);
  }, [enabled, userId]);

  const setTone = useCallback((next) => {
    if (!enabled) return;
    const t = normaliseTone(next);
    setToneState(t);
    writeStoredTone(userId, t);
  }, [enabled, userId]);

  return useMemo(() => ({ enabled, tone: enabled ? tone : null, setTone }), [enabled, tone, setTone]);
}

const ToneContext = createContext(null);

/** Provides the tone state to the ribbon picker. */
export function SeismolordToneProvider({ value, children }) {
  return <ToneContext.Provider value={value}>{children}</ToneContext.Provider>;
}

/**
 * Compact shade picker for the ribbon. Renders nothing outside a
 * SeismolordToneProvider or when the experiment is off (production).
 * The shades are for the light theme, so the picker is disabled in dark.
 */
export function ToneShadePicker({ className = '' }) {
  const ctx = useContext(ToneContext);
  const ds = useDsTheme();
  if (!ctx || !ctx.enabled || !ds) return null;
  const isDark = ds.theme === 'dark';
  const title = isDark
    ? 'Light shade (staging preview): switch to the light theme to compare shades'
    : 'Light shade (staging preview)';
  return (
    <select
      aria-label="Light shade"
      title={title}
      data-testid="tone-picker"
      value={ctx.tone || ''}
      disabled={isDark}
      onChange={(e) => ctx.setTone(e.target.value || null)}
      className={`h-7 ml-1 rounded-md border border-pl-border bg-pl-surface px-1.5 text-xs text-pl-text hover:bg-pl-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {TONE_OPTIONS.map((o) => (
        <option key={o.value || 'off-white'} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
