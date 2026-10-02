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
import { RRV_SEED_PROSPECTS } from '../services/rrvFixtures';

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
