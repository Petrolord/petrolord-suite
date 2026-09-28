/**
 * Light-grey tone experiment (owner, 2026-09-28): ThemedApp takes an optional
 * tone. Without one the scope is exactly what it was (no data-pl-tone, tone
 * null in the context, portal props unchanged); with one the root, nested
 * scopes and portal content carry data-pl-tone. The tone is stored per user
 * next to the theme, tolerating storage that throws.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

import {
  ThemedApp, toneStorageKey, readStoredTone, writeStoredTone, normaliseTone, TONE_STORAGE_PREFIX,
  THEME_STORAGE_PREFIX,
} from '@/design/ThemeProvider';
import { useDsTheme, usePortalThemeProps } from '@/design/themeContext';

const Probe = () => {
  const ds = useDsTheme();
  const portal = usePortalThemeProps();
  return (
    <span data-testid="probe" data-tone={String(ds.tone)} data-portal={JSON.stringify(portal)}>
      {Object.keys(ds).sort().join(',')}
    </span>
  );
};

const scopeRoot = () => document.querySelector('[data-pl-root]');

beforeEach(() => window.localStorage.clear());

describe('ThemedApp without a tone (every pilot today)', () => {
  it('renders no data-pl-tone, a null tone and the same portal props as before', () => {
    render(<ThemedApp userId="u1"><Probe /></ThemedApp>);
    expect(scopeRoot()).not.toHaveAttribute('data-pl-tone');
    const probe = screen.getByTestId('probe');
    expect(probe).toHaveAttribute('data-tone', 'null');
    expect(JSON.parse(probe.getAttribute('data-portal'))).toEqual({ 'data-pl-theme': 'light' });
  });

  it('ignores an unknown tone name', () => {
    render(<ThemedApp userId="u1" tone="beige"><Probe /></ThemedApp>);
    expect(scopeRoot()).not.toHaveAttribute('data-pl-tone');
    expect(screen.getByTestId('probe')).toHaveAttribute('data-tone', 'null');
  });
});

describe('ThemedApp with a tone', () => {
  it('marks the root, nested scopes and portal content with the tone', () => {
    render(
      <ThemedApp userId="u1" tone="grey-panel">
        <ThemedApp data-testid="inner"><Probe /></ThemedApp>
      </ThemedApp>,
    );
    expect(scopeRoot()).toHaveAttribute('data-pl-tone', 'grey-panel');
    expect(scopeRoot()).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByTestId('inner')).toHaveAttribute('data-pl-tone', 'grey-panel');
    expect(JSON.parse(screen.getByTestId('probe').getAttribute('data-portal')))
      .toEqual({ 'data-pl-theme': 'light', 'data-pl-tone': 'grey-panel' });
  });

  it('keeps the tone attribute in dark, where the CSS gives it no effect', () => {
    window.localStorage.setItem(`${THEME_STORAGE_PREFIX}u1`, 'dark');
    render(<ThemedApp userId="u1" tone="grey-classic"><Probe /></ThemedApp>);
    expect(scopeRoot()).toHaveAttribute('data-pl-theme', 'dark');
    expect(scopeRoot()).toHaveAttribute('data-pl-tone', 'grey-classic');
  });
});

describe('tone storage', () => {
  it('stores per user next to the theme key', () => {
    expect(TONE_STORAGE_PREFIX.startsWith(THEME_STORAGE_PREFIX.slice(0, -1))).toBe(true);
    expect(toneStorageKey('u1')).toBe('petrolord.theme.v1.tone:u1');
    expect(toneStorageKey(null)).toBe('petrolord.theme.v1.tone:anon');
    expect(writeStoredTone('u1', 'grey-soft')).toBe(true);
    expect(readStoredTone('u1')).toBe('grey-soft');
    expect(readStoredTone('u2')).toBeNull();
    writeStoredTone('u1', null);
    expect(window.localStorage.getItem(toneStorageKey('u1'))).toBeNull();
  });

  it('reads an unknown stored value as no tone', () => {
    window.localStorage.setItem(toneStorageKey('u1'), 'purple');
    expect(readStoredTone('u1')).toBeNull();
    expect(normaliseTone('purple')).toBeNull();
    expect(normaliseTone('grey-classic')).toBe('grey-classic');
  });

  it('swallows storage errors', () => {
    const throwing = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    expect(readStoredTone('u1', throwing)).toBeNull();
    expect(writeStoredTone('u1', 'grey-soft', throwing)).toBe(false);
    expect(writeStoredTone('u1', null, throwing)).toBe(false);
  });
});
