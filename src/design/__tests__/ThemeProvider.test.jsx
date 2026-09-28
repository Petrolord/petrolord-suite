/**
 * ThemeProvider / ThemedApp: light by default, per-user persistence in
 * localStorage (tolerating storage that throws), the toggle, and no reading
 * of the OS colour preference.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

import { AuthContext } from '@/contexts/SupabaseAuthContext';
import {
  ThemedApp, ThemeProvider, themeStorageKey, readStoredTheme, writeStoredTheme,
  LAST_THEME_KEY, readLastTheme, writeLastTheme,
} from '@/design/ThemeProvider';
import { useDsTheme } from '@/design/themeContext';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const Probe = () => {
  const ds = useDsTheme();
  return <span data-testid="probe">{ds ? ds.theme : 'none'}</span>;
};

const scopeRoot = () => document.querySelector('[data-pl-root]');

beforeEach(() => {
  window.localStorage.clear();
});

describe('ThemedApp', () => {
  it('is light by default and marks its root as the themed scope', () => {
    render(<ThemedApp userId="u1"><Probe /></ThemedApp>);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
    expect(scopeRoot()).toHaveAttribute('data-pl-theme', 'light');
  });

  it('does not read the operating-system colour preference', () => {
    const spy = jest.fn(() => ({ matches: true, addListener() {}, removeListener() {} }));
    const original = window.matchMedia;
    window.matchMedia = spy;
    try {
      render(<ThemedApp userId="u1"><Probe /></ThemedApp>);
      expect(screen.getByTestId('probe')).toHaveTextContent('light');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });

  it('toggles with the header control and remembers the choice for that user', () => {
    const { unmount } = render(<ThemedApp userId="u1"><ThemeToggle /><Probe /></ThemedApp>);
    const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    expect(scopeRoot()).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(themeStorageKey('u1'))).toBe('dark');
    unmount();

    // same user comes back: dark
    const again = render(<ThemedApp userId="u1"><Probe /></ThemedApp>);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    again.unmount();

    // a different user on the same browser keeps their own default
    render(<ThemedApp userId="u2"><Probe /></ThemedApp>);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('keys the choice by the signed-in user from AuthContext, and switches when the user changes', () => {
    window.localStorage.setItem(themeStorageKey('alice'), 'dark');
    const Wrapper = ({ id }) => (
      <AuthContext.Provider value={{ user: id ? { id } : null }}>
        <ThemedApp><Probe /></ThemedApp>
      </AuthContext.Provider>
    );
    const { rerender } = render(<Wrapper id="alice" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    rerender(<Wrapper id="bob" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
    rerender(<Wrapper id={null} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('works without an AuthProvider (public pages, tests) using the anon key', () => {
    render(<ThemedApp><ThemeToggle /><Probe /></ThemedApp>);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(window.localStorage.getItem(themeStorageKey(null))).toBe('dark');
    expect(themeStorageKey(null)).toBe('petrolord.theme.v1:anon');
  });

  it('follows a change made in another tab for the same user', () => {
    render(<ThemedApp userId="u1"><Probe /></ThemedApp>);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: themeStorageKey('u1'), newValue: 'dark' }));
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: themeStorageKey('other'), newValue: 'light' }));
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  it('ignores a corrupt stored value', () => {
    window.localStorage.setItem(themeStorageKey('u1'), 'purple');
    render(<ThemedApp userId="u1"><Probe /></ThemedApp>);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('reuses the outer theme when nested, without a second provider', () => {
    render(
      <ThemedApp userId="u1">
        <ThemeToggle />
        <ThemedApp data-testid="inner"><Probe /></ThemedApp>
      </ThemedApp>,
    );
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(screen.getByTestId('inner')).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });
});

describe('first paint while the session restores (hub pilot)', () => {
  // On a cold load AuthContext reports loading with no user for a moment.
  // Without the device key a user who chose dark saw one light frame.
  const Wrapper = ({ auth }) => (
    <AuthContext.Provider value={auth}>
      <ThemedApp><Probe /></ThemedApp>
    </AuthContext.Provider>
  );

  it('paints the last theme this device resolved while the user id is unknown', () => {
    window.localStorage.setItem(themeStorageKey('alice'), 'dark');
    window.localStorage.setItem(LAST_THEME_KEY, 'dark');
    const { rerender } = render(<Wrapper auth={{ user: null, loading: true }} />);
    // the very first render is already dark: no light frame
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    expect(scopeRoot()).toHaveAttribute('data-pl-theme', 'dark');
    rerender(<Wrapper auth={{ user: { id: 'alice' }, loading: false }} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  it('hands over to the real user choice once the id arrives', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'dark');
    const { rerender } = render(<Wrapper auth={{ user: null, loading: true }} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    // bob never chose dark: he gets his own (default light) theme
    rerender(<Wrapper auth={{ user: { id: 'bob' }, loading: false }} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
    expect(window.localStorage.getItem(LAST_THEME_KEY)).toBe('light');
  });

  it('records the resolved theme for a signed-in user, and each toggle', () => {
    window.localStorage.setItem(themeStorageKey('alice'), 'dark');
    render(
      <AuthContext.Provider value={{ user: { id: 'alice' }, loading: false }}>
        <ThemedApp><ThemeToggle /><Probe /></ThemedApp>
      </AuthContext.Provider>,
    );
    expect(window.localStorage.getItem(LAST_THEME_KEY)).toBe('dark');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(window.localStorage.getItem(LAST_THEME_KEY)).toBe('light');
    expect(window.localStorage.getItem(themeStorageKey('alice'))).toBe('light');
  });

  it('does not use the device key once auth has settled without a user (signed out)', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'dark');
    render(<Wrapper auth={{ user: null, loading: false }} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('does not use the device key when the caller passes a user id', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'dark');
    render(
      <AuthContext.Provider value={{ user: null, loading: true }}>
        <ThemedApp userId="u9"><Probe /></ThemedApp>
      </AuthContext.Provider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('is light on a device that never resolved a theme', () => {
    render(<Wrapper auth={{ user: null, loading: true }} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
    expect(window.localStorage.getItem(LAST_THEME_KEY)).toBeNull();
  });

  it('ignores a corrupt device value and tolerates storage that throws', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'purple');
    expect(readLastTheme()).toBeNull();
    const throwing = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(readLastTheme(throwing)).toBeNull();
    expect(writeLastTheme('dark', throwing)).toBe(false);
  });
});

describe('storage that throws (private mode, blocked site data)', () => {
  const throwing = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
  };

  it('read and write helpers swallow the error', () => {
    expect(readStoredTheme('u1', throwing)).toBeNull();
    expect(writeStoredTheme('u1', 'dark', throwing)).toBe(false);
  });

  it('the provider still renders light and still toggles in memory', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      render(<ThemeProvider userId="u1"><ThemeToggle /><Probe /></ThemeProvider>);
      expect(screen.getByTestId('probe')).toHaveTextContent('light');
      fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

describe('ThemeToggle outside a scope', () => {
  it('renders nothing, so shared headers can include it safely', () => {
    const { container } = render(<ThemeToggle />);
    expect(container).toBeEmptyDOMElement();
  });
});
