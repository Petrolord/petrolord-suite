/**
 * Grey tone experiment, STAGING / DEV case: on a Vite dev server (which is
 * what suite.studio.petrolord.com runs) the ribbon shows a shade picker next
 * to the theme toggle. Choosing a shade sets data-pl-tone on the Seismolord
 * root and remembers it per user; the help guide follows; in dark the picker
 * is disabled and the theme is the standard dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toneStorageKey } from '@/design/ThemeProvider';

jest.mock('@/lib/devBuildFlag', () => ({ IS_DEV_BUILD: true }));

jest.mock('@/pages/apps/Seismolord/components/ViewerPanel', () => {
  const R = jest.requireActual('react');
  const { default: RealRibbon } = jest.requireActual('@/pages/apps/Seismolord/components/workspace/Ribbon');
  const { ThemeToggle: Toggle } = jest.requireActual('@/components/ui/theme-toggle');
  const { ToneShadePicker: Picker } = jest.requireActual('@/pages/apps/Seismolord/toneExperiment');
  return function ViewerPanelStub() {
    return R.createElement('div', null,
      R.createElement(RealRibbon, {
        tabs: [{ key: 'home', label: 'Home', content: R.createElement('div', null, 'tools') }],
        trailing: R.createElement(R.Fragment, null,
          R.createElement(Toggle, { className: 'h-7 w-7 ml-1' }),
          R.createElement(Picker)),
      }),
      R.createElement('div', { 'data-canvas': 'dark', 'data-testid': 'canvas' }));
  };
});
import Seismolord from '@/pages/apps/Seismolord/Seismolord';
import SeismolordHelpGuide from '@/pages/apps/Seismolord/SeismolordHelpGuide';

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

describe('Seismolord on staging', () => {
  test('shows the shade picker beside the theme toggle, off-white by default', () => {
    render(<MemoryRouter><Seismolord /></MemoryRouter>);
    const picker = screen.getByTestId('tone-picker');
    expect(picker).toHaveAccessibleName('Light shade');
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Off-white (current)', 'Grey soft', 'Grey panel', 'Grey classic',
    ]);
    expect(picker).toHaveValue('');
    expect(screen.getByTestId('seismolord-root')).not.toHaveAttribute('data-pl-tone');
    // the toggle and the picker sit together in the ribbon
    expect(screen.getByTestId('theme-toggle').parentElement).toBe(picker.parentElement);
  });

  test('choosing a shade tones the root and is remembered for the user', () => {
    const { unmount } = render(<MemoryRouter><Seismolord /></MemoryRouter>);
    fireEvent.change(screen.getByTestId('tone-picker'), { target: { value: 'grey-classic' } });
    const root = screen.getByTestId('seismolord-root');
    expect(root).toHaveAttribute('data-pl-tone', 'grey-classic');
    expect(root).toHaveAttribute('data-pl-theme', 'light');
    expect(localStorage.getItem(toneStorageKey(null))).toBe('grey-classic');
    // the dark canvas element is untouched (no tone or theme attribute of its own)
    expect(screen.getByTestId('canvas')).not.toHaveAttribute('data-pl-tone');
    unmount();

    render(<MemoryRouter><Seismolord /></MemoryRouter>);
    expect(screen.getByTestId('seismolord-root')).toHaveAttribute('data-pl-tone', 'grey-classic');
    expect(screen.getByTestId('tone-picker')).toHaveValue('grey-classic');
  });

  test('back to off-white clears the tone', () => {
    localStorage.setItem(toneStorageKey(null), 'grey-soft');
    render(<MemoryRouter><Seismolord /></MemoryRouter>);
    expect(screen.getByTestId('seismolord-root')).toHaveAttribute('data-pl-tone', 'grey-soft');
    fireEvent.change(screen.getByTestId('tone-picker'), { target: { value: '' } });
    expect(screen.getByTestId('seismolord-root')).not.toHaveAttribute('data-pl-tone');
    expect(localStorage.getItem(toneStorageKey(null))).toBeNull();
  });

  test('in dark the picker is disabled and the theme is the standard dark', () => {
    localStorage.setItem(toneStorageKey(null), 'grey-panel');
    render(<MemoryRouter><Seismolord /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(screen.getByTestId('seismolord-root')).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getByTestId('tone-picker')).toBeDisabled();
  });

  test('the help guide follows the stored shade', () => {
    localStorage.setItem(toneStorageKey(null), 'grey-panel');
    render(<MemoryRouter><SeismolordHelpGuide /></MemoryRouter>);
    expect(screen.getByTestId('seismolord-help-root')).toHaveAttribute('data-pl-tone', 'grey-panel');
  });
});
