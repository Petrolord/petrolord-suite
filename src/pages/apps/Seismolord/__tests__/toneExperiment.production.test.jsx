/**
 * Grey tone experiment, PRODUCTION case: in a production build (jest maps
 * src/lib/devBuildFlag.js to IS_DEV_BUILD = false) on a host outside
 * studio.petrolord.com, Seismolord renders no shade picker and keeps the
 * standard off-white light theme, even when a tone is stored.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toneStorageKey } from '@/design/ThemeProvider';
import { isToneExperimentEnabled } from '@/pages/apps/Seismolord/toneExperiment';

jest.mock('@/pages/apps/Seismolord/components/ViewerPanel', () => {
  const R = jest.requireActual('react');
  const { default: RealRibbon } = jest.requireActual('@/pages/apps/Seismolord/components/workspace/Ribbon');
  const { ThemeToggle: Toggle } = jest.requireActual('@/components/ui/theme-toggle');
  const { ToneShadePicker: Picker } = jest.requireActual('@/pages/apps/Seismolord/toneExperiment');
  return function ViewerPanelStub() {
    return R.createElement(RealRibbon, {
      tabs: [{ key: 'home', label: 'Home', content: R.createElement('div', null, 'tools') }],
      trailing: R.createElement(R.Fragment, null,
        R.createElement(Toggle, { className: 'h-7 w-7 ml-1' }),
        R.createElement(Picker)),
    });
  };
});
import Seismolord from '@/pages/apps/Seismolord/Seismolord';
import SeismolordHelpGuide from '@/pages/apps/Seismolord/SeismolordHelpGuide';

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

describe('the gate', () => {
  test('is off for a production build on petrolord.com', () => {
    expect(isToneExperimentEnabled({ dev: false, hostname: 'petrolord.com' })).toBe(false);
    expect(isToneExperimentEnabled({ dev: false, hostname: 'www.petrolord.com' })).toBe(false);
    expect(isToneExperimentEnabled({ dev: false, hostname: 'localhost' })).toBe(false);
    expect(isToneExperimentEnabled({ dev: false, hostname: 'studio.petrolord.com.evil.example' })).toBe(false);
    expect(isToneExperimentEnabled({ dev: false, hostname: 'notstudio.petrolord.com' })).toBe(false);
  });

  test('is on for a dev server or a studio.petrolord.com host', () => {
    expect(isToneExperimentEnabled({ dev: true, hostname: 'petrolord.com' })).toBe(true);
    expect(isToneExperimentEnabled({ dev: false, hostname: 'suite.studio.petrolord.com' })).toBe(true);
    expect(isToneExperimentEnabled({ dev: false, hostname: 'SUITE.STUDIO.PETROLORD.COM' })).toBe(true);
  });

  test('reads a production build in this jest run (jsdom host is localhost)', () => {
    expect(window.location.hostname).toBe('localhost');
    expect(isToneExperimentEnabled()).toBe(false);
  });
});

describe('Seismolord in production', () => {
  test('renders no shade picker and no tone, even with a stored tone', () => {
    localStorage.setItem(toneStorageKey(null), 'grey-classic');
    render(<MemoryRouter><Seismolord /></MemoryRouter>);
    const root = screen.getByTestId('seismolord-root');
    expect(root).toHaveAttribute('data-pl-theme', 'light');
    expect(root).not.toHaveAttribute('data-pl-tone');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('tone-picker')).not.toBeInTheDocument();
    // nothing was written either
    expect(localStorage.getItem(toneStorageKey(null))).toBe('grey-classic');
  });

  test('the help guide keeps the off-white too', () => {
    localStorage.setItem(toneStorageKey(null), 'grey-soft');
    render(<MemoryRouter><SeismolordHelpGuide /></MemoryRouter>);
    expect(screen.getByTestId('seismolord-help-root')).not.toHaveAttribute('data-pl-tone');
  });
});
