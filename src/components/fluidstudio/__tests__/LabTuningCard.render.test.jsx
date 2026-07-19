/**
 * ET3 render tests - the Lab tuning card mounts against the real engine
 * (no physics mocks; the worker factory is jest-mapped so the regression
 * runs synchronously in jsdom).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LabTuningCard from '../LabTuningCard';
import { emptyComposition } from '@/utils/fluidstudio/eosAnalysis';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}
  };
});

const sampleComposition = (tuning = undefined) => ({
  ...emptyComposition(),
  zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
  plus: { mw: 190, sg: 0.84, tbF: null },
  pressure: 2500,
  temp: 200,
  ...(tuning !== undefined ? { tuning } : {}),
});

const stages = [{ temperature: '75', pressure: '114.65' }];

describe('LabTuningCard', () => {
  it('renders the lab fields and a screening badge while untuned', () => {
    render(<LabTuningCard composition={sampleComposition()} stages={stages} onUpdateTuning={() => {}} />);
    expect(screen.getByText(/Lab tuning/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Measured Psat/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Total GOR/i)).toBeInTheDocument();
    expect(screen.getByText(/Screening estimate/i)).toBeInTheDocument();
  });

  it('surfaces the request problems instead of running with no measurements', () => {
    render(<LabTuningCard composition={sampleComposition()} stages={stages} onUpdateTuning={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Tune to lab data/i }));
    expect(screen.getByText(/at least one measured lab value/i)).toBeInTheDocument();
  });

  it('typing a lab value reports it through onUpdateTuning', () => {
    const onUpdateTuning = jest.fn();
    render(<LabTuningCard composition={sampleComposition()} stages={stages} onUpdateTuning={onUpdateTuning} />);
    fireEvent.change(screen.getByLabelText(/Measured Psat/i), { target: { value: '2500' } });
    expect(onUpdateTuning).toHaveBeenCalledWith({ lab: expect.objectContaining({ psatPsia: '2500' }) });
  });

  it('runs a psat tune end to end and applies the knobs', async () => {
    const onUpdateTuning = jest.fn();
    const composition = sampleComposition({
      lab: { psatPsia: '2600', psatTF: null, totalGor: null, stoApi: null, bo: null },
      applied: null,
    });
    render(<LabTuningCard composition={composition} stages={stages} onUpdateTuning={onUpdateTuning} />);
    fireEvent.click(screen.getByRole('button', { name: /Tune to lab data/i }));
    await waitFor(
      () => expect(onUpdateTuning).toHaveBeenCalledWith({ applied: expect.objectContaining({ kC1: expect.any(Number) }) }),
      { timeout: 20000 },
    );
    // the before/after table appears with the psat row
    expect(screen.getByText(/Saturation pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/Error after tune/i)).toBeInTheDocument();
  }, 30000);

  it('shows the lab_tuned badge and applied knob summary when tuning is applied', () => {
    const composition = sampleComposition({
      lab: { psatPsia: '2600', psatTF: null, totalGor: null, stoApi: null, bo: null },
      applied: { fTc: 1.01, fPc: 0.98, kC1: 0.05, sPlus: 0.1 },
    });
    render(<LabTuningCard composition={composition} stages={stages} onUpdateTuning={() => {}} />);
    expect(screen.getByText(/Lab tuned/i)).toBeInTheDocument();
    expect(screen.getByText(/Applied knobs/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset to untuned/i })).toBeInTheDocument();
  });
});
