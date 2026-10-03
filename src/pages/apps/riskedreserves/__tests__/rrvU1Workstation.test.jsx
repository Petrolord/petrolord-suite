/**
 * Risked Reserves Valuation upgrade U1: the workstation on the in-memory
 * account. Saved state (RL12, PL5): the table when it exists, the browser
 * with an honest note when it does not, and the move across on the first
 * save. The handoff (RL11): edits marked, a change upstream said after a
 * reload, refresh. Units (PL3), typing (PL11), the Report tab (RL12),
 * sharing, remove and undo.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RrvWorkstation from '../components/RrvWorkstation';
import { makeInMemoryRrvBackend } from '../services/rrvBackend';
import { RRV_KEY, RRV_STORE_KEY, fromRcpProspect, toRow, engineInput } from '../services/rrvStore';
import { RRV_SEED_PROSPECTS, RRV_T1_BROWSER_LIST } from '../services/rrvFixtures';
import { valueProspect } from '@/utils/prospectValuation';
import { VIEW_PREFIX } from '@/lib/units/useAppUnits';

jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

const mount = (backend) => render(<MemoryRouter><RrvWorkstation backend={backend} /></MemoryRouter>);
const text = (id) => screen.getByTestId(id).textContent;
const importAll = async () => {
  await waitFor(() => expect(screen.getByTestId('rrv-import').disabled).toBe(false));
  fireEvent.click(screen.getByTestId('rrv-import'));
};
const settled = () => waitFor(() => expect(text('rrv-save-state')).not.toMatch(/Checking/));
const type = (id, value) => fireEvent.change(screen.getByTestId(id), { target: { value } });

describe('RL12, PL5: where a valuation is saved', () => {
  test('before the table exists: kept in the browser, said plainly, Save disabled with the reason, and still there after a reload', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { table: false });
    mount(backend);
    await settled();
    expect(text('rrv-save-state')).toBe('Kept in this browser only');
    expect(text('rrv-storage-note')).toMatch(/kept in this browser only: saving to your account is not switched on for this database yet/);
    expect(text('rrv-storage-note')).toMatch(/Once it is switched on, Save moves them to your account/);
    expect(screen.getByTestId('rrv-save').disabled).toBe(true);
    expect(screen.getByTestId('rrv-save').getAttribute('title')).toMatch(/not switched on for this database yet/);
    await importAll();
    type('rrv-mefs-Ekene North', '15');
    expect(text('rrv-saved-Ekene North')).toMatch(/This browser only \(saving to the account is not switched on/);
    cleanup();
    mount(backend);
    await settled();
    expect(screen.getByTestId('rrv-mefs-Ekene North').value).toBe('15');
    expect(JSON.parse(localStorage.getItem(RRV_STORE_KEY)).list).toHaveLength(2);
  });

  test('with the table: Save writes one row per prospect, the state says so, and a clean browser opens them from the account', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    expect(screen.queryByTestId('rrv-storage-note')).toBeNull();
    await importAll();
    expect(text('rrv-save-state')).toBe('2 not saved to your account');
    type('rrv-mefs-Ekene North', '15');
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    expect(text('rrv-status')).toBe('Saved 2 valuations to your account.');
    const rows = backend._rows();
    expect(rows.map((r) => r.prospect_key).sort()).toEqual(['rcp-prospect-1', 'rcp-prospect-2']);
    expect(rows.find((r) => r.name === 'Ekene North').valuation).toMatchObject({ mefs: 15, touched: { mefs: true }, handoff: { recordName: 'Ekene North' } });
    expect(rows[0].schema_version).toBe(1);
    expect(text('rrv-saved-Ekene North')).toMatch(/^Petrolord account, \d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
    // another device: nothing in the browser
    cleanup(); localStorage.clear();
    mount(backend);
    await waitFor(() => expect(screen.getByTestId('rrv-mefs-Ekene North').value).toBe('15'));
    expect(text('rrv-save-state')).toBe('Saved to your account');
    expect(screen.getByTestId('rrv-save').disabled).toBe(true);
    // an edit is unsaved until saved, and the second save updates the same row
    type('rrv-wellCost-Ekene North', '30');
    expect(text('rrv-save-state')).toBe('1 not saved to your account');
    expect(text('rrv-saved-Ekene North')).toMatch(/later edits are in this browser only/);
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    expect(backend._rows()).toHaveLength(2);
    expect(backend._rows().find((r) => r.name === 'Ekene North')).toMatchObject({ version: 2, valuation: { wellCost: 30 } });
  });

  test('valuations kept in the browser by the earlier version move to the account on the first save', async () => {
    localStorage.setItem(RRV_KEY, JSON.stringify(RRV_T1_BROWSER_LIST));
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await waitFor(() => expect(text('rrv-status')).toMatch(/2 valuations kept in this browser are not on your account yet\. Save to move them there\./));
    expect(screen.getByTestId('rrv-unitValue-Ekene North').value).toBe('9.5');
    expect(backend._rows()).toHaveLength(0);
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(backend._rows()).toHaveLength(2));
    expect(backend._rows().find((r) => r.name === 'Typed lead')).toMatchObject({ rcp_prospect_id: null, valuation: { source: 'own', mefs: 10 } });
    expect(backend._rows().find((r) => r.name === 'Ekene North').valuation).toMatchObject({ unitValue: 9.5, touched: { mefs: true, unitValue: true } });
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
  });

  test('the table is switched on after work was done in the browser: the next visit offers the move', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { table: false });
    mount(backend);
    await settled();
    await importAll();
    cleanup();
    backend.setTable(true); // the owner applies the migration
    mount(backend);
    await waitFor(() => expect(text('rrv-save-state')).toBe('2 not saved to your account'));
    expect(screen.queryByTestId('rrv-storage-note')).toBeNull();
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(backend._rows()).toHaveLength(2));
  });

  test('a save that the account refuses is said, and nothing is lost', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    backend.setTable(false); // the table disappears under the page
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-status')).toMatch(/Not saved: Saving valuations to your account is not switched on/));
    expect(text('rrv-save-state')).toBe('Kept in this browser only');
    expect(JSON.parse(localStorage.getItem(RRV_STORE_KEY)).list).toHaveLength(2);
  });

  test('a backend with no account at all (the older one) leaves the page working in the browser', async () => {
    const { makeInMemoryProspectsBackend } = jest.requireActual('../../ReservoirCalcPro/services/prospectsService');
    mount(makeInMemoryProspectsBackend(RRV_SEED_PROSPECTS));
    await settled();
    expect(text('rrv-save-state')).toBe('Kept in this browser only');
    await importAll();
    expect(text('rrv-emv-Ekene North')).toMatch(/\d/);
  });
});

describe('RL11: the handoff on the screen', () => {
  test('the row names the source record and its time; an edit is marked with what was sent', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    expect(text('rrv-note-Ekene North')).toBe('from ReservoirCalc Pro, saved 2026-10-02 14:05 UTC');
    expect(text('rrv-handoff-line')).toMatch(/ReservoirCalc Pro prospect "Ekene North", saved 2026-10-02 14:05 UTC\. The source record is unchanged since\./);
    expect(screen.getByTestId('rrv-p50-Ekene North').getAttribute('data-edited')).toBeNull();
    type('rrv-p50-Ekene North', '34');
    expect(screen.getByTestId('rrv-p50-Ekene North').getAttribute('data-edited')).toBe('true');
    expect(screen.getByTestId('rrv-p50-Ekene North').getAttribute('title')).toMatch(/Edited here: ReservoirCalc Pro sent 30/);
    expect(text('rrv-note-Ekene North')).toMatch(/edited here: P50 \(sent 30\)/);
    // typing the sent value back clears the mark
    type('rrv-p50-Ekene North', '30');
    expect(screen.getByTestId('rrv-p50-Ekene North').getAttribute('data-edited')).toBeNull();
  });

  test('the prospect is risked again upstream: after a reload the row says what moved and Refresh takes it, keeping this app\'s inputs', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    type('rrv-mefs-Ekene North', '15');
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    cleanup();
    // ReservoirCalc Pro edits the record in place
    const row = (await backend.listProspects()).find((r) => r.name === 'Ekene North');
    await backend.saveProspect({ id: row.id, name: row.name, pgFactors: { ...row.pg_factors, charge: 0.4 }, inputs: { ...row.inputs, p50: 34 }, risked: { ...row.risked, pg: 0.256, success: { ...row.risked.success, p50: 34 } } });
    mount(backend);
    await waitFor(() => expect(text('rrv-upstream-Ekene North')).toMatch(/The source prospect changed in ReservoirCalc Pro .*after these inputs were received \(Pg 0\.32 to 0\.256; P50 30 to 34\)/));
    expect(screen.getByTestId('rrv-pg-Ekene North').value).toBe('0.32'); // nothing changes until the user asks
    fireEvent.click(screen.getByTestId('rrv-import'));
    expect(text('rrv-status')).toMatch(/Every ReservoirCalc Pro prospect is already here\. 1 changed there since it was valued: use Refresh on its row\./);
    fireEvent.click(screen.getByTestId('rrv-refresh-Ekene North'));
    expect(screen.getByTestId('rrv-pg-Ekene North').value).toBe('0.256');
    expect(screen.getByTestId('rrv-p50-Ekene North').value).toBe('34');
    expect(screen.getByTestId('rrv-mefs-Ekene North').value).toBe('15');
    expect(screen.queryByTestId('rrv-upstream-Ekene North')).toBeNull();
    expect(text('rrv-status')).toMatch(/Refreshed Ekene North from ReservoirCalc Pro/);
    expect(text('rrv-save-state')).toBe('1 not saved to your account');
    const v = valueProspect({ pg: 0.256, p90: 12, p50: 34, p10: 75, mefs: 15, unitValue: 8, devCost: 100, wellCost: 25 });
    expect(text('rrv-pc-Ekene North')).toBe(`${(v.pc * 100).toFixed(1)}%`);
  });

  test('risked again as a NEW record (delete and add): the valuation follows the new record, in the same saved row', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    cleanup();
    const old = (await backend.listProspects()).find((r) => r.name === 'Ekene North');
    await backend.deleteProspect(old);
    await backend.saveProspect({ name: 'Ekene North', pgFactors: old.pg_factors, inputs: { ...old.inputs, p10: 90 }, risked: { ...old.risked, success: { ...old.risked.success, p10: 90 } } });
    mount(backend);
    await waitFor(() => expect(text('rrv-upstream-Ekene North')).toMatch(/was risked again in ReservoirCalc Pro as a new record.*\(P10 75 to 90\)/));
    fireEvent.click(screen.getByTestId('rrv-refresh-Ekene North'));
    expect(screen.getByTestId('rrv-p10-Ekene North').value).toBe('90');
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    const saved = backend._rows().filter((r) => r.name === 'Ekene North');
    expect(saved).toHaveLength(1);
    expect(saved[0].prospect_key).not.toBe('rcp-prospect-1');
    expect(saved[0].version).toBe(2);
  });

  test('PL5, two tabs: a prospect risked in ReservoirCalc Pro after this page opened is found by Import, and a change shows without a reload', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    // the other tab: a new prospect, and an edit to one already here
    await backend.saveProspect({ name: 'Ekene South', pgFactors: { trap: 0.5, reservoir: 0.6, charge: 0.7, seal: 0.8 }, inputs: { mean: 20, p90: 8, p50: 17, p10: 38, unit: 'MMbbl', basis: 'recoverable' }, risked: { pg: 0.168, success: { p90: 8, p50: 17, p10: 38, mean: 20 } } });
    const deep = (await backend.listProspects()).find((r) => r.name === 'Ekene Deep');
    await backend.saveProspect({ id: deep.id, name: deep.name, pgFactors: deep.pg_factors, inputs: deep.inputs, risked: { ...deep.risked, pg: 0.2 } });
    fireEvent.click(screen.getByTestId('rrv-import'));
    await waitFor(() => expect(text('rrv-status')).toMatch(/Imported 1 prospect risked in ReservoirCalc Pro since this page opened: Ekene South/));
    expect(screen.getByTestId('rrv-pg-Ekene South').value).toBe('0.168');
    expect(text('rrv-upstream-Ekene Deep')).toMatch(/changed in ReservoirCalc Pro .*\(Pg 0\.18 to 0\.2\)/);
  });

  test('the source record is deleted upstream: the row says so and keeps its inputs', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    cleanup();
    await backend.deleteProspect((await backend.listProspects()).find((r) => r.name === 'Ekene Deep'));
    mount(backend);
    await waitFor(() => expect(text('rrv-upstream-Ekene Deep')).toMatch(/no longer in the ReservoirCalc Pro inventory; the inputs are as last received/));
    expect(screen.queryByTestId('rrv-refresh-Ekene Deep')).toBeNull();
    expect(screen.getByTestId('rrv-p90-Ekene Deep').value).toBe('40');
  });
});

describe('PL11, PL4: inputs a person can type', () => {
  test('a cleared Pg is named, never valued as zero; "2." and a comma decimal are read as typed', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    const pg = screen.getByTestId('rrv-pg-Ekene North');
    fireEvent.focus(pg);
    fireEvent.change(pg, { target: { value: '' } });
    expect(pg.value).toBe('');
    expect(text('rrv-emv-Ekene North')).toMatch(/check inputs/);
    expect(text('rrv-problem')).toMatch(/Enter Pg, the geological chance of success/);
    fireEvent.change(pg, { target: { value: '0,3' } });
    expect(pg.value).toBe('0,3'); // the text stays the user's while the field has focus
    // U2-002: the import starts on the economic model, whose MEFS does not depend on Pg
    expect(text('rrv-pc-Ekene North')).toBe(`${(valueProspect({ ...engineInput(fromRcpProspect({ id: 'x', ...RRV_SEED_PROSPECTS[0] })), pg: 0.3 }).pc * 100).toFixed(1)}%`);
    fireEvent.blur(pg);
    expect(pg.value).toBe('0.3');
    const mefs = screen.getByTestId('rrv-mefs-Ekene North');
    fireEvent.focus(mefs);
    fireEvent.change(mefs, { target: { value: '2.' } });
    expect(mefs.value).toBe('2.');
    fireEvent.change(mefs, { target: { value: '-' } });
    expect(text('rrv-problem')).toMatch(/Enter the MEFS \(zero is allowed\)/);
    fireEvent.change(mefs, { target: { value: 'abc' } });
    expect(text('rrv-problem')).toMatch(/must be zero or more/);
  });
});

describe('PL3: the unit view', () => {
  test('switching to cubic metres converts every volume and the value per barrel, and changes no result', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    const emv = text('rrv-emv-Ekene North');
    const pc = text('rrv-pc-Ekene North');
    fireEvent.change(screen.getByTestId('rrv-units'), { target: { value: '10^6 m3' } });
    expect(screen.getByTestId('rrv-p90-Ekene North').value).toBe('1.90785');
    const model = fromRcpProspect({ id: 'x', ...RRV_SEED_PROSPECTS[0] });
    expect(screen.getByTestId('rrv-unitValue-Ekene North').value).toBe(String(parseFloat((model.unitValue / 0.158987294928).toPrecision(6))));
    // money does not convert
    expect(screen.getByTestId('rrv-devCost-Ekene North').value).toBe(String(parseFloat(model.devCost.toPrecision(6))));
    expect(text('rrv-emv-Ekene North')).toBe(emv);
    expect(text('rrv-pc-Ekene North')).toBe(pc);
    expect(text('rrv-portfolio')).toMatch(/10\^6 m3 oe/);
    expect(text('rrv-out-Success-case mean (lognormal)')).toMatch(/10\^6 m3 oe$/);
    expect(text('rrv-units-note')).toMatch(/your unit profile asks for MMboe/);
    // a value typed in cubic metres is stored in the one system
    type('rrv-mefs-Ekene North', '2');
    fireEvent.change(screen.getByTestId('rrv-units'), { target: { value: 'MMbbl' } });
    expect(Number(screen.getByTestId('rrv-mefs-Ekene North').value)).toBeCloseTo(2 / 0.158987294928, 3);
    expect(JSON.parse(localStorage.getItem(RRV_STORE_KEY)).list[0].p90).toBe(12);
  });
  test('the view asked for by the session is honoured on open', async () => {
    sessionStorage.setItem(`${VIEW_PREFIX}rrv`, JSON.stringify({ volume: '10^6 m3' }));
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    expect(screen.getByTestId('rrv-units').value).toBe('10^6 m3');
    expect(screen.getByTestId('rrv-p90-Ekene North').value).toBe('1.90785');
  });
});

describe('RL12: the Report tab is the report', () => {
  test('identification is typed here, saved with the valuation, and the rows are the report model\'s', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
    mount(backend);
    await settled();
    await importAll();
    fireEvent.click(screen.getByTestId('rrv-tab-report'));
    expect(text('rrv-header-Company')).toBe('Harness Energy'); // the organisation, until one is typed
    type('rrv-ident-company', 'Lordsway Energy');
    type('rrv-ident-licence', 'OML 143');
    type('rrv-ident-analyst', 'A. Analyst');
    expect(text('rrv-header-Company')).toBe('Lordsway Energy');
    expect(text('rrv-header-Licence or block')).toBe('OML 143');
    expect(text('rrv-header-Play')).toBe('n/a');
    expect(text('rrv-header-Volumes from')).toBe('ReservoirCalc Pro prospect "Ekene North", saved 2026-10-02 14:05 UTC');
    expect(text('rrv-header-Valuation saved')).toBe('This browser only (not yet saved to the account)');
    expect(text('rrv-header-Display units')).toMatch(/^Oilfield \(MMboe, \$\/boe, \$MM\)/);
    const inputs = within(screen.getByTestId('rrv-report-inputs'));
    expect(inputs.getByText('Success-case volume P90 (low)')).toBeTruthy();
    // U2-002: the MEFS is derived from the economic model, whose ten assumptions are rows of their own
    expect(inputs.getByText(/Derived: the smallest size whose net present value is at or above zero under the economic model below/)).toBeTruthy();
    expect(inputs.getAllByText(/Assumed: the starting screening default/)).toHaveLength(10);
    expect(inputs.getByText(/Assumed: the starting default of 25 \$MM, never changed on this screen/)).toBeTruthy();
    // the headline EMV in the Report tab is the EMV in the table
    expect(within(screen.getByTestId('rrv-report-headline')).getByText(text('rrv-emv-Ekene North'))).toBeTruthy();
    expect(text('rrv-report-handoff')).toMatch(/Monte Carlo run2026-10-01 11:00 UTC, seed 123, 10,000 realizations/);
    expect(text('rrv-report-chance')).toMatch(/Pg = trap x reservoir x charge x seal = 0\.800 x 0\.800 x 0\.500 x 1\.000 = 0\.320/);
    expect(text('rrv-report-limits')).toMatch(/Single prospect\./);
    expect(text('rrv-report-flags')).toMatch(/a starting default that was never changed/);
    expect(text('rrv-report-flags')).toMatch(/The economic model is the starting screening default/);
    expect(text('rrv-report-figures')).toMatch(/Expectation curve of volume.*Expectation curve of value.*Value of a discovery against its size.*Chance factors and the chance of success.*Sensitivity of the EMV/);
    // stating a source changes the row; typing the input changes the wording too
    expect(screen.queryByTestId('rrv-source-mefs')).toBeNull(); // a derived input has no source of its own to state
    fireEvent.change(within(screen.getByTestId('rrv-source-wellCost')).getByLabelText('Exploration well cost note'), { target: { value: 'Rig quote 2026' } });
    expect(inputs.getByText(/Assumed: the starting default of 25 \$MM, never changed on this screen\. Rig quote 2026/)).toBeTruthy();
    type('rrv-wellCost-Ekene North', '30');
    expect(inputs.getByText('Entered, source not stated. Rig quote 2026')).toBeTruthy();
    // typing the MEFS takes it over, and it then has a source to state
    type('rrv-mefs-Ekene North', '15');
    fireEvent.change(within(screen.getByTestId('rrv-source-mefs')).getByLabelText('MEFS note'), { target: { value: 'Screening economics 2026' } });
    expect(inputs.getByText('Entered, source not stated. Screening economics 2026')).toBeTruthy();
    expect(screen.getByTestId('rrv-report-pdf').disabled).toBe(false);
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    expect(backend._rows().find((r) => r.name === 'Ekene North').valuation).toMatchObject({ ident: { company: 'Lordsway Energy', licence: 'OML 143', analyst: 'A. Analyst' }, inputMeta: { mefs: { note: 'Screening economics 2026' } } });
    expect(text('rrv-header-Valuation saved')).toMatch(/^Petrolord account, /);
  });
  test('PL4: no report for a prospect that cannot be valued, and the button says why', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS));
    await settled();
    await importAll();
    type('rrv-p10-Ekene North', '5');
    fireEvent.click(screen.getByTestId('rrv-tab-report'));
    expect(screen.getByTestId('rrv-report-pdf').disabled).toBe(true);
    expect(screen.getByTestId('rrv-report-pdf').getAttribute('title')).toMatch(/P90 is the low case/);
    expect(screen.queryByTestId('rrv-report-headline')).toBeNull();
    expect(screen.getByTestId('rrv-report-inputs')).toBeTruthy();
  });
});

describe('sharing, remove and undo', () => {
  test('a saved valuation can be shared for viewing; a colleague\'s is read-only, out of the portfolio, and can be copied', async () => {
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { sharedValuations: true });
    mount(backend);
    await waitFor(() => expect(screen.getByTestId('rrv-shared-head').textContent).toMatch(/Shared with me \(1\)/));
    expect(screen.getByTestId('rrv-name-Ada Deep (shared)').disabled).toBe(true);
    expect(screen.getByTestId('rrv-mefs-Ada Deep (shared)').disabled).toBe(true);
    // a shared valuation is not in the user's portfolio: with none of their own there is no portfolio line
    expect(screen.queryByTestId('rrv-portfolio')).toBeNull();
    fireEvent.click(screen.getByTestId('rrv-row-Ada Deep (shared)'));
    expect(screen.queryByTestId('rrv-share')).toBeNull();
    fireEvent.click(screen.getByTestId('rrv-copy-Ada Deep (shared)'));
    expect(text('rrv-status')).toMatch(/Copied Ada Deep \(shared\) into your list as Ada Deep \(shared\) \(copy\)/);
    expect(text('rrv-portfolio')).toMatch(/Portfolio of 1 independent prospect:/);
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    // the owner's own saved valuation gets the share control
    fireEvent.click(screen.getByTestId('rrv-share'));
    await waitFor(() => expect(screen.getByTestId('record-sharing-bar')).toBeTruthy());
    fireEvent.click(screen.getByTestId('share-switch'));
    await waitFor(() => expect(backend._rows().find((r) => r.user_id === backend._sharing.me).visibility).toBe('organization'));
  });
  test('before the table exists nothing can be shared', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { table: false }));
    await settled();
    await importAll();
    expect(screen.queryByTestId('rrv-share')).toBeNull();
  });
  test('remove takes the row off the account, and Undo brings the valuation back as unsaved', async () => {
    const saved = [{ ...toRow(fromRcpProspect({ id: 'prospect-1', ...RRV_SEED_PROSPECTS[0] })), schema_version: 1 }];
    const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { valuations: saved });
    mount(backend);
    await waitFor(() => expect(text('rrv-save-state')).toBe('Saved to your account'));
    fireEvent.click(screen.getByTestId('rrv-remove-Ekene North'));
    await waitFor(() => expect(text('rrv-status')).toBe('Removed Ekene North from your account.'));
    expect(backend._rows()).toHaveLength(0);
    fireEvent.click(screen.getByTestId('rrv-undo'));
    expect(text('rrv-status')).toMatch(/Restored Ekene North\. It is not saved to your account until you save\./);
    expect(text('rrv-save-state')).toBe('1 not saved to your account');
    fireEvent.click(screen.getByTestId('rrv-save'));
    await waitFor(() => expect(backend._rows()).toHaveLength(1));
  });
});
