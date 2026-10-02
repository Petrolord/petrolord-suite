/**
 * H10 (Reservoir honesty sweep). The gap survey read this from code only:
 * "the Lab tuned badge reads `tuning` and nothing clears it when the
 * composition is edited". This file reproduces it on the real components
 * with the real engine: tune the fluid to a measured saturation pressure,
 * then edit the feed on the Composition tab.
 *
 * Before the fix the badge kept saying "Lab tuned" although the tuned C7+
 * properties were now applied to a fluid they were never fitted to, and the
 * fluid no longer reproduced the lab value. Now the badge says the tune was
 * made on earlier inputs, the card says what to do, and tuning again brings
 * "Lab tuned" back.
 */
import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LabTuningCard from '../LabTuningCard';
import CompositionInput from '../CompositionInput';
import CompositionalSeparatorCard from '../CompositionalSeparatorCard';
import { emptyComposition, tuningStatus, labTuneRequest, runEosSeparator } from '@/utils/fluidstudio/eosAnalysis';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const start = () => ({
  ...emptyComposition(),
  zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
  plus: { mw: 190, sg: 0.84, tbF: null },
  pressure: 2500,
  temp: 200,
  tuning: { lab: { psatPsia: '2600', psatTF: null, totalGor: null, stoApi: null, bo: null }, applied: null },
});
const stages = [{ temperature: '75', pressure: '114.65', enabled: true }];

// The page's own wiring (FluidSystemsStudio.jsx): the Composition tab
// replaces the composition, the tuning card merges into composition.tuning.
const Harness = () => {
  const [composition, setComposition] = useState(start);
  const updateTuning = (next) => setComposition((prev) => ({ ...prev, tuning: { ...(prev.tuning ?? {}), ...next } }));
  return (
    <div>
      <div data-testid="input"><CompositionInput composition={composition} onChange={setComposition} /></div>
      <div data-testid="tuning"><LabTuningCard composition={composition} stages={stages} onUpdateTuning={updateTuning} /></div>
      <div data-testid="separator">
        <CompositionalSeparatorCard separator={runEosSeparator(composition, stages).separator} tuned={tuningStatus(composition, stages)} />
      </div>
      <span data-testid="status">{tuningStatus(composition, stages)}</span>
    </div>
  );
};

const tune = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Tune to lab data/i }));
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('current'), { timeout: 20000 });
};

describe('H10: the Lab tuned badge after a later edit', () => {
  it('a composition edit after tuning withdraws "Lab tuned"; tuning again restores it', async () => {
    render(<Harness />);
    expect(screen.getByTestId('status')).toHaveTextContent('none');
    await tune();
    const card = within(screen.getByTestId('tuning'));
    expect(card.getByText('Lab tuned')).toBeInTheDocument();

    // edit the feed: methane 40 to 45 mol%
    fireEvent.change(screen.getByLabelText('C1'), { target: { value: '45' } });
    expect(screen.getByTestId('status')).toHaveTextContent('stale');
    expect(card.queryByText('Lab tuned')).toBeNull();
    expect(card.getByText('Tuned on earlier inputs')).toBeInTheDocument();
    expect(card.getByTestId('lab-tuning-stale')).toHaveTextContent(/changed after the fluid was tuned/);
    // the tuned C7+ properties are still applied, and the card says so
    expect(card.getByTestId('lab-tuning-stale')).toHaveTextContent(/still applied/);
    expect(card.getByRole('button', { name: /Reset to untuned/i })).toBeInTheDocument();

    await tune();
    expect(card.getByText('Lab tuned')).toBeInTheDocument();
    expect(card.queryByTestId('lab-tuning-stale')).toBeNull();
  }, 60000);

  it('a changed lab value or separator stage is a change too; a field outside the fit is not', async () => {
    render(<Harness />);
    await tune();
    // the envelope window takes no part in the regression
    fireEvent.change(screen.getByLabelText('T max'), { target: { value: '450' } });
    expect(screen.getByTestId('status')).toHaveTextContent('current');
    // the measured value the fit matched
    fireEvent.change(screen.getByLabelText(/Measured Psat/i), { target: { value: '2700' } });
    expect(screen.getByTestId('status')).toHaveTextContent('stale');
  }, 60000);

  it('every compositional card follows the same status', async () => {
    render(<Harness />);
    await tune();
    const sep = within(screen.getByTestId('separator'));
    expect(sep.getByText('Lab tuned')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('C1'), { target: { value: '45' } });
    expect(sep.queryByText('Lab tuned')).toBeNull();
    expect(sep.getByText('Tuned on earlier inputs')).toBeInTheDocument();
  }, 60000);

  it('the status is a pure function of what the regression consumed', () => {
    const c = start();
    const { request } = labTuneRequest(c, stages);
    const tuned = { ...c, tuning: { ...c.tuning, applied: { fTc: 1.01, fPc: 0.98, kC1: 0.05, sPlus: 0.1 }, fittedOn: JSON.stringify(request) } };
    expect(tuningStatus(c, stages)).toBe('none');
    expect(tuningStatus(tuned, stages)).toBe('current');
    expect(tuningStatus({ ...tuned, plus: { ...tuned.plus, sg: 0.86 } }, stages)).toBe('stale');
    expect(tuningStatus({ ...tuned, zPct: { ...tuned.zPct, C1: 41, 'C7+': 33 } }, stages)).toBe('stale');
    // a project saved before the fingerprint existed cannot be confirmed
    const { fittedOn, ...oldTuning } = tuned.tuning;
    expect(tuningStatus({ ...tuned, tuning: oldTuning }, stages)).toBe('unrecorded');
  });
});
