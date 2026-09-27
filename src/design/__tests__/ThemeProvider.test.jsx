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
