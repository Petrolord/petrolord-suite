/**
 * QI round 3 deferred items (2026-10-15): job warnings shown under a run,
 * the polarity each held-out coloured run used (F3 benchmark F-10), and the
 * well CRS note (F-2). The worker sides are gated in the worker tests
 * (poststackInversion, prestackInversion) and inversionWells.test.js.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { jobWarnings, warningsField } from '../services/jobWarnings';
import JobWarnings from '../components/JobWarnings';
import WellCrsNote from '../components/WellCrsNote';
import { BlindTable, blindPolarityByWell } from '../components/InversionPanel';
import { blindProtocolText } from '../services/inversionRun';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));

const LOST = '12 of 40,000 live samples of the impedance came out as nulls.';

test('job warnings: the distinct texts, and nothing added to a run without them', () => {
  expect(jobWarnings({ warnings: [LOST, LOST, { message: 'second' }, '', 3] })).toEqual([LOST, 'second']);
  expect(jobWarnings({})).toEqual([]);
  expect(jobWarnings(null)).toEqual([]);
  expect(warningsField({ volume_id: 'x' })).toEqual({});
  expect(warningsField({ warnings: [LOST] })).toEqual({ warnings: [LOST] });
});

test('JobWarnings renders each warning, and nothing for a clean run', () => {
  const { rerender } = render(<JobWarnings result={{ warnings: [LOST] }} testId="w" />);
  expect(screen.getByTestId('w')).toHaveTextContent(`Warning: ${LOST}`);
  rerender(<JobWarnings result={{ status: 'ready' }} testId="w" />);
  expect(screen.queryByTestId('w')).toBeNull();
});

const coloured = (pols) => ({
  settings: { method: 'coloured', output: 'relative AI' },
  blind: pols.map(([name]) => ({ name, blind: { corr: 0.5 }, withWell: { corr: 0.6 } })),
  blind_protocol: { version: 'held-back-v2', excluded_from: ['the low-frequency model', 'the coloured operator (its impedance and seismic spectra)'], notes: [], held_back: pols.map(([name, polarity]) => ({ name, slope: -1.2, polarity })) },
});

test('F-10: the blind table shows the polarity each held-out coloured run used', () => {
  const r = coloured([['F02-01', 1], ['F03-04', -1]]);
  expect([...blindPolarityByWell(r)]).toEqual([['F02-01', 1], ['F03-04', -1]]);
  render(<BlindTable result={r} />);
  expect(screen.getByTestId('qi-inv-blind-polarity-head')).toBeInTheDocument();
  expect(screen.getByTestId('qi-inv-blind-polarity-F02-01')).toHaveTextContent('normal');
  expect(screen.getByTestId('qi-inv-blind-polarity-F03-04')).toHaveTextContent('reversed');
  expect(blindProtocolText(r)).toMatch(/F02-01 normal, F03-04 reversed\. The wells disagree on polarity/);
  // all agree: listed without the warning
  expect(blindProtocolText(coloured([['A', 1], ['B', 1]]))).not.toMatch(/disagree/);
});

test('F-10 negative control: an absolute result and an older coloured result have no polarity column', () => {
  const abs = { settings: { method: 'model_based' }, blind: [{ name: 'A', blind: { corr: 0.9, rmsPct: 3 }, withWell: { corr: 0.95, rmsPct: 2 } }], blind_protocol: { held_back: [{ name: 'A', scale: 0.8 }] } };
  render(<BlindTable result={abs} />);
  expect(screen.queryByTestId('qi-inv-blind-polarity-head')).toBeNull();
  const older = coloured([['A', 1]]); delete older.blind_protocol.held_back[0].polarity;
  expect(blindPolarityByWell(older).size).toBe(0);
  expect(blindProtocolText(older)).not.toMatch(/Polarity/);
});

test('F-2: the well CRS note shows for converted and unverified wells only', () => {
  const { rerender, container } = render(<WellCrsNote well={{ name: 'W', crs: { status: 'converted', note: 'converted note' } }} />);
  expect(screen.getByTestId('qi-well-crs-W')).toHaveTextContent('converted note');
  rerender(<WellCrsNote well={{ name: 'W', crs: { status: 'unverified', note: 'CRS not checked: the well has no CRS (the volume is in EPSG:32631).' } }} />);
  expect(screen.getByTestId('qi-well-crs-W')).toHaveClass('text-pl-warning-text');
  rerender(<WellCrsNote well={{ name: 'W', crs: { status: 'same' } }} />);
  expect(container).toBeEmptyDOMElement();
});
