/**
 * Risked Reserves Valuation U2-001: the value per barrel from Petroleum
 * Economics Studio, as a real handoff. A saved run is read by id through the
 * sender that app owns (epe/epeUnitValue.js, `epe-unit-value-1`); its NPV per
 * barrel, price deck, discount rate, date and builds are kept with the
 * valuation, survive a save and a reload, are printed in the report, and the
 * run is checked again so "source changed since" is true when it is said.
 */
import { readPdf, chartLogo, flat, listCaptions, expectFigureDrawn } from '@/lib/reportKit/testKit';
import { valueProspect } from '@/utils/prospectValuation';
import {
  fromRcpProspect, engineInput, upstreamState, inputProblem, applyEpeCase, epeState, setInput, setValueBasis, setMefsBasis,
  unitValueSource, valueBasisWord, toRow, fromRow, payloadOf,
} from '../services/rrvStore';
import { makeInMemoryRrvBackend } from '../services/rrvBackend';
import { valueOrProblem } from '../services/rrvMath';
import { rrvUnits } from '../services/rrvUnits';
import { buildRrvReportModel, epeHandoffRows, epeSentence } from '../services/rrvReportModel';
import { buildRrvReport } from '../services/rrvReportExport';
import { RRV_SEED_PROSPECTS, RRV_EPE_RUNS } from '../services/rrvFixtures';

jest.setTimeout(120000);

const NOW = new Date('2026-10-02T15:00:00Z');
const UUID = '7f3c1a52-9d1e-4b7a-8c55-2f6a0b9e1d11';
const row = { id: UUID, ...RRV_SEED_PROSPECTS[0] };
const north = () => fromRcpProspect(row, { now: NOW });
const backend = () => makeInMemoryRrvBackend([], { epeRuns: RRV_EPE_RUNS });
const received = async (b = backend()) => {
  const sent = await b.getEpeCase('epe-run-1');
  return applyEpeCase(north(), sent.contract, { now: NOW, build: 'Petrolord Suite 4.0.0 (abc1234)' });
};

describe('the handoff, in the store', () => {
  test('the picker lists the runs by id: two that can be sent, one refused with the reason', async () => {
    const list = await backend().listEpeCases();
    expect(list.map((x) => [x.runId, x.ok])).toEqual([['epe-run-1', true], ['epe-run-2', true], ['epe-run-3', false]]);
    expect(list[2].reason).toBe('This run has no results.');
    // worked by hand from the fixture: NPV 250 $MM, capex PV 320 $MM, 45 MMboe
    expect(list[0].contract.npvPerBoe).toBeCloseTo(250 / 45, 12); // 5.556 $/boe
    expect(list[0].contract.unitValue).toBeCloseTo(570 / 45, 12); // 12.667 $/boe
    expect(list[0].contract.devCost).toBe(320);
  });

  test('a received case is the value of the discovery; the MEFS follows as D / u; the whole contract stays with the valuation', async () => {
    const p = await received();
    expect(p.econ.value).toBe('epe');
    expect(p.unitValue).toBeCloseTo(12.666667, 6);
    expect(p.devCost).toBe(320);
    expect(p.mefs).toBeCloseTo(320 / (570 / 45), 12); // 25.26 MMboe
    expect(p.econ.epe).toMatchObject({
      schema: 'epe-unit-value-1', runId: 'epe-run-1', runName: 'Base deck, 10%', caseName: 'Ekene North development', priceDeckName: 'Corporate base 2026',
      discountRatePct: 10, pvBasis: 'real', runSavedAt: '2026-10-01T09:00:00.000Z', engineVersion: '3.12.0', sentBuild: 'harness',
      receivedAt: NOW.toISOString(), receivedBuild: 'Petrolord Suite 4.0.0 (abc1234)',
    });
    expect(inputProblem(p)).toBeNull();
    // at the case's own size the valuation engine's value of a discovery is the case NPV
    expect(p.unitValue * 45 - p.devCost).toBeCloseTo(250, 9);
    const v = valueProspect(engineInput(p));
    expect(v.npvIfCommercial).toBeCloseTo(p.unitValue * v.meanIfCommercial - 320, 9);
    expect(valueBasisWord(p)).toBe('Petroleum Economics Studio case');
  });

  test('honest status: the app is named as the source only while the received case is the value in use', async () => {
    expect(unitValueSource(north())).not.toMatch(/Petroleum Economics Studio/);
    const p = await received();
    expect(unitValueSource(p)).toBe('received from Petroleum Economics Studio run "Base deck, 10%" of case "Ekene North development": its NPV before development capex per barrel');
    const typed = setInput(p, 'unitValue', 14);
    expect(typed.econ.value).toBe('entered');
    expect(unitValueSource(typed)).toBe('entered on this screen (Petroleum Economics Studio run "Base deck, 10%" sent 12.6667 $/bbl, no longer in use)');
    expect(typed.econ.epe.runId).toBe('epe-run-1'); // what was received is still on record
    const again = setValueBasis(typed, 'epe');
    expect(again).toMatchObject({ unitValue: p.unitValue, devCost: 320 });
    // a valuation that never received a case cannot be put on that basis
    expect(setValueBasis(north(), 'epe').econ.value).toBe('model');
    // and a thing that is not the contract is not applied
    expect(applyEpeCase(north(), { schema: 'something-else', unitValue: 9 })).toEqual(north());
  });

  test('it survives a save and a reload: the row reads back to the same valuation, handoff and all', async () => {
    const p = await received();
    const back = fromRow(JSON.parse(JSON.stringify({ id: 'row-1', version: 1, schema_version: 1, ...toRow(p) })));
    expect(payloadOf(back)).toEqual(payloadOf(p));
    expect(back.econ.epe.fingerprint).toBe(p.econ.epe.fingerprint);
  });

  test('"source changed since": the run is read again by id and compared', async () => {
    const b = backend();
    const p = await received(b);
    expect(epeState(north(), null)).toEqual({ state: 'none', inUse: false });
    expect(epeState(p, undefined)).toEqual({ state: 'unknown', inUse: true });
    expect(epeState(p, await b.getEpeCase('epe-run-1')).state).toBe('current');
    // Petroleum Economics Studio re-runs the case on a lower price deck
    b._setEpeRun('epe-run-1', (r) => ({ ...r, resultsAt: '2026-10-03T08:00:00.000Z', kpis: { ...r.kpis, npv: 205e6 }, config: { ...r.config, config_name: 'Corporate base 2026 rev B' } }));
    const s = epeState(p, await b.getEpeCase('epe-run-1'));
    expect(s.state).toBe('changed');
    expect(s.changes.map((c) => c.key)).toEqual(['unitValue', 'npvPerBoe', 'npvMM', 'priceDeckName']);
    expect(epeSentence(s, rrvUnits('MMbbl'))).toBe('The Petroleum Economics Studio run changed after its value was received (value per barrel before capex 12.6667 to 11.6667; NPV per barrel 5.55556 to 4.55556; case NPV 250 to 205; price deck Corporate base 2026 to Corporate base 2026 rev B).');
    // refresh takes the run as it is now
    const fresh = applyEpeCase(p, s.contract, { now: new Date('2026-10-03T09:00:00Z') });
    expect(fresh.unitValue).toBeCloseTo(525 / 45, 12);
    expect(epeState(fresh, await b.getEpeCase('epe-run-1')).state).toBe('current');
    // the run is deleted, or can no longer be sent
    b._removeEpeRun('epe-run-1');
    expect(epeState(p, await b.getEpeCase('epe-run-1'))).toEqual({ state: 'missing', inUse: true });
    expect(epeState(p, { ok: false, reason: 'This run has no results.' })).toMatchObject({ state: 'refused', reason: 'This run has no results.' });
    // negative control: a change of the sending build alone is not a change of the run
    const b2 = backend();
    const same = await b2.getEpeCase('epe-run-1');
    expect(epeState(p, { ...same, contract: { ...same.contract, sentBuild: 'a later build' } }).state).toBe('current');
  });
});

describe('the handoff, in the report (RL1, RL7, RL11)', () => {
  const logo = chartLogo();
  const args = (p, over = {}) => {
    const bad = inputProblem(p);
    const { v, problem } = bad ? { v: null, problem: bad } : valueOrProblem(engineInput(p));
    return { p, v, problem, units: rrvUnits('MMbbl'), upstream: upstreamState(p, [row]), savedWhere: 'Petrolord account, 2026-10-02 15:01 UTC', build: 'Petrolord Suite 4.0.0 (abc1234)', company: 'Harness Energy', ...over };
  };
  let p; let built; let pdf; let text; let b;
  beforeAll(async () => {
    b = backend();
    p = await received(b);
    built = buildRrvReport(buildRrvReportModel(args(p, { epe: epeState(p, await b.getEpeCase('epe-run-1')) })), { logo, generatedAt: new Date('2026-10-02T15:05:00Z') });
    pdf = readPdf(built.doc, { ink: true });
    text = flat(pdf.text);
  });
  afterAll(() => pdf.close());

  test('the two inputs name the run they came from, with unit', () => {
    const by = Object.fromEntries(built.model.inputs.rows.map((r) => [r.key, r]));
    expect(by.unitValue).toMatchObject({ value: '12.6667', unit: '$/boe', source: 'Petroleum Economics Studio run "Base deck, 10%" of case "Ekene North development", saved 2026-10-01 09:00 UTC: its NPV before development capex, per barrel' });
    expect(by.devCost).toMatchObject({ value: '320', unit: '$MM', source: expect.stringMatching(/: the present value of its capex$/) });
    expect(by.mefs.source).toBe('Derived: development cost over value per barrel (D / u), the size at which a discovery is worth zero');
    expect(text).toMatch(/12\.6667 \$\/boe Petroleum Economics Studio run "Base deck, 10%"/);
  });

  test('the handoff section prints the run, the price deck, the discount rate, the date, the builds and the numbers', () => {
    expect(text).toContain('Handoff from Petroleum Economics Studio');
    for (const s of [
      'Source application Petroleum Economics Studio',
      'Source record Run "Base deck, 10%" of case "Ekene North development" (epe_runs epe-run-1)',
      'Run saved 2026-10-01 09:00 UTC', 'Results written 2026-10-01 09:00 UTC',
      'Engine build Petroleum Economics Studio cash-flow engine 3.12.0', 'Sent by build harness',
      'Received here 2026-10-02 15:00 UTC, by Petrolord Suite 4.0.0 (abc1234)',
      'Price deck "Corporate base 2026": oil 72 $/bbl, gas 3.5 $/Mscf, condensate 68 $/bbl',
      'Discount rate 10% real, end-year discounting',
      'Fiscal regime PIA (pia_only_then_nta_2025) working interest 100%',
      'Case NPV and volume 250.0 $MM over 45 MMboe',
      'NPV per barrel, full cycle 5.55556 $/boe',
      'Present value of the case capex 320.0 $MM',
      'Value per barrel sent (u) 12.6667 $/boe: the case NPV before its capex, per barrel',
      'Development cost sent (D) 320 $MM: the present value of the case capex',
      'In use Yes: the value per barrel and development cost of this valuation are the ones sent',
      'Source record now Unchanged since it was received',
    ]) expect(text).toContain(s);
    expect(built.model.epeHandoff.map((r) => r[0])).toEqual(epeHandoffRows(p, { state: 'current' }, rrvUnits('MMbbl')).map((r) => r[0]));
  });

  test('the economics section and the value-by-size table carry the case; the figure marks it', () => {
    expect(text).toContain('Value of a discovery Petroleum Economics Studio run "Base deck, 10%" of case "Ekene North development"');
    expect(text).toMatch(/The case 45\.0 250\.0 5\.56/); // size, value on the line (the case NPV), all-in value per barrel
    expect(text).toContain('The row "The case" is the case\'s own size, where the line gives its NPV (250.0 $MM)');
    expect(text).toContain('its capex is taken as fixed and the rest of the case as proportional to volume, which is exact only at the case\'s own size');
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    expectFigureDrawn(pdf, fig.valueSize, { logo: true });
    expect(flat(pdf.pageText[fig.valueSize.page - 1])).toContain('Case');
    expect(listCaptions(pdf).find((c) => c.title === 'Value of a discovery against its size').caption || '').toBeDefined();
    expect(built.model.limits.flags.some((f) => /Petroleum Economics Studio/.test(f))).toBe(false);
  });

  test('a run that changed since is said in the handoff and flagged; a case no longer in use is recorded as that', async () => {
    b._setEpeRun('epe-run-1', (r) => ({ ...r, resultsAt: '2026-10-03T08:00:00.000Z', kpis: { ...r.kpis, npv: 205e6 } }));
    const changed = buildRrvReportModel(args(p, { epe: epeState(p, await b.getEpeCase('epe-run-1')) }));
    const now = Object.fromEntries(changed.epeHandoff)['Source record now'];
    expect(now).toMatch(/^The Petroleum Economics Studio run changed after its value was received \(value per barrel before capex 12\.6667 to 11\.6667/);
    expect(changed.limits.flags.some((f) => /run changed after its value was received.*Refresh the case on the Economics tab before signing\.$/.test(f))).toBe(true);
    const left = setInput(p, 'unitValue', 14);
    const m = buildRrvReportModel(args(left, { epe: epeState(left, await b.getEpeCase('epe-run-1')) }));
    expect(Object.fromEntries(m.epeHandoff)['In use']).toMatch(/^No: the value per barrel or the development cost was changed here after the handoff/);
    expect(m.inputs.rows.find((r) => r.key === 'unitValue').source).toBe('Entered on this screen (Petroleum Economics Studio run "Base deck, 10%" sent 12.6667 $/boe, no longer in use)');
    expect(m.limits.flags.some((f) => /A Petroleum Economics Studio case was received .* and is no longer the value in use/.test(f))).toBe(true);
    // a prospect that never received a case says "None" and names that app nowhere as a source
    const none = buildRrvReportModel(args(north()));
    expect(none.epeHandoff).toBeNull();
    expect(none.inputs.rows.some((r) => /Petroleum Economics Studio/.test(r.source))).toBe(false);
  });

  test('a typed MEFS stays typed over a received case; a run with no capex split is flagged', async () => {
    const typed = setInput(p, 'mefs', 30);
    expect(typed.econ).toMatchObject({ value: 'epe', mefs: 'typed' });
    expect(setMefsBasis(typed, 'derived').mefs).toBeCloseTo(p.mefs, 12);
    const noSplit = backend();
    noSplit._setEpeRun('epe-run-1', (r) => ({ ...r, kpis: { ...r.kpis, pv_capex: undefined } }));
    const q = applyEpeCase(north(), (await noSplit.getEpeCase('epe-run-1')).contract, { now: NOW });
    expect(q).toMatchObject({ devCost: 0, mefs: 0 });
    expect(q.unitValue).toBeCloseTo(250 / 45, 12);
    const m = buildRrvReportModel(args(q, { epe: { state: 'current', inUse: true } }));
    expect(m.limits.flags.some((f) => /carries no present value of capex/.test(f))).toBe(true);
  });
});
