/**
 * Petroleum Economics Studio as a SENDER (Risked Reserves Valuation U2-001):
 * the `epe-unit-value-1` contract. A saved run publishes its NPV per barrel
 * with the provenance a reviewer needs (run, case, price deck, discount
 * rate and basis, date, engine build), and the split a field-size valuation
 * reads (value per barrel before development capex, and that capex).
 * Nothing in a run is recomputed: every number is read from the KPIs the
 * cash-flow engine wrote, and the test holds them against the Ekene demo
 * run, which that engine computed.
 */
import RUN from '../harness/ekeneRun.json';
import {
  EPE_UNIT_VALUE_SCHEMA, buildEpeUnitValue, epeFingerprint, epePriceDeckLine, epeDiscountLine,
} from '../epeUnitValue';
import { listEpeUnitValues, getEpeUnitValue } from '../epeUnitValueService';

const run = { id: 'r1', case_id: 'c1', user_id: 'u1', run_name: 'Ekene 2P with Ekene-11', run_config_id: 'cfg1', created_at: '2026-09-23T10:00:00.000Z' };
const config = { id: 'cfg1', config_name: 'Episode 26 case', ...RUN.cfg };
const send = (over = {}) => buildEpeUnitValue({ run, caseName: 'Ekene (demo kit)', kpis: RUN.kpis, config, resultsAt: '2026-09-23T10:00:05.000Z', build: 'Petrolord Suite 4.0.0 (abc1234)', ...over });

describe('the contract', () => {
  test('a run publishes its NPV per barrel and everything behind it', () => {
    const { ok, contract: c } = send();
    expect(ok).toBe(true);
    expect(c).toMatchObject({
      schema: EPE_UNIT_VALUE_SCHEMA, app: 'Petroleum Economics Studio', table: 'epe_runs',
      runId: 'r1', runName: 'Ekene 2P with Ekene-11', caseId: 'c1', caseName: 'Ekene (demo kit)',
      runSavedAt: '2026-09-23T10:00:00.000Z', resultsAt: '2026-09-23T10:00:05.000Z',
      priceDeckName: 'Episode 26 case', prices: { oil: 75, gas: RUN.cfg.gas_price_usd_mscf, condensate: RUN.cfg.condensate_price_usd_bbl },
      pvBasis: 'real', discounting: 'end_year', fiscalRegime: 'PIA', fiscalFramework: 'pia_only_then_nta_2025',
      engineVersion: '3.12.0', sentBuild: 'Petrolord Suite 4.0.0 (abc1234)', split: true,
    });
    expect(c.discountRatePct).toBeCloseTo(10, 9);
  });

  test('the numbers are the engine\'s own KPIs, in the receiving units, with one pinned value each', () => {
    const { contract: c } = send();
    const k = RUN.kpis;
    // USD to $MM, boe to MMboe: both a division by one million
    expect(c.npvMM).toBe(k.npv / 1e6);
    expect(c.npvMM).toBeCloseTo(1.980235, 6);
    expect(c.totalMMboe).toBe(k.total_boe / 1e6);
    expect(c.totalMMboe).toBeCloseTo(0.721833, 6);
    expect(c.pvCapexMM).toBe(k.pv_capex / 1e6);
    expect(c.pvCapexMM).toBeCloseTo(11.272727, 6);
    // NPV per barrel, full cycle: 1,980,235 USD over 721,833 boe = 2.7433 $/boe
    expect(c.npvPerBoe).toBeCloseTo(2.7433, 4);
    expect(c.npvPerBoe).toBe(k.npv / k.total_boe);
    // the split a field-size valuation reads: before the capex, and the capex
    expect(c.unitValue).toBeCloseTo((1980235.4787 + 11272727.2727) / 721832.5842, 6); // 18.36 $/boe
    expect(c.unitValue).toBeCloseTo(18.3602, 4);
    expect(c.devCost).toBe(c.pvCapexMM);
    // at the case's own size the line gives the case NPV back
    expect(c.unitValue * c.totalMMboe - c.devCost).toBeCloseTo(c.npvMM, 9);
    // and the engine's own DPI agrees with the PV of capex that was read
    expect(c.npvMM / c.pvCapexMM).toBeCloseTo(k.dpi, 12);
  });

  test('negative control: the full-cycle NPV per barrel is not the value per barrel before capex', () => {
    const { contract: c } = send();
    expect(c.unitValue - c.npvPerBoe).toBeGreaterThan(15);
    // using the full-cycle figure AND the capex would count the capex twice
    expect(c.npvPerBoe * c.totalMMboe - c.devCost).toBeLessThan(c.npvMM - 11);
  });

  test('a run from an engine that wrote no PV of capex sends the full-cycle value only, and says so', () => {
    const { ok, contract: c } = send({ kpis: { ...RUN.kpis, pv_capex: undefined, dpi: undefined } });
    expect(ok).toBe(true);
    expect(c).toMatchObject({ split: false, pvCapexMM: null, devCost: 0 });
    expect(c.unitValue).toBe(c.npvPerBoe);
  });

  test('what cannot be valued per barrel is refused with the reason', () => {
    expect(send({ kpis: null })).toEqual({ ok: false, reason: 'This run has no results.' });
    expect(send({ kpis: { ...RUN.kpis, total_boe: 0 } }).reason).toMatch(/produced no volume/);
    expect(send({ kpis: { ...RUN.kpis, npv: null } }).reason).toMatch(/no net present value/);
    expect(send({ kpis: { ...RUN.kpis, npv: -20e6 } }).reason).toMatch(/does not pay even before its development capex/);
    // a negative full-cycle NPV with a positive value before capex is a real case and is sent
    expect(send({ kpis: { ...RUN.kpis, npv: -1e6 } }).ok).toBe(true);
  });

  test('the fingerprint moves with what the run says and with nothing else', () => {
    const a = send().contract;
    expect(a.fingerprint).toBe(epeFingerprint(a));
    expect(send({ build: 'another build' }).contract.fingerprint).toBe(a.fingerprint);
    expect(send({ kpis: { ...RUN.kpis, npv: RUN.kpis.npv + 1 } }).contract.fingerprint).not.toBe(a.fingerprint);
    expect(send({ config: { ...config, config_name: 'Low deck' } }).contract.fingerprint).not.toBe(a.fingerprint);
    expect(send({ resultsAt: '2026-10-01T00:00:00.000Z' }).contract.fingerprint).not.toBe(a.fingerprint);
  });

  test('the lines a report prints', () => {
    const { contract: c } = send();
    expect(epePriceDeckLine(c)).toBe('"Episode 26 case": oil 75 $/bbl, gas 0 $/Mscf, condensate 70 $/bbl');
    expect(epeDiscountLine(c)).toBe('10% real, end-year discounting');
    expect(epePriceDeckLine({ ...c, priceDeckName: null, prices: null })).toBe('not recorded with the run');
  });
});

// a minimal PostgREST double: from(table).select().eq().in().order().limit(), then awaited
const fakeSupabase = (tables, fail = {}) => ({
  from(table) {
    let rows = [...(tables[table] || [])];
    const q = {
      select: () => q,
      eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return q; },
      in: (k, vs) => { rows = rows.filter((r) => vs.includes(r[k])); return q; },
      order: () => q,
      limit: (n) => { rows = rows.slice(0, n); return q; },
      then: (resolve) => resolve(fail[table] ? { data: null, error: { message: fail[table] } } : { data: rows, error: null }),
    };
    return q;
  },
});
const TABLES = {
  epe_runs: [
    { ...run, epe_cases: { case_name: 'Ekene (demo kit)' } },
    { id: 'r2', case_id: 'c1', user_id: 'u1', run_name: 'Failed run', run_config_id: 'cfg1', created_at: '2026-09-24T10:00:00.000Z', epe_cases: { case_name: 'Ekene (demo kit)' } },
  ],
  epe_results: [{ run_id: 'r1', kpis: RUN.kpis, created_at: '2026-09-23T10:00:05.000Z' }],
  epe_run_configs: [config],
};

describe('the service reads a run by id and builds the contract', () => {
  test('list: every readable run, the ones that cannot be sent with their reason', async () => {
    const list = await listEpeUnitValues(fakeSupabase(TABLES), { build: 'b' });
    expect(list.map((x) => [x.runId, x.ok])).toEqual([['r1', true], ['r2', false]]);
    expect(list[0].contract.fingerprint).toBe(send().contract.fingerprint);
    expect(list[1]).toMatchObject({ runName: 'Failed run', caseName: 'Ekene (demo kit)', reason: 'This run has no results.' });
  });
  test('get: by id, null when the run is gone, and a refusal is thrown as a refusal', async () => {
    expect((await getEpeUnitValue(fakeSupabase(TABLES), 'r1', { build: 'b' })).contract.runName).toBe('Ekene 2P with Ekene-11');
    expect(await getEpeUnitValue(fakeSupabase(TABLES), 'gone')).toBeNull();
    await expect(getEpeUnitValue(fakeSupabase(TABLES, { epe_runs: 'permission denied' }), 'r1')).rejects.toThrow(/Could not read the Petroleum Economics Studio run: permission denied/);
    await expect(listEpeUnitValues(fakeSupabase(TABLES, { epe_results: 'timeout' }))).rejects.toThrow(/Could not read Petroleum Economics Studio results: timeout/);
  });
});

describe('the card on the run\'s results page', () => {
  // eslint-disable-next-line global-require
  const React = require('react');
  // eslint-disable-next-line global-require
  const { render, screen } = require('@testing-library/react');
  // eslint-disable-next-line global-require
  const { MemoryRouter } = require('react-router-dom');
  // eslint-disable-next-line global-require
  const EpeUnitValueCard = require('../EpeUnitValueCard').default;
  const show = (props) => render(React.createElement(MemoryRouter, null, React.createElement(EpeUnitValueCard, props)));

  test('shows what will be sent and links to the valuation with the run id', () => {
    show({ run: { ...run, epe_cases: { case_name: 'Ekene (demo kit)' } }, results: { kpis: RUN.kpis, created_at: '2026-09-23T10:00:05.000Z' }, config });
    expect(screen.getByTestId('epe-unit-value-npv-per-boe').textContent).toBe('2.74 USD/boe');
    expect(screen.getByTestId('epe-unit-value-u').textContent).toBe('18.36 USD/boe');
    expect(screen.getByTestId('epe-unit-value-d').textContent).toBe('11.3 USD MM');
    expect(screen.getByTestId('epe-unit-value').textContent).toMatch(/NPV 2\.0 USD MM over 0\.72 MMboe at 10% real, end-year discounting; price deck "Episode 26 case": oil 75 \$\/bbl/);
    expect(screen.getByTestId('epe-unit-value-send').getAttribute('href')).toBe('/dashboard/apps/reservoir/risked-reserves-valuation?epeRun=r1');
  });
  test('a run that cannot be sent says why and offers no link; no results, no card', () => {
    const { unmount } = show({ run, results: { kpis: { ...RUN.kpis, total_boe: 0 } }, config });
    expect(screen.getByTestId('epe-unit-value-reason').textContent).toMatch(/cannot be sent to Risked Reserves Valuation\. This run produced no volume/);
    expect(screen.queryByTestId('epe-unit-value-send')).toBeNull();
    unmount();
    show({ run, results: null, config });
    expect(screen.queryByTestId('epe-unit-value')).toBeNull();
  });
});
