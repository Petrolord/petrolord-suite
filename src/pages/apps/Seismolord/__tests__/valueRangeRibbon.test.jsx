/**
 * Value range in the Home ribbon (Geoscience video Part B): the option,
 * the slice's low and high as placeholders, typed values, and trace
 * balance and AGC switched off while it is chosen.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { storage: { from: () => ({}) }, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/localWorkspace/runtime', () => ({ useVolumePlacement: () => null, PLACEMENT: { HERE: 'here' } }));

/* eslint-disable import/first */
import HomeTab from '../components/workspace/ribbonTabs/HomeTab';
/* eslint-enable import/first */

const noop = () => {};
const GEO = { il: { min: 1, max: 4, step: 1, count: 4 }, xl: { min: 1, max: 5, step: 1, count: 5 }, ns: 8, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]] };
const MANIFEST = { geometry: GEO };
const HOME = {
  orientation: 'inline', setOrientation: noop, lineLabel: 'Inline 1', sliceIndex: 0, maxIndex: 3, changeIndex: noop,
  colormap: 'spectrum', setColormap: noop, gain: 1, setGain: noop, clipRms: 3, setClipRms: noop, polarity: 1, setPolarity: noop,
  traceBalance: true, setTraceBalance: noop, scaleMode: 'range', setScaleMode: noop, clipPct: 98, setClipPct: noop,
  manualClip: 0, setManualClip: noop, agcOn: true, setAgcOn: noop, agcWindowMs: 120, setAgcWindowMs: noop,
  wiggleMode: 'off', setWiggleMode: noop, reverseCmap: false, setReverseCmap: noop, overlayCandidates: [],
  overlayVolumeId: null, selectOverlayVolume: noop, overlayColormap: 'viridis', setOverlayColormap: noop,
  overlayOpacity: 0.5, setOverlayOpacity: noop, overlayBlend: 'mix', setOverlayBlend: noop, onUndo: noop, onRedo: noop,
  canUndo: false, canRedo: false, onOpenSessions: noop, sectionDomain: 'twt', setSectionDomain: noop, depthReady: false,
  volumes: [], volume: { id: 'v', name: 'X AI, Model-based' }, manifest: MANIFEST,
};

test('Value range is offered and shows the slice range as placeholders', () => {
  render(<HomeTab {...HOME} sliceRange={{ low: 4532.17, high: 6081.9 }} />);
  expect(screen.getByRole('option', { name: 'Value range' })).toBeInTheDocument();
  expect(screen.getByTestId('sl-range-low')).toHaveAttribute('placeholder', '4532');
  expect(screen.getByTestId('sl-range-high')).toHaveAttribute('placeholder', '6082');
  expect(screen.getByText('P2 to P98 of current slice')).toBeInTheDocument();
});

test('typed low and high go to the panel; empty clears back to the slice', () => {
  const setRangeLow = jest.fn(); const setRangeHigh = jest.fn();
  render(<HomeTab {...HOME} rangeHigh={6000} setRangeLow={setRangeLow} setRangeHigh={setRangeHigh} />);
  fireEvent.change(screen.getByTestId('sl-range-low'), { target: { value: '4600' } });
  fireEvent.change(screen.getByTestId('sl-range-high'), { target: { value: '' } });
  expect(setRangeLow).toHaveBeenCalledWith(4600);
  expect(setRangeHigh).toHaveBeenCalledWith(null);
});

test('trace balance and AGC are off and disabled in Value range', () => {
  render(<HomeTab {...HOME} />);
  const tb = screen.getByRole('button', { name: 'Trace balance' });
  const agc = screen.getByRole('button', { name: 'AGC' });
  expect(tb).toBeDisabled();
  expect(agc).toBeDisabled();
});

test('other modes show no range fields', () => {
  render(<HomeTab {...HOME} scaleMode="rms" />);
  expect(screen.queryByTestId('sl-range-low')).toBeNull();
});
