/**
 * The shared wells kit on theme roles (rollout W0C; the legacy branch and
 * its snapshots went in batch 7B): inside a scope no dark console colour is
 * left outside the log paper, and the log paper (cross-section drawing
 * area, depth navigator) stays white in both themes.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, fireEvent, act } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

import { ThemedApp } from '@/design/ThemeProvider';
import LayoutPanel from '@/components/wells/LayoutPanel';
import TopNamePopover from '@/components/wells/TopNamePopover';
import DepthNavigator from '@/components/wells/DepthNavigator';
import CrossSection from '@/components/wells/section/CrossSection';
import CoreImagesPanel from '@/components/wells/CoreImagesPanel';
import IntervalsEditor from '@/components/wells/IntervalsEditor';
import { buildDefaultLayouts } from '@/components/wells/layout/layoutSchema';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // jsdom has no 2D context; the painters bail out on null
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const LEGACY_CONSOLE = /\b(bg|text|border|ring|accent)-(slate|cyan|lime|emerald|amber|red|sky)-\d{2,3}\b|\btext-white\b/;

const well = { id: 'w1', name: 'KETA-1', is_own: true };

// a custom (not built-in) template that exercises every fill mode
const customLayouts = () => {
  const base = buildDefaultLayouts();
  const tpl = {
    id: 'tpl-x', name: 'Mine', builtin: false,
    tracks: [
      {
        id: 'trk-a', title: 'Porosity', type: 'curves', width: 1, scale: 'linear', min: 0, max: 0.4,
        curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }, { source: 'log:RHOB', label: 'RHOB', color: '#0891b2', min: 1.95, max: 2.95, style: 'dash' }],
        fills: [
          { mode: 'threshold', a: 'input:GR', threshold: { value: 75 }, side: 'below', color: '#fde047', color2: '#9ca3af', opacity: 0.25 },
          { mode: 'crossover', a: 'input:GR', b: 'log:RHOB', positiveColor: '#facc15', negativeColor: '#9ca3af', opacity: 0.35 },
          { mode: 'ramp', a: 'input:GR', fillTo: 'left', stops: [{ value: 0, color: '#f5e6a8' }, { value: 60, color: '#c8a76a' }, { value: 150, color: '#5c3a1e' }], opacity: 0.85 },
        ],
      },
      { id: 'trk-b', title: 'Lithology', type: 'strip', width: 0.45, source: 'intervals:lithology' },
    ],
  };
  return { ...base, activeTemplateId: tpl.id, templates: [...base.templates, tpl] };
};

const intervalRows = [
  { id: 'i1', well_id: 'w1', kind: 'lithology', top_md_m: 1400, base_md_m: 1500, code: 'shale', label: null, properties: {}, source: 'cuttings' },
  { id: 'i2', well_id: 'w1', kind: 'lithology', top_md_m: 1500, base_md_m: 1660, code: 'sandstone', label: null, properties: { grain_size: 'f_sand' }, source: 'cuttings' },
  { id: 'i3', well_id: 'w1', kind: 'biozone_interval', top_md_m: 1400, base_md_m: 1450, code: 'NN12', label: null, properties: { scheme: 'NN' }, source: 'interpretation' },
];

const coreImages = [
  { id: 'c1', top_md_m: 1500, base_md_m: 1509, caption: 'Box 1', bytes: 2048000, width: 800, height: 3000 },
  { id: 'c2', top_md_m: 1509, base_md_m: 1518, caption: null, bytes: 1024000 },
];
const urlOf = async (img) => { if (img.id === 'c2') throw new Error('no url'); return `https://x/${img.id}.jpg`; };

const noop = () => {};

// Each scene: the element and an optional interaction that opens more UI.
const SCENES = {
  'layout panel, built-in template': { el: () => <LayoutPanel layouts={buildDefaultLayouts()} onLayoutsChange={noop} onStatus={noop} /> },
  'layout panel, curve track open with every fill mode': {
    el: () => <LayoutPanel layouts={customLayouts()} onLayoutsChange={noop} onStatus={noop} logSources={['GR', 'RHOB']} sourceStatus={(s) => (s === 'output:SW' ? 'not run' : null)} />,
    act: (c) => fireEvent.click(c.querySelector('[data-testid="petro-layout-expand-Porosity"]')),
  },
  'layout panel, strip track open': {
    el: () => <LayoutPanel layouts={customLayouts()} onLayoutsChange={noop} onStatus={noop} />,
    act: (c) => fireEvent.click(c.querySelector('[data-testid="petro-layout-expand-Lithology"]')),
  },
  'top name popover with the name error': {
    el: () => <div className="relative"><TopNamePopover x={10} y={20} title="New top" names={['Top A', 'Top B']} onConfirm={noop} onCancel={noop} /></div>,
    act: (c) => fireEvent.click(c.querySelector('[data-testid="petro-top-confirm"]')),
  },
  'depth navigator': { el: () => <DepthNavigator extent={[1000, 2000]} view={[1200, 1400]} onViewChange={noop} theme="light" /> },
  'cross-section': { el: () => <div style={{ height: 400 }}><CrossSection wells={[]} datum={{ mode: 'none' }} shownTops={[]} /></div> },
  'cross-section in pick mode': { el: () => <div style={{ height: 400 }}><CrossSection wells={[]} datum={{ mode: 'none' }} shownTops={[]} pickMode="top" /></div> },
  'core photographs': { el: () => <CoreImagesPanel well={well} images={coreImages} onUpload={noop} onUpdate={noop} onDelete={noop} urlOf={urlOf} onStatus={noop} /> },
  'core photographs, edited row': {
    el: () => <CoreImagesPanel well={well} images={coreImages} onUpload={noop} onUpdate={noop} onDelete={noop} urlOf={urlOf} onStatus={noop} />,
    act: (c) => fireEvent.change(c.querySelectorAll('[data-testid="wdm-core-row-c1"] input')[0], { target: { value: '1501' } }),
  },
  'core photographs, empty and read-only': { el: () => <CoreImagesPanel well={well} images={[]} canEdit={false} onUpload={noop} onUpdate={noop} onDelete={noop} urlOf={urlOf} onStatus={noop} /> },
  'intervals editor, lithology with problems': {
    el: () => <IntervalsEditor well={well} intervals={intervalRows} onReplace={noop} onStatus={noop} />,
    act: (c) => {
      fireEvent.change(c.querySelector('[data-testid="wdm-intervals-base-1"]'), { target: { value: '1450' } });
      fireEvent.change(c.querySelector('[data-testid="wdm-intervals-top-1"]'), { target: { value: '1460' } });
      fireEvent.change(c.querySelector('[data-testid="wdm-intervals-base-0"]'), { target: { value: '1470' } });
      fireEvent.click(c.querySelector('[data-testid="wdm-intervals-save"]'));
    },
  },
  'intervals editor, biozones': {
    el: () => <IntervalsEditor well={well} intervals={intervalRows} onReplace={noop} onStatus={noop} initialKind="biozone_interval" />,
  },
  'intervals editor, paste mode': {
    el: () => <IntervalsEditor well={well} intervals={intervalRows} onReplace={noop} onStatus={noop} />,
    act: (c) => fireEvent.click(c.querySelector('[data-testid="wdm-intervals-paste-toggle"]')),
  },
  'intervals editor, empty kind': { el: () => <IntervalsEditor well={well} intervals={[]} onReplace={noop} onStatus={noop} canEdit={false} initialKind="facies" /> },
};

const renderScene = async (scene, wrap = (x) => x) => {
  let view;
  await act(async () => { view = render(wrap(scene.el())); });
  if (scene.act) await act(async () => { scene.act(view.container); });
  return view.container;
};

// class strings outside the drawing surfaces (data-canvas subtrees)
const chromeHtml = (root) => {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('[data-canvas]').forEach((n) => n.remove());
  return clone.innerHTML;
};

describe.each(['light', 'dark'])('inside a %s scope the wells kit follows the theme', (theme) => {
  const wrap = (x) => <ThemedApp userId="t1" defaultTheme={theme}>{x}</ThemedApp>;

  test.each(Object.keys(SCENES))('%s', async (name) => {
    const c = await renderScene(SCENES[name], wrap);
    expect(c.querySelector('[data-pl-theme]')).toHaveAttribute('data-pl-theme', theme);
    expect(c.innerHTML).toMatch(/-pl-|data-canvas/);
    expect(chromeHtml(c)).not.toMatch(LEGACY_CONSOLE);
  });

  test('the log paper stays white: cross-section and depth navigator are light canvases', async () => {
    const c = await renderScene(SCENES['cross-section'], wrap);
    const paper = c.querySelector('[data-testid="corr-section"] [data-canvas]');
    expect(paper).toHaveAttribute('data-canvas', 'chart');
    expect(paper.className).toMatch(/\bbg-white\b/);
    const nav = await renderScene(SCENES['depth navigator'], wrap);
    expect(nav.querySelector('[data-testid="depth-nav"]')).toHaveAttribute('data-canvas', 'light');
  });
});

test('negative control: the legacy regex catches a planted dark console class', async () => {
  const c = await renderScene(SCENES['core photographs']);
  expect(chromeHtml(c)).not.toMatch(LEGACY_CONSOLE);
  const plant = document.createElement('div');
  plant.className = 'bg-slate-900 text-white';
  c.appendChild(plant);
  expect(chromeHtml(c)).toMatch(LEGACY_CONSOLE);
});
