// Start here (discoverability programme): the model says what the upload
// made, what exists, and which next steps are open, done or blocked (with
// the reason); the panel draws it and calls the step's action; the tour
// helpers place the card and remember that the tour was seen.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { buildStartHere } from '../lib/startHere';
import {
  TOUR_STEPS, placeCard, tourSeen, markTourSeen,
} from '../lib/firstRunTour';
import StartHerePanel from '../components/workspace/StartHerePanel';

const vol = { id: 'v1', name: 'F3 block', status: 'ready' };
const manifest = { brick: { dtype: 'float32le' } };
const stepOf = (m, key) => m.steps.find((s) => s.key === key);

describe('buildStartHere', () => {
  test('no volume: import is open, open is blocked until a volume converts', () => {
    const m = buildStartHere({ allVolumes: [{ id: 'x', status: 'ingesting' }] });
    expect(stepOf(m, 'import').status).toBe('todo');
    expect(stepOf(m, 'open').status).toBe('blocked');
    expect(buildStartHere({ allVolumes: [{ id: 'x', status: 'ready' }] }).steps[1].status).toBe('todo');
  });

  test('a fresh full-precision volume: the upload made only the volume, every step is open', () => {
    const m = buildStartHere({
      volume: vol, manifest, wells: [{ id: 'w', tops: [{ name: 'A' }] }], registryWellCount: 1,
    });
    expect(m.made[0]).toMatch(/full precision/);
    expect(m.made[1]).toMatch(/when you ask for it/);
    expect(stepOf(m, 'variance').status).toBe('todo');
    expect(stepOf(m, 'faults').status).toBe('todo');
    expect(stepOf(m, 'wells').status).toBe('done');
    expect(stepOf(m, 'framework').status).toBe('todo');
    expect(stepOf(m, 'surface').status).toBe('blocked');
    expect(stepOf(m, 'surface').why).toMatch(/horizon first/);
  });

  test('work already done is recognised: variance child, auto faults, horizons from tops, surfaces, velocity', () => {
    const m = buildStartHere({
      volume: vol,
      manifest,
      allVolumes: [
        vol,
        { id: 'a', name: 'F3 block [Variance 40 ms]', kind: 'attribute', parent_volume_id: 'v1', attribute_params: { name: 'variance' } },
        { id: 'b', name: 'other [Envelope]', kind: 'attribute', parent_volume_id: 'zz', attribute_params: { name: 'envelope' } },
      ],
      horizons: [{ id: 'h1', params: { source: 'well_tops' } }, { id: 'h2' }],
      faults: [{ id: 'f1', params: { source: 'auto' } }],
      wells: [{ id: 'w', tops: [{ name: 'A' }] }],
      surfaces: [{ id: 's' }],
      velocityModel: { kind: 'constant' },
    });
    for (const k of ['variance', 'faults', 'wells', 'framework', 'velocity', 'surface']) {
      expect(stepOf(m, k).status).toBe('done');
    }
    const inv = Object.fromEntries(m.inventory.map((r) => [r.key, r.value]));
    expect(inv.attributes).toBe('1: F3 block [Variance 40 ms]');
    expect(inv.horizons).toBe('2 (1 from well tops)');
    expect(inv.faults).toBe('1 (1 picked automatically)');
    expect(inv.velocity).toBe('set');
  });

  test('blocked steps say why: display copy, 16-bit, local file, no wells', () => {
    const disp = buildStartHere({ volume: { ...vol, status: 'display_ready' }, manifest });
    expect(disp.made[0]).toMatch(/display copy/);
    expect(stepOf(disp, 'variance').why).toMatch(/full-precision copy/);
    expect(stepOf(disp, 'faults').status).toBe('todo');

    const i16 = buildStartHere({ volume: vol, manifest: { brick: { dtype: 'int16le-scaled' } } });
    expect(stepOf(i16, 'variance').why).toMatch(/16-bit/);

    const local = buildStartHere({ volume: { ...vol, local: true }, manifest });
    expect(local.made[0]).toMatch(/straight from your computer/);
    expect(stepOf(local, 'faults').status).toBe('blocked');
    expect(stepOf(local, 'framework').why).toMatch(/Start the import/);

    const noWells = buildStartHere({ volume: vol, manifest, registryWellCount: 0 });
    expect(stepOf(noWells, 'wells').status).toBe('blocked');
    expect(stepOf(noWells, 'framework').why).toMatch(/wells that carry tops/);
  });

  test('copy carries no em dashes', () => {
    const m = buildStartHere({ volume: { ...vol, local: true }, manifest, registryWellCount: 0 });
    const text = JSON.stringify([m, buildStartHere({}), TOUR_STEPS]);
    expect(text.includes('—')).toBe(false);
  });
});

describe('StartHerePanel', () => {
  test('draws the model and runs a step action; blocked steps have no button', () => {
    const variance = jest.fn();
    const onTour = jest.fn();
    const model = buildStartHere({ volume: vol, manifest, registryWellCount: 0 });
    render(
      <MemoryRouter>
        <StartHerePanel model={model} actions={{ variance, showWells: jest.fn() }} volumeName="F3 block" onTour={onTour} helpHref="/help" />
      </MemoryRouter>,
    );
    expect(screen.getByText('F3 block')).toBeInTheDocument();
    expect(screen.getByTestId('sl-start-step-variance')).toHaveAttribute('data-status', 'todo');
    fireEvent.click(screen.getByTestId('sl-start-go-variance'));
    expect(variance).toHaveBeenCalled();
    expect(screen.queryByTestId('sl-start-go-wells')).toBeNull();
    fireEvent.click(screen.getByTestId('sl-start-tour'));
    expect(onTour).toHaveBeenCalled();
    expect(screen.getByText('Help guide').closest('a')).toHaveAttribute('href', '/help');
  });
});

describe('first-run tour helpers', () => {
  test('every step has an anchor, a title and a body', () => {
    expect(TOUR_STEPS.map((s) => s.anchor)).toEqual(
      ['explorer', 'ribbon-tab-home', 'ribbon-tab-interpretation', 'start-here', 'toolbox', 'help'],
    );
    for (const s of TOUR_STEPS) expect(s.title && s.body).toBeTruthy();
  });

  test('the card goes below the target, beside a tall panel, above it near the bottom, centred without one', () => {
    const vp = { w: 1200, h: 800 };
    expect(placeCard({ left: 100, top: 50, width: 80, height: 20 }, vp)).toEqual({ left: 100, top: 80 });
    expect(placeCard({ left: 100, top: 700, width: 80, height: 20 }, vp).top).toBe(700 - 200 - 10);
    // the explorer: tall, no room below: to its right, level with its top
    expect(placeCard({ left: 0, top: 224, width: 258, height: 560 }, vp)).toEqual({ left: 268, top: 224 });
    expect(placeCard(null, vp)).toEqual({ left: 440, top: 300 });
    expect(placeCard({ left: 1150, top: 50, width: 40, height: 20 }, vp).left).toBe(1200 - 320 - 8);
  });

  test('seen flag round-trips and survives a throwing storage', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    expect(tourSeen(storage)).toBe(false);
    markTourSeen(storage);
    expect(tourSeen(storage)).toBe(true);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(tourSeen(broken)).toBe(false);
    expect(() => markTourSeen(broken)).not.toThrow();
  });
});
