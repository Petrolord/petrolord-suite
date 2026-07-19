/**
 * FS5 render smoke tests — compositional cards and input wiring mount in
 * jsdom against the real engine (no physics mocks; the worker factory is
 * jest-mapped so the envelope traces synchronously).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CompositionalResultsCard from '../CompositionalResultsCard';
import PhaseEnvelopeCard from '../PhaseEnvelopeCard';
import CompositionInput from '../CompositionInput';
import { runEosFlash, emptyComposition } from '@/utils/fluidstudio/eosAnalysis';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 300 });
});

const sampleComposition = () => ({
  ...emptyComposition(),
  zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
  plus: { mw: 190, sg: 0.84, tbF: null },
  pressure: 2500,
  temp: 200,
});

describe('CompositionalResultsCard', () => {
  it('renders a two-phase flash with K values and tier badges', () => {
    const eos = runEosFlash(sampleComposition());
    render(<CompositionalResultsCard eos={eos} />);
    expect(screen.getByText(/Compositional flash at 2500 psia/)).toBeInTheDocument();
    expect(screen.getByText(/Two phases/)).toBeInTheDocument();
    expect(screen.getByText('Oracle gated')).toBeInTheDocument();
    expect(screen.getByText('Screening estimate')).toBeInTheDocument();
    expect(screen.getByText('K value')).toBeInTheDocument();
    expect(screen.getByText(/C7\+ characterization/)).toBeInTheDocument();
  });

  it('renders parse errors when the composition is incomplete', () => {
    const eos = runEosFlash(emptyComposition());
    render(<CompositionalResultsCard eos={eos} />);
    expect(screen.getByText(/at least two components/)).toBeInTheDocument();
  });
});

describe('PhaseEnvelopeCard', () => {
  it('traces on click via the sync fallback and reports the saturation pressure', async () => {
    const comp = {
      ...emptyComposition(),
      zPct: { ...emptyComposition().zPct, C1: 35, nC4: 65 },
      pressure: 1000,
      temp: 100,
      envelope: { tMinF: 60, tMaxF: 200, nT: 3 },
    };
    render(<PhaseEnvelopeCard composition={comp} />);
    fireEvent.click(screen.getByRole('button', { name: /Trace envelope/ }));
    await waitFor(
      () => expect(screen.getByText(/Saturation pressure at 100 °F/)).toBeInTheDocument(),
      { timeout: 20000 },
    );
    expect(screen.getByText(/psia/)).toBeInTheDocument();
  }, 30000);

  it('disables tracing until the composition is valid', () => {
    render(<PhaseEnvelopeCard composition={emptyComposition()} />);
    expect(screen.getByRole('button', { name: /Trace envelope/ })).toBeDisabled();
    expect(screen.getByText(/Complete the composition/)).toBeInTheDocument();
  });
});

describe('CompositionInput', () => {
  it('shows the component grid, running total and normalize control', () => {
    const onChange = jest.fn();
    render(<CompositionInput composition={sampleComposition()} onChange={onChange} />);
    expect(screen.getByText('Total 100.00 mol%')).toBeInTheDocument();
    expect(screen.getByLabelText('C1')).toHaveValue(40);
    fireEvent.change(screen.getByLabelText('C1'), { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      zPct: expect.objectContaining({ C1: 45 }),
    }));
  });

  it('normalizes an off-100 composition', () => {
    const comp = sampleComposition();
    comp.zPct = { ...comp.zPct, C1: 50 }; // 110 total
    const onChange = jest.fn();
    render(<CompositionInput composition={comp} onChange={onChange} />);
    expect(screen.getByText('Total 110.00 mol%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Normalize/ }));
    const patched = onChange.mock.calls[0][0];
    const total = Object.values(patched.zPct).reduce((a, b) => a + (Number(b) || 0), 0);
    expect(total).toBeCloseTo(100, 2);
  });

  it('shows the C7+ description only when C7+ is present', () => {
    const none = { ...sampleComposition(), zPct: { ...sampleComposition().zPct, 'C7+': 0 } };
    const { rerender } = render(<CompositionInput composition={none} onChange={() => {}} />);
    expect(screen.queryByText(/C7\+ description/)).not.toBeInTheDocument();
    rerender(<CompositionInput composition={sampleComposition()} onChange={() => {}} />);
    expect(screen.getByText(/C7\+ description/)).toBeInTheDocument();
  });
});
