/**
 * Petroleum Economics Studio receives a well's capital cost from Well Cost &
 * Time (EPE video programme, 2026-10-14). Gates: the wct-afe-1 contract is
 * built from a run the WCT services themselves compute on the Ekene kit's
 * Ekene-11 estimate (AFE 11,799,948 USD, the 11.8 MM the kit's economics
 * books); the source is compared by what it says; the EPE capex file carries
 * the contract last and the cash-flow engine ignores it (NPV identical with
 * and without the record); a refresh keeps the booked year, category and
 * basis and swaps the CAPEX row only. Negative controls: a different amount
 * moves the NPV (the gate can see a change), an unchanged source gives no
 * refresh, a run-less estimate is refused.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { computeCashFlow } from '../../../../../supabase/functions/_shared/epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG, PIA_WORKED_EXAMPLE_PROD, PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import { caseDocFromFile } from '../../WellCostTime/services/wctCaseFile';
import { runDeterministic, runMonteCarlo, ENGINE_VERSION } from '../../WellCostTime/services/wctRun';
import { buildWctAfeContract, compareWctWithSource, amountFor, WCT_AFE_SCHEMA } from '@/utils/wellcosttime/wctAfeContract';
import { epeRowsFromWctContract, wctProvenanceOf, wctFileName, wctProvenanceText, WCT_PROVENANCE_KEY } from '../epeWctIntake';
import { volumeRowsOf } from '../epeDcaIntake';
import { refreshRowsFor, replaceReceivedFile, receivedSourceOf, REFRESH_LABEL } from '../epeFileRefresh';
import { filesFromEstimate } from '../EpeWctImport';

const KIT = path.resolve(__dirname, '../../../../utils/wellcosttime/__tests__/ekene-11-well-cost.wct.json');
const caseDoc = () => caseDocFromFile(fs.readFileSync(KIT, 'utf8'));

/** A saved run row exactly as WctWorkstation.onSaveRun writes it. */
function runRow(doc, { id = 'run-1', created_at = '2026-10-14T08:00:00Z', withMc = true } = {}) {
  const res = runDeterministic({ caseDoc: doc });
  const mc = withMc ? runMonteCarlo({ caseDoc: doc }) : null;
  return {
    id, case_id: 'wct-1', design_id: 'des-1', created_at, engine_version: ENGINE_VERSION,
    results: {
      totals: res.program.totals,
      afe: { byItem: [], tangibleUsd: res.costs.tangibleUsd, intangibleUsd: res.costs.intangibleUsd, baseUsd: res.costs.baseUsd, contingencyUsd: res.costs.contingencyUsd, totalUsd: res.costs.totalUsd },
      mc: mc ? { iterations: mc.iterations, valid: mc.valid, cost: { p10: mc.cost.p10, p50: mc.cost.p50, p90: mc.cost.p90, mean: mc.cost.mean, stdDev: mc.cost.stdDev } } : null,
      warnings: res.warnings,
    },
  };
}
const CASE = { id: 'wct-1', name: 'Ekene-11 AFE', wellbore_id: 'wb-11', design_id: 'des-1', updated_at: '2026-10-14T07:59:00Z' };
const contractOf = (doc, opts) => buildWctAfeContract({ caseRow: CASE, runRow: runRow(doc, opts), wellbore: { id: 'wb-11', name: 'Ekene-11' }, design: { id: 'des-1', name: 'Plan 1' }, build: 'test' });

describe('the wct-afe-1 contract from the kit estimate', () => {
  it('carries the AFE WCT shows, its Monte Carlo and the well', () => {
    const made = contractOf(caseDoc());
    expect(made.ok).toBe(true);
    const k = made.contract;
    expect(k.schema).toBe(WCT_AFE_SCHEMA);
    expect(k.afe.totalUsd).toBeCloseTo(11799948.10, 1);
    expect(k.afe.label).toBe('AFE total (deterministic, with contingency)');
    expect(k.afe.baseUsd + k.afe.contingencyUsd).toBeCloseTo(k.afe.totalUsd, 6);
    expect(k.risk.p10Usd).toBeLessThan(k.risk.p50Usd);
    expect(k.risk.p50Usd).toBeLessThan(k.risk.p90Usd);
    expect(k.well).toEqual({ wellboreId: 'wb-11', wellboreName: 'Ekene-11', designId: 'des-1', designName: 'Plan 1' });
    expect(amountFor(k, 'p50')).toBe(k.risk.p50Usd);
    // the fingerprint is over what the estimate says, not who read it
    expect(buildWctAfeContract({ caseRow: CASE, runRow: runRow(caseDoc()), wellbore: { name: 'Ekene-11' }, design: { name: 'Plan 1' }, build: 'other' }).contract.fingerprint).toBe(k.fingerprint);
  });

  it('compares by content: unchanged, a newer run with a dearer rig, gone, refused', () => {
    const k = contractOf(caseDoc()).contract;
    expect(compareWctWithSource(k, contractOf(caseDoc())).state).toBe('unchanged');
    const doc = caseDoc();
    doc.costs.items[0].rate *= 1.1; // the first AFE item (the rig) ten percent dearer
    const dearer = contractOf(doc, { id: 'run-2', created_at: '2026-10-15T08:00:00Z' });
    const c = compareWctWithSource(k, dearer);
    expect(c.state).toBe('changed');
    expect(c.text).toMatch(/^The source changed since it was received \(the AFE total, now [\d,]+ USD/);
    expect(c.text).toMatch(/A newer run was saved\.$/);
    expect(c.now.afe.totalUsd).toBeGreaterThan(k.afe.totalUsd);
    expect(compareWctWithSource(k, null).state).toBe('missing');
    const none = buildWctAfeContract({ caseRow: CASE, runRow: null });
    expect(none).toEqual({ ok: false, reason: 'The estimate "Ekene-11 AFE" has no saved run. Save a run on its Report tab first.' });
    expect(compareWctWithSource(k, none).state).toBe('refused');
  });
});

describe('the EPE capex file', () => {
  const k = () => contractOf(caseDoc()).contract;
  const run = (capexRows) => computeCashFlow({ cfg: PIA_WORKED_EXAMPLE_CFG, prodRows: PIA_WORKED_EXAMPLE_PROD, capexRows, opexRows: PIA_WORKED_EXAMPLE_OPEX });

  it('one row in the spend year, the contract last; the engine never reads the record', () => {
    const data = epeRowsFromWctContract(k(), { year: 2027, receivedAt: '2026-10-14T09:00:00Z' });
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ year: 2027, category: 'Drilling', item: 'Ekene-11 drilling and completion (Well Cost & Time, AFE)', cost_usd: 11799948.1 });
    expect(data[1][WCT_PROVENANCE_KEY].booked).toEqual({ basis: 'afe', year: 2027, category: 'Drilling', amountUsd: 11799948.1 });
    expect(volumeRowsOf(data)).toEqual([data[0]]);
    expect(wctProvenanceOf({ data }).caseId).toBe('wct-1');
    const withRecord = run(data);
    const without = run([data[0]]);
    expect(withRecord.kpis.npv).toBe(without.kpis.npv);
    expect(withRecord.cashFlowData.map((r) => r.capex)).toEqual(without.cashFlowData.map((r) => r.capex));
    // negative control: the gate sees a different amount
    expect(run([{ ...data[0], cost_usd: data[0].cost_usd * 1.1 }]).kpis.npv).not.toBe(without.kpis.npv);
  });

  it('a risked basis books the Monte Carlo figure; a bad year is refused', () => {
    const c = k();
    expect(epeRowsFromWctContract(c, { year: 2027, basis: 'p90' })[0].cost_usd).toBeCloseTo(c.risk.p90Usd, 1);
    expect(() => epeRowsFromWctContract(c, { year: '' })).toThrow('Pick the year the money is spent.');
    const noMc = contractOf(caseDoc(), { withMc: false }).contract;
    expect(() => epeRowsFromWctContract(noMc, { year: 2027, basis: 'p50' })).toThrow(/no Monte Carlo result/);
  });

  it('the card text names the estimate, the AFE and what was booked', () => {
    const data = epeRowsFromWctContract(k(), { year: 2027, receivedAt: '2026-10-14T09:00:00Z' });
    const t = wctProvenanceText(wctProvenanceOf({ data }));
    expect(t).toMatch(/^From Well Cost & Time: estimate "Ekene-11 AFE" for Ekene-11, run saved 2026-10-14\. AFE 11,799,948 USD \(AFE total \(deterministic, with contingency\)\)\./);
    expect(t).toMatch(/Booked: AFE total \(deterministic, with contingency\), 11,799,948 USD in 2027 as Drilling\. Received 2026-10-14\.$/);
    expect(t).not.toMatch(/[—–]/);
    expect(wctFileName(k())).toBe('WCT - Ekene-11 AFE.generated');
  });

  it('Replace in the import dialog only touches files from the same estimate', () => {
    const data = epeRowsFromWctContract(k(), { year: 2027 });
    const files = [{ id: 'a', data }, { id: 'b', data: [{ year: 2027, category: 'Facilities', item: 'hook-up', cost_usd: 600000 }] }];
    expect(filesFromEstimate(files, 'wct-1').map((f) => f.id)).toEqual(['a']);
    expect(filesFromEstimate(files, 'other')).toEqual([]);
  });
});

describe('refresh from the estimate', () => {
  const file = () => ({ id: 'f-wct', case_id: 'c1', user_id: 'u1', file_name: 'WCT - Ekene-11 AFE.generated', data: epeRowsFromWctContract(contractOf(caseDoc()).contract, { year: 2028, category: 'Wells', basis: 'p50' }) });

  it('keeps the booked year, category and basis; the label names an estimate', () => {
    const f = file();
    expect(receivedSourceOf(f).kind).toBe('wct');
    expect(REFRESH_LABEL.wct).toBe('Take the new estimate');
    const doc = caseDoc();
    doc.costs.items[0].rate *= 1.1;
    const now = contractOf(doc, { id: 'run-2' });
    const state = compareWctWithSource(receivedSourceOf(f).provenance, now);
    const made = refreshRowsFor(f, state, { receivedAt: '2026-10-15T00:00:00Z' });
    expect(made.rows[0]).toMatchObject({ year: 2028, category: 'Wells', cost_usd: Math.round(now.contract.risk.p50Usd * 100) / 100 });
    expect(made.fileName).toBe('WCT - Ekene-11 AFE.generated');
    // negative control: an unchanged estimate gives no rows
    expect(refreshRowsFor(f, compareWctWithSource(receivedSourceOf(f).provenance, contractOf(caseDoc()))).error).toMatch(/has not changed/);
  });

  it('swaps the CAPEX row, with no scenario tag', async () => {
    const calls = [];
    const fake = { from: (t) => ({
      insert: (row) => { calls.push(['insert', t, row]); return { select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }) }; },
      delete: () => ({ eq: async (col, v) => { calls.push(['delete', t, col, v]); return { error: null }; } }),
    }) };
    await replaceReceivedFile(fake, file(), { rows: [{ year: 2028 }], fileName: 'WCT - Ekene-11 AFE.generated' }, 'u1');
    expect(calls[0]).toEqual(['insert', 'epe_capex', { case_id: 'c1', user_id: 'u1', file_name: 'WCT - Ekene-11 AFE.generated', data: [{ year: 2028 }] }]);
    expect(calls[1]).toEqual(['delete', 'epe_capex', 'id', 'f-wct']);
  });
});

// ---- the card ----
let mockWctNow = null;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) }, from: jest.fn() },
}));
jest.mock('@/utils/wellcosttime/wctAfeService', () => ({ getWctAfe: jest.fn(async () => mockWctNow) }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
// eslint-disable-next-line import/first
import EpeDataFileCard from '@/components/epe/EpeDataFileCard';

describe('the CAPEX file card', () => {
  it('prints the source, says it changed and offers Take the new estimate to the owner', async () => {
    const data = epeRowsFromWctContract(contractOf(caseDoc()).contract, { year: 2027 });
    const doc = caseDoc();
    doc.costs.items[0].rate *= 1.1;
    mockWctNow = contractOf(doc, { id: 'run-2' });
    render(<EpeDataFileCard file={{ id: 'f', case_id: 'c1', file_name: 'WCT - Ekene-11 AFE.generated', data, created_at: '2026-10-14T09:00:00Z' }} onRefreshed={() => {}} />);
    expect(screen.getByText(/Processed • 1 rows/)).toBeInTheDocument();
    expect(screen.getByTestId('epe-wct-provenance')).toHaveTextContent('From Well Cost & Time: estimate "Ekene-11 AFE" for Ekene-11');
    await waitFor(() => expect(screen.getByTestId('epe-wct-source-state')).toHaveTextContent(/The source changed since it was received \(the AFE total/));
    expect(screen.getByTestId('epe-wct-source-state')).toHaveTextContent('Press "Take the new estimate" to replace this file only');
    expect(screen.getByTestId('epe-file-refresh')).toHaveTextContent('Take the new estimate');
  });
  it('negative control: unchanged, no button', async () => {
    const data = epeRowsFromWctContract(contractOf(caseDoc()).contract, { year: 2027 });
    mockWctNow = contractOf(caseDoc());
    render(<EpeDataFileCard file={{ id: 'f', case_id: 'c1', file_name: 'x', data, created_at: '2026-10-14T09:00:00Z' }} onRefreshed={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('epe-wct-source-state')).toHaveTextContent('Unchanged since it was received.'));
    expect(screen.queryByTestId('epe-file-refresh')).toBeNull();
  });
});
