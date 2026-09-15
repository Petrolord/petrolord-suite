/**
 * EC6 (engines #183) in the FDP Accelerator.
 *
 * EC6-2: the flow assurance screen no longer has a `level`, because Low /
 * Medium / High were the risk register's words for a different quantity. The
 * card showed "undefined Risk" against the repaired engine; it shows the
 * score and the hazards that produced it.
 * EC6-9: a concept with some capex fields blank is still summed, and the
 * scenario card says the sum is partial and which fields are missing.
 * EC6-4: an empty plan has no duration at all, so `calculateProjectDuration`
 * is null where it used to be a zero-day window.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import FlowAssuranceAnalysis from '@/components/fdp/modules/facilities/FlowAssuranceAnalysis';
import ScenarioManager, { capexMissingText } from '@/components/fdp/modules/scenarios/ScenarioManager';
import CriticalPath from '@/components/fdp/modules/schedule/CriticalPath';
import { calculateProjectDuration } from '@/utils/fdp/scheduleCalculations';
import { scheduleAnalysis } from '@/utils/fdp/scheduleNetwork';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

describe('flow assurance', () => {
  // EC6-3 (engines #191): the corrosion trigger is the H2S PARTIAL PRESSURE
  // against the NACE MR0175 threshold of 0.05 psia. 12 ppm at 5000 psia is
  // 0.06 psia, so this fluid is in sour service.
  it('shows the score and the named hazards, and never the retired level', () => {
    render(<FlowAssuranceAnalysis
      facility={{ type: 'Subsea Tie-back', name: 'FPSO tie-back' }}
      fluidProps={{ api: 20, h2s: 12, operatingPressurePsia: 5000 }}
    />);
    // 3 (tie-back) + 2 (below 25 API) + 4 (sour service) = 9
    expect(screen.getByTestId('flow-assurance-score')).toHaveTextContent('Hazard score 9');
    const breakdown = screen.getByTestId('flow-assurance-breakdown');
    expect(breakdown).toHaveTextContent('Subsea tie-back: 3 points (Hydrates, Wax)');
    expect(breakdown).toHaveTextContent('Oil below 25 API: 2 points (Viscosity)');
    expect(breakdown).toHaveTextContent('H2S partial pressure at or above 0.05 psia: 4 points (Corrosion)');
    expect(screen.getByTestId('corrosion-verdict')).toHaveTextContent('Sour service');
    expect(screen.getByTestId('corrosion-screen')).toHaveTextContent('0.0600 psia');
    expect(document.body.textContent).not.toMatch(/undefined/);
    expect(document.body.textContent).not.toMatch(/\b(Low|Medium|High) Risk\b/);
    // Nothing on this screen hardcodes a corrosion verdict.
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '../modules/facilities/FlowAssuranceAnalysis.jsx'), 'utf8',
    );
    expect(source).not.toMatch(/severityOf\('Corrosion'\)/);
  });

  it('says the pressure is needed rather than scoring corrosion without one', () => {
    render(<FlowAssuranceAnalysis
      facility={{ type: 'Subsea Tie-back' }}
      fluidProps={{ api: 20, h2s: 12 }}
    />);
    // Sour service is undecidable without a pressure, so it adds nothing.
    expect(screen.getByTestId('flow-assurance-score')).toHaveTextContent('Hazard score 5');
    expect(screen.getByTestId('corrosion-verdict')).toHaveTextContent('Pressure needed');
    expect(screen.getByTestId('corrosion-screen'))
      .toHaveTextContent('enter the operating pressure in psia');
  });

  it('says H2S is not measured rather than reading the fluid as sweet', () => {
    render(<FlowAssuranceAnalysis facility={{ type: 'Fixed Platform' }} fluidProps={{ api: 38 }} />);
    expect(screen.getByTestId('corrosion-verdict')).toHaveTextContent('H2S not measured');
    expect(screen.getByTestId('corrosion-screen')).toHaveTextContent('H2S is not measured');
  });

  it('negative control: a measured fluid below the threshold scores zero and says so', () => {
    render(<FlowAssuranceAnalysis
      facility={{ type: 'Fixed Platform' }}
      fluidProps={{ api: 38, h2s: 1, operatingPressurePsia: 1000 }}
    />);
    expect(screen.getByTestId('flow-assurance-score')).toHaveTextContent('Hazard score 0');
    expect(screen.getByTestId('flow-assurance-breakdown'))
      .toHaveTextContent('no screening trigger fired');
    expect(screen.getByTestId('corrosion-verdict')).toHaveTextContent('Below sour threshold');
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it('refuses an impossible pressure by name instead of screening on it', () => {
    render(<FlowAssuranceAnalysis
      facility={{ type: 'Fixed Platform' }}
      fluidProps={{ api: 38, h2s: 10, operatingPressurePsia: -5 }}
    />);
    expect(screen.getByRole('alert')).toHaveTextContent('the operating pressure (psia) must be above zero');
  });
});

describe('a scenario screened on a partial capex', () => {
  const concept = (over = {}) => ({
    id: 1,
    name: 'FPSO',
    drillingCapex: 400,
    facilitiesCapex: 1200,
    subseaCapex: 300,
    opex: 60,
    peakProduction: 50,
    ...over,
  });
  const scenario = { id: 9, name: 'Base', type: 'Base', conceptId: 1, oilPrice: 75, discountRate: 10, taxRate: 30 };
  const renderCards = (c) => render(
    <ScenarioManager
      scenarios={[scenario]}
      concepts={[c]}
      onEdit={() => {}}
      onDelete={() => {}}
      onSelect={() => {}}
      selectedId={null}
    />,
  );

  it('says the capex is partial and names the blank field', () => {
    renderCards(concept({ facilitiesCapex: '' }));
    expect(screen.getByTestId('partial-capex'))
      .toHaveTextContent('Partial capex: the facilities capex is blank');
    expect(screen.getByText(/CAPEX \$700MM, partial/)).toBeInTheDocument();
  });

  it('negative control: a complete capex says nothing about being partial', () => {
    renderCards(concept());
    expect(screen.queryByTestId('partial-capex')).not.toBeInTheDocument();
    expect(screen.getByText(/CAPEX \$1900MM/)).toBeInTheDocument();
  });

  it('names several blank fields in the form order', () => {
    expect(capexMissingText(['drillingCapex', 'subseaCapex']))
      .toBe('the drilling capex and the subsea capex');
    expect(capexMissingText(['facilitiesCapex'])).toBe('the facilities capex');
    expect(capexMissingText([])).toBe('');
  });
});

describe('a plan with no dated activities', () => {
  it('has no calendar span at all, and the card says Not dated', () => {
    expect(calculateProjectDuration([])).toBeNull();
    const undated = [{ id: 'a', name: 'Mobilise', duration: 10, dependencies: [] }];
    const analysis = scheduleAnalysis(undated);
    expect(analysis.calendarDays).toBeNull();
    render(<CriticalPath analysis={analysis} />);
    expect(screen.getByText('Not dated')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|null d/);
  });

  it('an empty plan asks for activities rather than reporting a zero-day window', () => {
    const analysis = scheduleAnalysis([]);
    expect(analysis.empty).toBe(true);
    render(<CriticalPath analysis={analysis} />);
    expect(screen.getByText(/No activities yet/)).toBeInTheDocument();
  });

  it('negative control: dated activities still report their span', () => {
    const dated = [
      { id: 'a', name: 'Mobilise', duration: 10, start: '2027-01-01', end: '2027-01-11', dependencies: [] },
      { id: 'b', name: 'Drill', duration: 20, start: '2027-01-11', end: '2027-02-01', dependencies: ['a'] },
    ];
    expect(scheduleAnalysis(dated).calendarDays).toBe(31);
  });
});
