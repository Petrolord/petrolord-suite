/**
 * Compact ribbon (owner review of the Seismolord demo videos, 2026-10-11):
 * the ribbon took almost half the window and squeezed the Section, Map and
 * 3D views. Every group now lays its controls out in a fixed three-row
 * grid of 18 px controls with small 16 px icons beside their labels, so
 * the ribbon has one compact height on every tab. A tab wider than the
 * window scrolls sideways behind overflow chevrons; nothing is hidden.
 *
 * The pixel measurement (95 px at 1920x1080, from 181 px) is in the PR;
 * these tests pin the structure that produces it.
 */
import React from 'react';
import {
  render, screen, fireEvent, within, act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import Ribbon from '@/pages/apps/Seismolord/components/workspace/Ribbon';
import HomeTab from '@/pages/apps/Seismolord/components/workspace/ribbonTabs/HomeTab';
import InterpretationTab from '@/pages/apps/Seismolord/components/workspace/ribbonTabs/InterpretationTab';
import WellsTab from '@/pages/apps/Seismolord/components/workspace/ribbonTabs/WellsTab';
import ExportTab from '@/pages/apps/Seismolord/components/workspace/ribbonTabs/ExportTab';
import AiTab from '@/pages/apps/Seismolord/components/workspace/ribbonTabs/AiTab';

const noop = () => {};
const MANIFEST = { geometry: { il: { min: 1000, step: 1 }, xl: { min: 2000, step: 1 }, dt_us: 4000 } };

const homeProps = {
  volumes: [{ id: 'v1', name: 'Volve' }],
  volume: { id: 'v1', name: 'Volve' },
  selectVolume: noop,
  manifest: MANIFEST,
  orientation: 'inline',
  setOrientation: noop,
  lineLabel: 'Inline 1000',
  sliceIndex: 0,
  maxIndex: 100,
  changeIndex: noop,
  colormap: 'rwb',
  setColormap: noop,
  gain: 1,
  setGain: noop,
  clipRms: 3,
  setClipRms: noop,
  polarity: 1,
  setPolarity: noop,
  traceBalance: false,
  setTraceBalance: noop,
  scaleMode: 'rms',
  setScaleMode: noop,
  clipPct: 99,
  setClipPct: noop,
  manualClip: 0,
  setManualClip: noop,
  agcOn: false,
  setAgcOn: noop,
  agcWindowMs: 120,
  setAgcWindowMs: noop,
  wiggleMode: 'off',
  setWiggleMode: noop,
  reverseCmap: false,
  setReverseCmap: noop,
  overlayCandidates: [{ id: 'v2', name: 'Variance' }],
  overlayVolumeId: 'v2',
  selectOverlayVolume: noop,
  overlayColormap: 'rwb',
  setOverlayColormap: noop,
  overlayOpacity: 0.5,
  setOverlayOpacity: noop,
  overlayBlend: 'mix',
  setOverlayBlend: noop,
  spectralRgb: {
    candidates: [{ id: 's1', name: 'Volve [Spectral decomposition 12 Hz 120 ms]' }, { id: 's2', name: 'Volve [Spectral decomposition 25 Hz 120 ms]' }, { id: 's3', name: 'Volve [Spectral decomposition 40 Hz 120 ms]' }],
    ids: ['s1', 's2', null],
    setChannel: noop,
    autoPick: noop,
    clear: noop,
    active: false,
  },
  onUndo: noop,
  onRedo: noop,
  canUndo: true,
  canRedo: false,
  onOpenSessions: noop,
  sectionDomain: 'twt',
  setSectionDomain: noop,
  depthReady: true,
  setDepthUnit: noop,
  flattenHorizonId: null,
  setFlattenHorizonId: noop,
  flattenChoices: [{ id: 'h1', name: 'Top Hugin' }],
  unitNote: <span data-testid="unit-note">Units: built-in default</span>,
  player: {
    state: { step: 1, speed: 2, playing: false, setStep: noop, setSpeed: noop, toggle: noop },
    currentValue: 1000,
    onStep: noop,
    onGoTo: () => true,
  },
};

// Interpretation with every optional control showing: an edit session,
// fault picking and terminations.
const interpretationProps = {
  manifest: MANIFEST,
  orientation: 'inline',
  slice: {},
  pickMode: 'fault',
  setPickMode: noop,
  seedPick: { ilIdx: 1, xlIdx: 2, sample: 10 },
  snapMode: 'ncc',
  setSnapMode: noop,
  snapWindow: 3,
  setSnapWindow: noop,
  corrThreshold: 0.7,
  setCorrThreshold: noop,
  stopAtFaults: false,
  setStopAtFaults: noop,
  hasFaults: true,
  tracking: null,
  trackHorizon: noop,
  growHorizon: noop,
  cancelTracking: noop,
  track2D: noop,
  editTarget: 'new',
  changeEditTarget: noop,
  horizons: [{ id: 'h1', name: 'Top Hugin' }],
  toggleEditTool: noop,
  eraseSize: 1,
  setEraseSize: noop,
  edit: { active: true, undo: 2, redo: 1 },
  editBusy: false,
  undoEdit: noop,
  redoEdit: noop,
  saveEdits: noop,
  discardEdits: noop,
  smoothEdits: noop,
  smoothMethod: 'mean',
  setSmoothMethod: noop,
  smoothRadius: 1,
  setSmoothRadius: noop,
  fillHoles: noop,
  draftSticks: [[{}, {}]],
  endStick: noop,
  saveDraftFault: noop,
  discardDraft: noop,
  openVelocity: noop,
  velocityModel: null,
  openAttribute: noop,
  openMakeSurface: noop,
  openTopsToHorizons: noop,
  openDetectFaults: noop,
  terminations: [{}],
  setTerminationKind: noop,
  clearTerminations: noop,
  toggleToolbox: noop,
};

const TABS = [
  { key: 'home', label: 'Home', content: <HomeTab {...homeProps} /> },
  { key: 'interpretation', label: 'Interpretation', content: <InterpretationTab {...interpretationProps} /> },
  {
    key: 'wells',
    label: 'Wells',
    content: (
      <WellsTab
        openWellImport={noop} setAllWellsVisible={noop} wellsCount={2}
        openCalibrate={noop} velocityForDisplay={null} visibleWells={[]} horizons={[]}
        openSynthetics={noop} hasVolume projectionM={null} setProjectionM={noop}
      />
    ),
  },
  { key: 'export', label: 'Export', content: <ExportTab volume={{ id: 'v1' }} openExport={noop} openSurfaceImport={noop} openPlot={noop} /> },
  { key: 'ai', label: 'AI', content: <AiTab copilotOpen={false} toggleCopilot={noop} /> },
];

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

const body = () => screen.getByTestId('sl-ribbon-body');

describe('compact Seismolord ribbon', () => {
  test.each(TABS.map((t) => t.key))('%s tab: every group is a three-row grid of compact controls', (key) => {
    render(<Ribbon tabs={TABS} />);
    fireEvent.click(screen.getByTestId(`sl-ribbon-tab-${key}`));
    expect(screen.getByTestId('sl-ribbon')).toHaveAttribute('data-ribbon-density', 'compact');

    const groups = body().querySelectorAll('[data-ribbon-group]');
    expect(groups.length).toBeGreaterThan(0);
    groups.forEach((g) => {
      const grid = g.firstElementChild;
      expect(grid).toHaveAttribute('data-ribbon-rows', '3');
      expect(grid.className).toMatch(/\bgrid\b/);
      expect(grid.className).toContain('grid-flow-col');
      expect(grid.className).toContain('grid-rows-[repeat(3,20px)]');
      // the caption stays as a slim visible line (e2e and storyboards read it)
      expect(g.lastElementChild).toHaveTextContent(g.dataset.ribbonGroup);
      expect(g.lastElementChild.className).toContain('text-[9px]');
    });

    // no old large icon-over-label buttons, no tall selects or inputs
    const buttons = body().querySelectorAll('[data-ribbon-control="button"]');
    buttons.forEach((b) => {
      expect(b.className).not.toMatch(/flex-col|min-w-\[52px\]/);
      expect(b.className).toContain('h-[18px]');
      const icon = b.querySelector('svg');
      if (icon) {
        expect(icon.getAttribute('class')).toMatch(/\bw-4\b/);
        expect(icon.getAttribute('class')).not.toContain('w-[18px]');
      }
    });
    body().querySelectorAll('select, input[type="number"], input[type="text"]').forEach((f) => {
      expect(f.className).toContain('h-[18px]');
      expect(f.className).not.toMatch(/\bpy-1\b/);
    });
    // labels sit beside their fields, never stacked above them
    body().querySelectorAll('label').forEach((l) => {
      expect(l.className).not.toContain('flex-col');
    });
  });

  test('labels still name their controls, so the storyboards resolve', () => {
    render(<Ribbon tabs={TABS} />);
    expect(screen.getByRole('combobox', { name: /Active volume/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Colormap/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Orientation/ })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /Gain/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SEG normal' })).toBeInTheDocument();
    expect(screen.getByTestId('sl-player')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sl-ribbon-tab-interpretation'));
    expect(screen.getByRole('button', { name: 'Pick seed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Velocity model/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Event/ })).toBeInTheDocument();
    expect(screen.getByText('Seed & track')).toBeInTheDocument();
    expect(screen.getByText('Terminations')).toBeInTheDocument();
  });

  test('a tab wider than the window shows overflow chevrons that scroll it', () => {
    render(<Ribbon tabs={TABS} />);
    expect(screen.queryByTestId('sl-ribbon-more-right')).toBeNull();
    const el = body();
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 1800 });
    el.scrollBy = jest.fn();
    act(() => { fireEvent.scroll(el); });
    const more = screen.getByTestId('sl-ribbon-more-right');
    expect(more).toHaveAttribute('aria-label', 'Scroll the ribbon right');
    fireEvent.click(more);
    expect(el.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
    expect(el.scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);

    Object.defineProperty(el, 'scrollLeft', { configurable: true, value: 1000 });
    act(() => { fireEvent.scroll(el); });
    expect(screen.getByTestId('sl-ribbon-more-left')).toBeInTheDocument();
    expect(screen.queryByTestId('sl-ribbon-more-right')).toBeNull();
    expect(within(screen.getByTestId('sl-ribbon')).getByRole('button', { name: 'Scroll the ribbon left' })).toBeInTheDocument();
  });
});
