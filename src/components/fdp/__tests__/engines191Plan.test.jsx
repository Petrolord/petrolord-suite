/**
 * EC6-1 and EC6-8 (engines #191) in the FDP Accelerator.
 *
 * EC6-1: nothing compared the concept's production profile or the wells
 * carried against the plan's own reserves, so a plan could score 100 percent
 * complete while its profile carried nearly twice its oil P50. The check is
 * non-blocking and caps nothing; the generation panel shows what it found and
 * the plan reads "Ready with warnings" while the warnings stand.
 *
 * EC6-8: the plan's end-of-life cost was listed on the cost screen and left
 * out of the cash flow, so the NPV was overstated by its discounted
 * after-tax value. It is charged in the final production year now, named
 * with its source, and it usually makes that year negative, which is why the
 * rate of return legitimately becomes null and the card says why.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import FDPGenerationOverview from '@/components/fdp/modules/generation/FDPGenerationOverview';
import EconomicsAnalysis from '@/components/fdp/modules/cost/EconomicsAnalysis';
import ScenarioManager from '@/components/fdp/modules/scenarios/ScenarioManager';
import FacilitiesCostEstimation from '@/components/fdp/modules/facilities/FacilitiesCostEstimation';
import { computePlanEconomics, irrReason } from '@/utils/fdp/planEconomics';
import { planAbandonment } from '@/utils/fdp/economics';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const concept = {
  id: 1, name: 'FPSO', drillingCapex: 400, facilitiesCapex: 1200, subseaCapex: 300,
  opex: 60, peakProduction: 60,
};
const scenario = { id: 10, name: 'Base', conceptId: 1, oilPrice: 70, discountRate: 10 };

const plan = ({ p50 = 130, wells = 2, costs = [], facilities = [], selectedFacilityId } = {}) => ({
  fieldData: { fieldName: 'Egina', country: 'Nigeria' },
  subsurface: { reserves: { summary: { p50, unit: 'MMbbl' }, breakdown: [] } },
  concepts: { list: [concept], selectedId: 1 },
  scenarios: { list: [scenario], selectedId: 10 },
  wells: { list: new Array(wells).fill(null).map((unused, i) => ({ id: i + 1, name: `W-${i + 1}` })) },
  facilities: { list: facilities, selectedId: selectedFacilityId ?? null },
  costs: { items: costs },
  economics: { capex: 1900 },
  schedule: { activities: [] },
});

const COSTS = [
  { id: 'c1', type: 'CAPEX', amount: 1900 },
  { id: 'c2', type: 'OPEX', amount: 60 },
];
const WITH_ABEX = [...COSTS, { id: 'c3', type: 'ABEX', name: 'Plug and abandon', amount: 150 }];

describe('the reserves check', () => {
  it('warns when the profile and the wells do not fit the reserves', () => {
    render(<FDPGenerationOverview state={plan({ p50: 130, wells: 2 })} />);
    const card = screen.getByTestId('reserves-check');
    expect(card).toHaveTextContent('229.9 MMbbl over 20 years');
    expect(card).toHaveTextContent('130.0 MMbbl');
    expect(card).toHaveTextContent('11 at 12 MMbbl a well');
    expect(card).toHaveTextContent(/percent above the oil P50/);
    expect(card).toHaveTextContent(/takes 11 wells, and the drilling program carries 2/);
    // The same warnings are not repeated in the validation list.
    const validation = screen.getByText('Validation Summary').closest('.p-6');
    expect(validation).not.toHaveTextContent(/percent above the oil P50/);
  });

  it('negative control: a profile and a well count that fit raise nothing', () => {
    render(<FDPGenerationOverview state={plan({ p50: 300, wells: 26 })} />);
    const card = screen.getByTestId('reserves-check');
    expect(card).not.toHaveTextContent(/percent above the oil P50/);
    expect(card).not.toHaveTextContent(/takes \d+ wells, and the drilling program/);
    expect(card).toHaveTextContent('25 at 12 MMbbl a well');
  });

  it('says what is missing rather than checking half a plan', () => {
    const bare = { ...plan(), wells: { list: [] }, subsurface: { reserves: { summary: { p50: 0 } } } };
    render(<FDPGenerationOverview state={bare} />);
    expect(screen.getByTestId('reserves-check'))
      .toHaveTextContent('Not checked yet: the plan is missing the oil P50 reserves, wells in the drilling program.');
  });
});

describe('the end-of-life cost', () => {
  it('comes from the plan ABEX item and is charged in the final production year', () => {
    const state = plan({ costs: WITH_ABEX });
    expect(planAbandonment(state).abandonmentSource).toBe('abex-item');
    const e = computePlanEconomics(state);
    expect(e.abandonment.abandonmentSource).toBe('abex-item');
    expect(e.abandonment.abandonmentMM).toBe(150);
    expect(e.abandonment.year).toBe(20);
    expect(e.cashflow[20].abex).toBeCloseTo(150, 9);
    expect(e.cashflow[19].abex).toBe(0);
  });

  it('falls to the facility decommissioning estimate, and costs the plan real NPV', () => {
    const facility = { id: 'f1', name: 'FPSO 1', type: 'FPSO', capacity: 120000 };
    const withFacility = plan({ costs: COSTS, facilities: [facility], selectedFacilityId: 'f1' });
    const e = computePlanEconomics(withFacility);
    expect(e.abandonment.abandonmentSource).toBe('decommissioning-estimate');
    expect(e.abandonment.abandonmentMM).toBeGreaterThan(0);

    // Negative control: the same plan with no facility and no ABEX charges
    // nothing, and is worth more by exactly what the cost takes off.
    const none = computePlanEconomics(plan({ costs: COSTS }));
    expect(none.abandonment.abandonmentSource).toBe('none');
    expect(none.abandonment.abandonmentMM).toBe(0);
    expect(none.metrics.npv).toBeGreaterThan(e.metrics.npv);
  });

  it('explains the rate of return the charge makes undefined', () => {
    const e = computePlanEconomics(plan({ costs: WITH_ABEX }));
    if (e.metrics.irr === null) {
      expect(irrReason(e.metrics)).toMatch(/no single rate of return|no rate of return/);
    } else {
      expect(irrReason(e.metrics)).toBeNull();
    }
    // The helper itself, on each status.
    expect(irrReason({ irr: 12, irrStatus: 'ok' })).toBeNull();
    expect(irrReason({ irr: null, irrStatus: 'multiple-roots', irrRoots: [-20.4, 24.6] }))
      .toBe('no single rate of return: the NPV is zero at -20.4% and 24.6%, because the final year pays the end-of-life cost');
    expect(irrReason({ irr: null, irrStatus: 'no-sign-change' }))
      .toBe('no rate of return: the cash flow never changes sign');
  });

  it('is named on the economics card, with its source and its year', () => {
    render(<EconomicsAnalysis economics={computePlanEconomics(plan({ costs: WITH_ABEX }))} />);
    const basis = screen.getByTestId('abandonment-basis');
    expect(basis).toHaveTextContent('End of life: $150.0MM, charged in year 20, the final production year.');
    expect(basis).toHaveTextContent("The plan's ABEX cost item: Plug and abandon.");
    expect(document.body.textContent).not.toMatch(/ABEX item is not in this screening case/);
  });

  it('negative control: a plan with no end-of-life cost says so', () => {
    render(<EconomicsAnalysis economics={computePlanEconomics(plan({ costs: COSTS }))} />);
    expect(screen.getByTestId('abandonment-basis'))
      .toHaveTextContent('No end-of-life cost is in this case.');
  });

  it('reaches every scenario card', () => {
    const abandonment = planAbandonment(plan({ costs: WITH_ABEX }));
    render(<ScenarioManager
      scenarios={[scenario]}
      concepts={[concept]}
      abandonment={abandonment}
      onEdit={() => {}}
      onDelete={() => {}}
      onSelect={() => {}}
      selectedId={null}
    />);
    expect(screen.getByTestId('scenario-abandonment'))
      .toHaveTextContent("End of life $150.0MM in year 20 (the plan's ABEX cost item).");
  });

  it('negative control: a scenario card with no plan cost says so', () => {
    render(<ScenarioManager
      scenarios={[scenario]}
      concepts={[concept]}
      onEdit={() => {}}
      onDelete={() => {}}
      onSelect={() => {}}
      selectedId={null}
    />);
    expect(screen.getByTestId('scenario-abandonment'))
      .toHaveTextContent('No end-of-life cost in this case.');
  });

  it('the facilities card shows the decommissioning figure and where it is charged', () => {
    render(<FacilitiesCostEstimation facility={{ id: 'f1', name: 'FPSO 1', type: 'FPSO', capacity: 120000 }} />);
    expect(screen.getByTestId('decommissioning')).toHaveTextContent(/^\$\d/);
    expect(screen.getByTestId('decommissioning-in-economics'))
      .toHaveTextContent('charged in the final production year of the plan');
  });
});
