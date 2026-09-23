/**
 * The attribute catalogue as the Suite shows it: dialog groups, suggested
 * colormaps, parameter entry, derived names, and the new engine attributes
 * (edge, dip, azimuth, chaos, curvature, spectral, rai) computed through
 * the same job builders the volume worker uses.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { storage: { from: () => ({}) } } }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: () => {} }) }));

/* eslint-disable import/first */
import { ALL_ATTRIBUTE_DEFS, defaultDerivedName } from '../services/attributeJobService';
import { ATTRIBUTE_GROUPS, groupAttributeDefs, suggestedColormap } from '../lib/attributeDisplay';
import { SEISMIC_COLORMAPS } from '../viewer/SliceRenderer';
import ComputeAttributeDialog, { paramValue } from '../components/workspace/dialogs/ComputeAttributeDialog';
import { makeDiscontinuityJob } from '../engine/discontinuityJobs';
import { makeTraceCompute } from '../engine/attributes';
/* eslint-enable import/first */

const NEW_KEYS = ['edge', 'dip', 'azimuth', 'chaos', 'curvature_pos', 'curvature_neg', 'spectral', 'rai'];

describe('dialog groups', () => {
  test('every registry attribute sits in a named group (nothing falls into Other), each once', () => {
    const groups = groupAttributeDefs(ALL_ATTRIBUTE_DEFS);
    expect(groups.map((g) => g.label)).not.toContain('Other');
    const keys = groups.flatMap((g) => g.defs.map((d) => d.key));
    expect(keys.sort()).toEqual(Object.keys(ALL_ATTRIBUTE_DEFS).sort());
    for (const k of NEW_KEYS) expect(keys).toContain(k);
  });

  test('a new registry key still shows, under Other', () => {
    const groups = groupAttributeDefs({ ...ALL_ATTRIBUTE_DEFS, brand_new: { key: 'brand_new', label: 'Brand new' } });
    expect(groups[groups.length - 1]).toEqual({ label: 'Other', defs: [{ key: 'brand_new', label: 'Brand new' }] });
  });

  test('the dialog lists the groups and the new attributes, and a 0 window is kept', () => {
    render(<ComputeAttributeDialog open onOpenChange={() => {}} volume={{ id: 'v', name: 'F3' }} manifest={null} />);
    for (const g of ATTRIBUTE_GROUPS) expect(document.querySelector(`optgroup[label="${g.label}"]`)).not.toBeNull();
    const select = screen.getByDisplayValue('Envelope (reflection strength)');
    fireEvent.change(select, { target: { value: 'edge' } });
    const win = screen.getByText('Vertical window (ms)').parentElement.querySelector('input');
    fireEvent.change(win, { target: { value: '0' } });
    expect(win.value).toBe('0');
    expect(screen.getByPlaceholderText('F3 [Edge]')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'spectral' } });
    expect(screen.getByPlaceholderText('F3 [Spectral decomposition 30 Hz 40 ms]')).toBeInTheDocument();
  });
});

describe('parameters and names', () => {
  test('paramValue keeps 0, falls back on blank or junk', () => {
    const p = { default: 12 };
    expect(paramValue('0', p)).toBe(0);
    expect(paramValue('', p)).toBe(12);
    expect(paramValue('abc', p)).toBe(12);
    expect(paramValue('30', p)).toBe(30);
  });

  test('derived names carry the frequency and window; inherited names do not crash', () => {
    expect(defaultDerivedName('F3', 'spectral', { freqHz: 25, windowMs: 40 })).toBe('F3 [Spectral decomposition 25 Hz 40 ms]');
    expect(defaultDerivedName('F3', 'azimuth', { windowMs: 24, radius: 1 })).toBe('F3 [Dip azimuth 24 ms]');
    expect(defaultDerivedName('F3', 'constructor', {})).toBe('F3 [constructor]');
  });
});

describe('suggested colormaps', () => {
  test('each suggestion is a colormap Seismolord offers; angles cyclic, curvature diverging, discontinuity white to black', () => {
    const offered = new Set(SEISMIC_COLORMAPS.map((c) => c.key));
    for (const k of Object.keys(ALL_ATTRIBUTE_DEFS)) {
      const cm = suggestedColormap(k);
      if (cm) expect(offered.has(cm)).toBe(true);
    }
    expect(suggestedColormap('azimuth')).toBe('hsv_cycle');
    expect(suggestedColormap('inst_phase')).toBe('hsv_cycle');
    expect(suggestedColormap('curvature_pos')).toBe('cool_warm');
    expect(suggestedColormap('curvature_neg')).toBe('cool_warm');
    for (const k of ['variance', 'fault_likelihood', 'edge', 'chaos']) expect(suggestedColormap(k)).toBe('gray_wb');
  });

  test('seismic-like attributes and unknown or inherited names keep the current colormap', () => {
    for (const k of ['agc', 'rai', null, undefined, 'constructor', '__proto__', 'toString']) {
      expect(suggestedColormap(k)).toBeNull();
    }
  });
});

describe('the new attributes through the worker\'s job builders', () => {
  // a small dipping layered cube: time dip 1 sample per inline step
  const geom = { nIl: 12, nXl: 10, ns: 60 };
  const dtUs = 4000;
  const trace = (il) => {
    const tr = new Float32Array(geom.ns);
    for (let s = 0; s < geom.ns; s++) tr[s] = Math.cos((2 * Math.PI * (s - il)) / 12);
    return tr;
  };
  const getTrace = (il, xl) => (il < 0 || il >= geom.nIl || xl < 0 || xl >= geom.nXl ? null : trace(il, xl));

  test.each(['edge', 'dip', 'azimuth', 'chaos', 'curvature_pos', 'curvature_neg'])(
    '%s builds a column job the neighbourhood runner accepts and gives finite values',
    async (name) => {
      const job = makeDiscontinuityJob(name, {}, { dtUs, ...geom });
      expect(job.radius).toBeGreaterThanOrEqual(1);
      expect(job.radius).toBeLessThan(8);
      const col = await job.computeColumn({
        getTrace, il0: 4, il1: 6, xl0: 3, xl1: 5, shouldCancel: () => false,
      });
      expect(col).toHaveLength(3 * 3 * geom.ns);
      const mid = col.slice(4 * geom.ns + 10, 4 * geom.ns + 50);
      if (name !== 'azimuth') expect(mid.every(Number.isFinite)).toBe(true);
      if (name === 'dip') expect(Math.abs(mid[20] - 4)).toBeLessThan(0.1);        // 1 sample/trace x 4 ms
      if (name === 'azimuth') expect(Math.abs(mid[20])).toBeLessThan(1);          // down-dip along +inline
      if (name === 'chaos') expect(mid[20]).toBeLessThan(0.1);                    // planar
      if (name.startsWith('curvature')) expect(Math.abs(mid[20])).toBeLessThan(0.05); // plane: no bend
    },
  );

  test.each(['spectral', 'rai'])('%s runs per trace with its defaults', (name) => {
    const compute = makeTraceCompute(name, {}, { dtUs });
    const out = new Float32Array(geom.ns);
    compute(trace(0, 0), out);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});
