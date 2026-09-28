/**
 * Toasts match the page (owner revision of lead decision 3, 2026-09-28).
 * The root toaster sits outside every scope; an opted-in app publishes its
 * resolved theme (activeTheme.js) and the toaster follows it. With no app
 * opted in on screen the toaster renders its legacy markup (the byte-for-
 * byte check is the "toaster" scene in uiLegacyDom.test.jsx).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { toast } from 'sonner';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: {}, from: jest.fn() } }));

import { Toaster } from '@/components/ui/sonner';
import { ThemedApp } from '@/design/ThemeProvider';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { getActiveTheme, publishActiveTheme } from '@/design/activeTheme';

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  act(() => { toast.dismiss(); });
  cleanup();
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

const show = async (msg) => {
  await act(async () => {
    toast(msg, { id: msg });
    await new Promise((r) => setTimeout(r, 30));
  });
};

it('no scope on screen (the homepage): one light paper toast, no lime, no green, nothing published', async () => {
  render(<Toaster richColors closeButton />);
  await show('Saved on paper');
  expect(getActiveTheme()).toBeNull();
  expect(document.documentElement).not.toHaveAttribute('data-pl-active-theme');
  expect(document.querySelector('[data-pl-toaster]')).toBeNull();
  expect(document.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-theme', 'light');
  expect(document.querySelector('[data-sonner-toaster]')).not.toHaveAttribute('data-rich-colors', 'true');
  const li = screen.getByText('Saved on paper').closest('li');
  expect(li.className).toMatch(/group-\[\.toaster\]:bg-\[#FFFFFF\]/);
  expect(li.className).toMatch(/group-\[\.toaster\]:text-\[#14231B\]/);
  expect(li.className).not.toMatch(/lime|green|emerald|bg-background/);
});

it('inside a light app: toasts are light and on theme roles', async () => {
  render(
    <>
      <ThemedApp userId="u-light"><p>app</p></ThemedApp>
      <Toaster richColors closeButton />
    </>,
  );
  await show('Saved light');
  expect(getActiveTheme()).toBe('light');
  expect(document.documentElement).toHaveAttribute('data-pl-active-theme', 'light');
  const wrap = document.querySelector('[data-pl-toaster]');
  expect(wrap).toHaveAttribute('data-pl-theme', 'light');
  expect(wrap.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-theme', 'light');
  const li = screen.getByText('Saved light').closest('li');
  expect(li.className).toMatch(/group-\[\.toaster\]:bg-pl-raised/);
});

it('follows the toggle to dark and back to paper when the app unmounts', async () => {
  const { rerender } = render(
    <>
      <ThemedApp userId="u-toggle"><ThemeToggle /></ThemedApp>
      <Toaster />
    </>,
  );
  await show('Saved toggle');
  fireEvent.click(screen.getByTestId('theme-toggle'));
  expect(getActiveTheme()).toBe('dark');
  expect(document.querySelector('[data-pl-toaster]')).toHaveAttribute('data-pl-theme', 'dark');
  expect(document.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-theme', 'dark');

  rerender(<Toaster />);
  expect(getActiveTheme()).toBeNull();
  expect(document.querySelector('[data-pl-toaster]')).toBeNull();
  expect(document.documentElement).not.toHaveAttribute('data-pl-active-theme');
});

it('the most recently mounted scope wins, and releasing it falls back to the earlier one', () => {
  const a = publishActiveTheme('light');
  const b = publishActiveTheme('dark');
  expect(getActiveTheme()).toBe('dark');
  b.release();
  expect(getActiveTheme()).toBe('light');
  a.update('dark');
  expect(getActiveTheme()).toBe('dark');
  a.release();
  expect(getActiveTheme()).toBeNull();
});

it('a nested ThemedApp does not publish a second entry', () => {
  const { unmount } = render(<ThemedApp userId="n"><ThemedApp><p>inner</p></ThemedApp></ThemedApp>);
  expect(getActiveTheme()).toBe('light');
  unmount();
  expect(getActiveTheme()).toBeNull();
});
