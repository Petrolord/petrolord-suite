/**
 * The shared production kit (WellModelPanel, WellModelSpinePanel) on theme
 * roles, in light and in dark (rollout W0B; the legacy branch and its
 * snapshots went in batch 7B).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import WellModelPanel from '@/components/production/WellModelPanel';
import WellModelSpinePanel from '@/components/production/WellModelSpinePanel';
import { ThemedApp } from '@/design/ThemeProvider';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});
afterEach(cleanup);

const base = {
  well: { mode: 'vertical', depthFt: 8000, surveyText: '0,0,0\n1000,10,90', whtF: 100, bhtF: 200 },
  fluid: { api: 35, gasSg: 0.7, gor: 500, salinityPpm: 30000 },
  inflow: { model: 'composite', pr: 3000, pb: 2000, calMode: 'pi', pi: 1.5, qmax: 4000, testQ: 800, testPwf: 1500 },
  completion: { idIn: 2.441, casingIdIn: 6.276, roughnessIn: 0.0006, stepFt: 100, correlation: 'beggsBrill' },
};
const withIn = (patch) => ({ ...base, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { ...base[k], ...v }])) });
const noop = () => {};
const SAVED = { updated_at: '2026-09-01T10:00:00Z', inputs: base };

export const productionScenes = {
  'WellModelPanel vertical, PI, completion': () => <WellModelPanel inputs={base} setSection={noop} />,
  'WellModelPanel deviated, test, notes': () => (
    <WellModelPanel inputs={withIn({ well: { mode: 'deviated' }, inflow: { calMode: 'test' } })} setSection={noop}
      fluidNote="Fluid note." completionNote="Completion note." depthLabel="Perforation depth (ft TVD)" depthHint="Hint." />
  ),
  'WellModelPanel vogel qmax, no completion': () => (
    <WellModelPanel inputs={withIn({ inflow: { model: 'vogel', calMode: 'qmax' } })} setSection={noop} showCompletion={false} />
  ),
  'WellModelPanel qmax on a non-Vogel model (warning)': () => (
    <WellModelPanel inputs={withIn({ inflow: { calMode: 'qmax' } })} setSection={noop} />
  ),
  'WellModelSpinePanel no well': () => <WellModelSpinePanel wellName="" />,
  'WellModelSpinePanel no saved model': () => <WellModelSpinePanel wellName="W-1" savedModel={null} onLoad={noop} onSave={noop} />,
  'WellModelSpinePanel saved, matches': () => <WellModelSpinePanel wellName="W-1" savedModel={SAVED} isDirty={false} onLoad={noop} onSave={noop} />,
  'WellModelSpinePanel saved, diverged, busy': () => <WellModelSpinePanel wellName="W-1" savedModel={SAVED} isDirty busy onLoad={noop} onSave={noop} />,
};

// Open the first select so its portal content is pinned as well.
const openFirstSelect = async () => {
  const trigger = document.querySelector('button[role="combobox"]');
  if (!trigger) return;
  await act(async () => { fireEvent.keyDown(trigger, { key: 'ArrowDown' }); });
};

// Inside a scope: every legacy console colour in these files is gone, the
// open select menu included (it is portalled, so check document.body).
const LEGACY = /\b(?:bg|text|border)-(?:slate|amber|emerald)-\d|text-white\b/;
const renderThemed = async (Scene, theme) => {
  window.localStorage.clear();
  const utils = render(<ThemedApp userId="w0b" defaultTheme={theme}><Scene /></ThemedApp>);
  await openFirstSelect();
  return utils;
};

describe('inside a scope the production kit uses theme roles', () => {
  test('negative control: a planted console class is caught', async () => {
    const Scene = productionScenes['WellModelPanel vertical, PI, completion'];
    render(<Scene />);
    await openFirstSelect();
    expect(document.body.innerHTML).not.toMatch(LEGACY);
    const plant = document.createElement('div');
    plant.className = 'bg-slate-900 text-white';
    document.body.appendChild(plant);
    expect(document.body.innerHTML).toMatch(LEGACY);
    plant.remove();
  });

  for (const theme of ['light', 'dark']) {
    for (const [name, Scene] of Object.entries(productionScenes)) {
      test(`${theme}: ${name}`, async () => {
        const { container } = await renderThemed(Scene, theme);
        expect(container.querySelector('[data-pl-theme]')).toHaveAttribute('data-pl-theme', theme);
        expect(document.body.innerHTML).not.toMatch(LEGACY);
      });
    }

    test(`${theme}: fields, menus and status use roles`, async () => {
      await renderThemed(productionScenes['WellModelPanel qmax on a non-Vogel model (warning)'], theme);
      expect(document.body.innerHTML).toMatch(/text-pl-warning-text/);
      expect(document.body.innerHTML).toMatch(/border-pl-border/);
      const listbox = document.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
      // the menu takes the adapted Select's raised surface and the scope attribute
      expect(listbox.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', theme);
      cleanup();
      await renderThemed(productionScenes['WellModelSpinePanel saved, matches'], theme);
      expect(document.body.innerHTML).toMatch(/text-pl-success/);
    });
  }
});
