/**
 * Risked Reserves Valuation Step 2, on the screen (jsdom): the Economics
 * tab (U2-002), and each later item of the batch as it lands.
 */
import React from 'react';
import {
  render, screen, fireEvent, waitFor, cleanup,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RrvWorkstation from '../components/RrvWorkstation';
import { makeInMemoryRrvBackend } from '../services/rrvBackend';
import { RRV_STORE_KEY, fromRcpProspect } from '../services/rrvStore';
import { derivedMefs, ECON_MODEL_DEFAULTS } from '../services/rrvEconomics';
import { RRV_SEED_PROSPECTS, RRV_EPE_RUNS } from '../services/rrvFixtures';

jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

const mount = (backend, path = '/') => render(<MemoryRouter initialEntries={[path]}><RrvWorkstation backend={backend} /></MemoryRouter>);
const text = (id) => screen.getByTestId(id).textContent;
const el = (id) => screen.getByTestId(id);
const settled = () => waitFor(() => expect(text('rrv-save-state')).not.toMatch(/Checking/));
const importAll = async () => {
  await waitFor(() => expect(el('rrv-import').disabled).toBe(false));
  fireEvent.click(el('rrv-import'));
};
const type = (id, value) => fireEvent.change(el(id), { target: { value } });
const shown = (x) => String(parseFloat(Number(x).toPrecision(6)));

describe('U2-002: the Economics tab', () => {
  test('an imported prospect opens on the economic model: derived cells, the model, the curve, the table', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    const m = derivedMefs(ECON_MODEL_DEFAULTS).mefs;
    const mefs = el('rrv-mefs-Ekene North');
    expect(mefs.value).toBe(shown(m));
    expect(mefs.getAttribute('data-basis')).toBe('derived');
    expect(mefs.getAttribute('title')).toMatch(/DERIVED: the smallest size that pays under the economic model\. Typing here takes it over/);
    expect(el('rrv-unitValue-Ekene North').getAttribute('data-basis')).toBe('derived');
    expect(el('rrv-wellCost-Ekene North').getAttribute('data-basis')).toBeNull();
    expect(text('rrv-status')).toMatch(/the MEFS and the value of a discovery start from the screening model on the Economics tab/);

    fireEvent.click(el('rrv-tab-economics'));
    expect(el('rrv-value-basis').getAttribute('data-value')).toBe('model');
    expect(el('rrv-mefs-basis').getAttribute('data-value')).toBe('derived');
    expect(el('rrv-value-basis-model').checked).toBe(true);
    expect(text('rrv-econ-mefs')).toBe(`${shown(m)} MMboe`);
    expect(el('rrv-model-price').value).toBe('70');
    expect(el('rrv-model-capex').value).toBe('400');
    expect(text('rrv-econ-model')).toMatch(/Every net present value is the Suite screening engine: calculateEconomics/);
    const chart = el('rrv-value-size-chart');
    expect(chart.getAttribute('data-series')).toBe('engine,line');
    expect(Number(chart.getAttribute('data-points'))).toBe(40);
    expect(chart.getAttribute('data-canvas')).toBe('chart'); // the white chart template
    expect(chart.querySelector('img')).toBeTruthy(); // ChartLogo
    expect(text('rrv-econ-basis')).toMatch(/Value at the MEFS0\.0 \$MM/);
    expect(text('rrv-econ-table')).toMatch(/Engine NPV \(\$MM\)/);
    expect(text('rrv-econ-table')).toMatch(/Mean if commercial/);
  });

  test('changing the model moves the MEFS in the table and the EMV; typing the MEFS takes it over; Derived brings it back', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    const emv0 = text('rrv-emv-Ekene North');
    fireEvent.click(el('rrv-tab-economics'));
    type('rrv-model-capex', '250');
    const m = derivedMefs({ ...ECON_MODEL_DEFAULTS, capex: 250 }).mefs;
    expect(el('rrv-mefs-Ekene North').value).toBe(shown(m));
    expect(text('rrv-emv-Ekene North')).not.toBe(emv0);
    expect(text('rrv-save-state')).toMatch(/not saved to your account/);
    // a blank assumption is named and nothing is valued
    type('rrv-model-price', '');
    expect(text('rrv-economics-problem')).toMatch(/Economic model: enter price/);
    expect(text('rrv-emv-Ekene North')).toMatch(/check inputs/);
    type('rrv-model-price', '70');
    // typing the MEFS in the table
    type('rrv-mefs-Ekene North', '30');
    expect(el('rrv-mefs-basis').getAttribute('data-value')).toBe('typed');
    expect(el('rrv-mefs-Ekene North').getAttribute('data-basis')).toBeNull();
    expect(text('rrv-econ-size-that-pays')).toBe(`The size that pays under the stated value is ${shown(m)} MMboe.`);
    fireEvent.click(el('rrv-mefs-basis-derived'));
    expect(el('rrv-mefs-Ekene North').value).toBe(shown(m));
    // entered values: the model card goes, the chart keeps the line only
    fireEvent.click(el('rrv-value-basis-entered'));
    expect(screen.queryByTestId('rrv-econ-model')).toBeNull();
    expect(el('rrv-value-size-chart').getAttribute('data-series')).toBe('line');
    expect(el('rrv-unitValue-Ekene North').getAttribute('data-basis')).toBeNull();
    type('rrv-unitValue-Ekene North', '10');
    type('rrv-devCost-Ekene North', '150');
    expect(el('rrv-mefs-Ekene North').value).toBe('15'); // D / u
  });

  test('PL5: the economics survive a reload (browser) and a save (account)', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    fireEvent.click(el('rrv-tab-economics'));
    type('rrv-model-capex', '250');
    const mefs = el('rrv-mefs-Ekene North').value;
    expect(JSON.parse(localStorage.getItem(RRV_STORE_KEY)).list[0].econ).toMatchObject({ value: 'model', mefs: 'derived', model: { capex: 250 }, modelTouched: { capex: true } });
    fireEvent.click(el('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    expect(backend._rows().find((r) => r.name === 'Ekene North').valuation.econ.model.capex).toBe(250);
    cleanup();
    localStorage.clear();
    mount(backend);
    await settled();
    await waitFor(() => expect(el('rrv-mefs-Ekene North').value).toBe(mefs));
    fireEvent.click(el('rrv-tab-economics'));
    expect(el('rrv-model-capex').value).toBe('250');
  });

  test('PL3: in the metric view the model shows its prices per cubic metre (70 $/boe is 440.287 $/m3) and stores one system', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    fireEvent.click(el('rrv-tab-economics'));
    fireEvent.change(el('rrv-units'), { target: { value: '10^6 m3' } });
    expect(el('rrv-model-price').value).toBe('440.287');
    expect(el('rrv-model-capex').value).toBe('400');
    const emv = text('rrv-emv-Ekene North');
    type('rrv-model-opexPerBoe', '100'); // $/m3
    expect(JSON.parse(localStorage.getItem(RRV_STORE_KEY)).list[0].econ.model.opexPerBoe).toBeCloseTo(100 * 0.158987294928, 7);
    expect(text('rrv-emv-Ekene North')).not.toBe(emv);
    expect(text('rrv-econ-table')).toMatch(/Size \(10\^6 m3 oe\)/);
  });

  test('a colleague\'s shared valuation shows its economics read-only', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { sharedValuations: true, sharedRows: true }));
    await settled();
    await waitFor(() => expect(screen.getByTestId('rrv-shared-head')).toBeTruthy());
    fireEvent.click(el('rrv-row-Ada Deep (shared)'));
    fireEvent.click(el('rrv-tab-economics'));
    expect(el('rrv-value-basis-model').disabled).toBe(true);
    expect(el('rrv-model-price').disabled).toBe(true);
    expect(fromRcpProspect({ id: 'x', ...RRV_SEED_PROSPECTS[0] }).econ.value).toBe('model');
  });
});

describe('U2-001: the value per barrel from Petroleum Economics Studio', () => {
  const withEpe = () => makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { epeRuns: RRV_EPE_RUNS });

  test('pick a saved run by id: its value per barrel and capex are received, named, and the MEFS follows', async () => {
    const backend = withEpe();
    mount(backend);
    await settled();
    await importAll();
    // before any handoff the screen names no such source
    expect(text('rrv-unit-value-source')).toMatch(/No Petroleum Economics Studio case is in use for this prospect/);
    fireEvent.click(el('rrv-tab-economics'));
    expect(el('rrv-epe').getAttribute('data-state')).toBe('none');
    expect(el('rrv-value-basis-epe').disabled).toBe(true); // nothing received yet
    fireEvent.click(el('rrv-epe-pick'));
    await waitFor(() => expect(el('rrv-epe-list')).toBeTruthy());
    expect(text('rrv-epe-row-epe-run-1')).toMatch(/Ekene North development.*Base deck, 10%.*2026-10-01.*"Corporate base 2026": oil 72 \$\/bbl.*10% real, end-year discounting.*5\.56.*12\.67.*320\.0/);
    expect(text('rrv-epe-row-epe-run-3')).toMatch(/Cannot be used: This run has no results\./);
    expect(screen.queryByTestId('rrv-epe-use-epe-run-3')).toBeNull();
    fireEvent.click(el('rrv-epe-use-epe-run-1'));
    expect(el('rrv-value-basis').getAttribute('data-value')).toBe('epe');
    expect(el('rrv-unitValue-Ekene North').value).toBe('12.6667');
    expect(el('rrv-unitValue-Ekene North').getAttribute('data-basis')).toBe('received');
    expect(el('rrv-devCost-Ekene North').value).toBe('320');
    expect(el('rrv-mefs-Ekene North').value).toBe(shown(320 / (570 / 45)));
    expect(text('rrv-epe-status')).toMatch(/In use: run "Base deck, 10%" of case "Ekene North development", received \d{4}-\d\d-\d\d\./);
    expect(text('rrv-epe-source-now')).toBe('The run is unchanged since its value was received.');
    expect(text('rrv-epe-handoff')).toMatch(/Price deck"Corporate base 2026": oil 72 \$\/bbl, gas 3\.5 \$\/Mscf, condensate 68 \$\/bbl/);
    expect(text('rrv-epe-handoff')).toMatch(/Discount rate10% real, end-year discounting/);
    expect(text('rrv-epe-handoff')).toMatch(/Engine buildPetroleum Economics Studio cash-flow engine 3\.12\.0/);
    expect(text('rrv-status')).toMatch(/Ekene North now takes its value per barrel and development cost from Petroleum Economics Studio run "Base deck, 10%"/);
    // the readout on the Valuation tab and the Report tab say the same
    fireEvent.click(el('rrv-tab-valuation'));
    expect(text('rrv-unit-value-source')).toMatch(/received from Petroleum Economics Studio run "Base deck, 10%" of case "Ekene North development".*The run is unchanged since\./);
    fireEvent.click(el('rrv-tab-report'));
    expect(text('rrv-report-epe')).toMatch(/Source recordRun "Base deck, 10%" of case "Ekene North development" \(epe_runs epe-run-1\)/);
    expect(text('rrv-report-epe')).toMatch(/Source record nowUnchanged since it was received/);
    // the other prospect received nothing and says so
    fireEvent.click(el('rrv-row-Ekene Deep'));
    expect(text('rrv-report-epe')).toMatch(/None: no Petroleum Economics Studio case was received for this prospect/);
  });

  test('it survives a save and a reload, and a run that changed since is said, with Refresh', async () => {
    const backend = withEpe();
    mount(backend);
    await settled();
    await importAll();
    fireEvent.click(el('rrv-tab-economics'));
    fireEvent.click(el('rrv-epe-pick'));
    await waitFor(() => el('rrv-epe-use-epe-run-1'));
    fireEvent.click(el('rrv-epe-use-epe-run-1'));
    fireEvent.click(el('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    expect(backend._rows().find((r) => r.name === 'Ekene North').valuation.econ.epe).toMatchObject({ runId: 'epe-run-1', priceDeckName: 'Corporate base 2026', discountRatePct: 10 });
    // Petroleum Economics Studio re-runs the case; a new browser opens the valuation from the account
    backend._setEpeRun('epe-run-1', (r) => ({ ...r, resultsAt: '2026-10-03T08:00:00.000Z', kpis: { ...r.kpis, npv: 205e6 } }));
    cleanup();
    localStorage.clear();
    mount(backend);
    await settled();
    await waitFor(() => expect(el('rrv-unitValue-Ekene North').value).toBe('12.6667'));
    fireEvent.click(el('rrv-tab-economics'));
    await waitFor(() => expect(el('rrv-epe').getAttribute('data-state')).toBe('changed'));
    expect(text('rrv-epe-source-now')).toMatch(/The Petroleum Economics Studio run changed after its value was received \(value per barrel before capex 12\.6667 to 11\.6667/);
    fireEvent.click(el('rrv-tab-valuation'));
    expect(text('rrv-unit-value-source')).toMatch(/run changed after its value was received/);
    fireEvent.click(el('rrv-tab-economics'));
    fireEvent.click(el('rrv-epe-refresh'));
    expect(el('rrv-unitValue-Ekene North').value).toBe('11.6667');
    expect(el('rrv-epe').getAttribute('data-state')).toBe('current');
    expect(text('rrv-save-state')).toMatch(/not saved to your account/);
  });

  test('typing over the received value leaves the case, says so, and it can be used again', async () => {
    mount(withEpe());
    await settled();
    await importAll();
    fireEvent.click(el('rrv-tab-economics'));
    fireEvent.click(el('rrv-epe-pick'));
    await waitFor(() => el('rrv-epe-use-epe-run-2'));
    fireEvent.click(el('rrv-epe-use-epe-run-2'));
    expect(text('rrv-epe-handoff')).toMatch(/Discount rate12% real/);
    type('rrv-unitValue-Ekene North', '14');
    expect(el('rrv-value-basis').getAttribute('data-value')).toBe('entered');
    expect(el('rrv-epe').getAttribute('data-in-use')).toBe('false');
    expect(text('rrv-epe-status')).toMatch(/no longer in use: the value per barrel or the development cost was changed here/);
    fireEvent.click(el('rrv-tab-valuation'));
    expect(text('rrv-unit-value-source')).toMatch(/entered on this screen \(Petroleum Economics Studio run "Low deck, 12%" sent 9\.02222 \$\/bbl, no longer in use\)/);
    fireEvent.click(el('rrv-tab-economics'));
    fireEvent.click(el('rrv-epe-use-again'));
    expect(el('rrv-unitValue-Ekene North').value).toBe('9.02222');
    expect(el('rrv-value-basis-epe').checked).toBe(true);
  });

  test('the link from a Petroleum Economics Studio run (?epeRun=id) offers the run to the selected prospect', async () => {
    mount(withEpe(), '/?epeRun=epe-run-2');
    await settled();
    await importAll();
    await waitFor(() => expect(el('rrv-epe-offer')).toBeTruthy());
    expect(text('rrv-link-note')).toMatch(/Petroleum Economics Studio sent run "Low deck, 12%"\. Select the prospect it values, then use it on the Economics tab\./);
    expect(text('rrv-epe-offer')).toMatch(/Sent from Petroleum Economics Studio: run "Low deck, 12%" of case "Ekene North development", 9\.02222 \$\/boe before capex, development 310 \$MM, 12% real, end-year discounting/);
    fireEvent.click(el('rrv-epe-offer-use'));
    expect(el('rrv-unitValue-Ekene North').value).toBe('9.02222');
    expect(screen.queryByTestId('rrv-epe-offer')).toBeNull();
    expect(screen.queryByTestId('rrv-link-note')).toBeNull();
    cleanup();
    // a run that is not there says so and offers nothing
    mount(withEpe(), '/?epeRun=nope');
    await settled();
    await waitFor(() => expect(text('rrv-link-note')).toMatch(/The Petroleum Economics Studio run in the link was not found on your account/));
    expect(screen.queryByTestId('rrv-epe-offer')).toBeNull();
  });

  test('no runs, and a backend that cannot read them, are said plainly', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    fireEvent.click(el('rrv-tab-economics'));
    fireEvent.click(el('rrv-epe-pick'));
    await waitFor(() => expect(text('rrv-epe-list-empty')).toMatch(/You have no saved runs in Petroleum Economics Studio/));
    cleanup();
    const broken = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    broken.listEpeCases = async () => { throw new Error('Could not read your Petroleum Economics Studio runs: permission denied'); };
    mount(broken);
    await settled();
    await importAll();
    fireEvent.click(el('rrv-tab-economics'));
    fireEvent.click(el('rrv-epe-pick'));
    await waitFor(() => expect(text('rrv-epe-list-error')).toMatch(/permission denied/));
  });
});

describe('U2-003: the Sensitivity tab', () => {
  test('the tornado on the white chart template, the cases as a table, and the ranges the analyst sets', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    fireEvent.click(el('rrv-tab-sensitivity'));
    const chart = el('rrv-tornado');
    expect(chart.getAttribute('data-canvas')).toBe('chart');
    expect(chart.querySelector('img')).toBeTruthy(); // ChartLogo
    expect(Number(chart.getAttribute('data-bars'))).toBe(20); // Pg, four factors, volumes, u, D, W, MEFS: low and high
    expect(text('rrv-tornado-legend')).toMatch(/Low case.*High case.*Largest swing first/);
    expect(text('rrv-sens-base')).toBe(text('rrv-emv-Ekene North'));
    expect(el('rrv-sens-swing').value).toBe('25');
    expect(text('rrv-sens-row-wellCost')).toMatch(/^Exploration well cost\$MM2518\.75.*31\.25.*12\.5$/);
    expect(text('rrv-sens-row-factor.charge')).toMatch(/^Charge chancefraction0\.5000\.400.*0\.600/);
    expect(text('rrv-sens-note')).toMatch(/by 25% either way; each chance factor by 0\.1 in absolute chance/);
    // the analyst sets the ranges; they are saved with the valuation
    type('rrv-sens-swing', '10');
    expect(text('rrv-sens-row-wellCost')).toMatch(/22\.5.*27\.5.*5\.0$/);
    expect(JSON.parse(localStorage.getItem(RRV_STORE_KEY)).list[0].sens).toEqual({ swing: 10 });
    expect(text('rrv-save-state')).toMatch(/not saved to your account/);
    // the Report tab lists the figure as drawn and shows the same table
    fireEvent.click(el('rrv-tab-report'));
    expect(text('rrv-report-figures')).toMatch(/Sensitivity of the EMV\. Change in the EMV when one input is moved/);
    expect(text('rrv-report-sensitivity')).toMatch(/by 10% either way/);
    // a prospect that cannot be valued says why there is no tornado
    type('rrv-pg-Ekene North', '');
    fireEvent.click(el('rrv-tab-sensitivity'));
    expect(text('rrv-sensitivity-empty')).toMatch(/needs a valued prospect/);
  });
});
