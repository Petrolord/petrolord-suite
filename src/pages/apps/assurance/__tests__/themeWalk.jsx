/**
 * TEST-ONLY helpers for the Assurance register theme tests (design system
 * rollout W4E). Not a test file (jest's testMatch is *.test.*).
 *
 * renderShell mounts an app's page shell the way App.jsx routes it
 * (`<base>/*`), so the shell's own nested routes resolve. walkPages then
 * visits every sub-page in turn and checks there is no legacy console
 * colour under the theme scope outside data-canvas regions.
 */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { expectNoLegacyChrome, getScopeRoot } from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';

export const renderShell = (Shell, base, sub = '') => render(
  <MemoryRouter initialEntries={[`${base}${sub}`]}>
    <Routes>
      <Route path={`${base}/*`} element={<Shell />} />
    </Routes>
  </MemoryRouter>,
);

/** Waits until the page has left its loading state. */
export const settled = async () => {
  await screen.findByTestId('theme-toggle', {}, { timeout: 4000 });
  await waitFor(() => expect(screen.queryByText(/^Loading/)).toBeNull(), { timeout: 4000 });
};

/**
 * Renders every sub-page of a shell in the given theme and checks it.
 * `pages` maps a label to the sub-path ('' is the dashboard) and an
 * optional text the page shows once loaded.
 */
export const walkPages = async (Shell, base, pages, theme = 'light') => {
  for (const [sub, text] of pages) {
    window.localStorage.clear();
    if (theme === 'dark') window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderShell(Shell, base, sub);
    await settled();
    if (text) await screen.findAllByText(text);
    const scope = getScopeRoot();
    expect({ sub, theme: scope.getAttribute('data-pl-theme') }).toEqual({ sub, theme });
    expectNoLegacyChrome();
    cleanup();
  }
};

/**
 * The delete confirmation (shared ConfirmDialog, or Regulatory Compliance's
 * ConfirmDelete) opens inside a themed portal, its destructive button is on
 * the danger role, and nothing on screen paints a legacy colour.
 */
export const expectConfirmOnRoles = async () => {
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
  const buttons = [...dialog.querySelectorAll('button')];
  expect(buttons.some((b) => /\bbg-pl-danger\b/.test(b.className))).toBe(true);
  expectNoLegacyChrome();
  return dialog;
};
