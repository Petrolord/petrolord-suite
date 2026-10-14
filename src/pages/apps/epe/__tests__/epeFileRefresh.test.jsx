/**
 * Refresh one received production file from its source (EPE video
 * programme, 2026-10-13). A file whose source changed is replaced alone: the
 * new rows are the intake function's own rows from the current contract, the
 * hub profile keeps the first production year it was received with, and the
 * swap inserts the new row with the same case, owner and scenario tag before
 * deleting only the old row. Negative controls: an unchanged source gives no
 * rows and no button; a plain CSV upload is no received file.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { epeRowsFromHubContract, hubFileName } from '../epeHubIntake';
import { epeRowsFromContract, dcaFileName, volumeRowsOf } from '../epeDcaIntake';
import { refreshRowsFor, replaceReceivedFile, receivedSourceOf, REFRESH_LABEL, refreshHint } from '../epeFileRefresh';
import { buildHubCaseContract, compareHubWithSource } from '@/utils/forecastScenarioContract';
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { buildDcaForecastContract, compareWithSource } from '@/utils/declineCurve/dcaForecastContract';

const AT = '2026-10-13T12:00:00.000Z';
const SET = (qi = 450) => ({
  name: 'Ekene-11 forecast',
  startDate: '2027-04-01',
  econ: { pricePerBbl: 75, opexPerBbl: 4, discountRatePct: 10 },
  cases: [{ id: 'e11', name: 'Ekene-11', qi, declineAnnualPct: 54.79, b: 0.5, years: 21, economicLimit: 10 }],
});
const hubContract = (qi) => buildHubCaseContract({ projectId: 'h1', projectName: 'Ekene-11 forecast', payload: SET(qi), caseId: 'e11', build: 'b' }).contract;
const dcaContract = () => {
  let w = { ...sampleWell('p1'), id: 's1' };
  w = withStreamResults(w, 'oil', { fitResults: fitWell(w, 'oil', { now: new Date(AT) }).fit });
  w = withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: new Date(AT) }) });
  return buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { s1: w } }, wellId: 's1', stream: 'oil', build: 'test' }).contract;
};
const hubFile = () => ({ id: 'f-hub', case_id: 'c1', user_id: 'u1', scenario_label: null, file_name: hubFileName(hubContract(450)), data: epeRowsFromHubContract(hubContract(450), 2027, { receivedAt: AT }) });

describe('refreshRowsFor', () => {
  it('hub: the rows are the intake rows of the current contract from the received first year', () => {
    const file = hubFile();
    const state = compareHubWithSource(receivedSourceOf(file).provenance, { ok: true, contract: hubContract(315) });
    expect(state.state).toBe('changed');
    const made = refreshRowsFor(file, state, { receivedAt: AT, build: 'b' });
    const want = epeRowsFromHubContract(hubContract(315), 2027, { receivedAt: AT, build: 'b' });
    expect(made.rows).toEqual(want);
    expect(volumeRowsOf(made.rows)[0].year).toBe(2027);
    expect(made.fileName).toBe(hubFileName(hubContract(315)));
    // the new profile is the lower one
    const sum = (rows) => volumeRowsOf(rows).reduce((s, r) => s + r.oil_bbl, 0);
    expect(sum(made.rows)).toBeLessThan(sum(file.data));
  });

  it('dca: the rows are the intake rows of the current contract', () => {
    const c = dcaContract();
    const file = { id: 'f-dca', case_id: 'c1', scenario_label: '2P', file_name: dcaFileName(c), data: epeRowsFromContract(c, { receivedAt: AT }) };
    const now = { ...c, fingerprint: 'moved', forecast: { ...c.forecast, remaining: c.forecast.remaining * 0.8, annual: c.forecast.annual.map((y) => ({ ...y, volume: y.volume * 0.8 })) } };
    const state = compareWithSource(c, { ok: true, contract: now });
    expect(state.state).toBe('changed');
    const made = refreshRowsFor(file, state, { receivedAt: AT });
    expect(made.rows).toEqual(epeRowsFromContract(now, { receivedAt: AT }));
    expect(made.fileName).toBe(dcaFileName(now));
  });

  it('negative controls: an unchanged source and a plain upload give no rows', () => {
    const file = hubFile();
    const same = compareHubWithSource(receivedSourceOf(file).provenance, { ok: true, contract: hubContract(450) });
    expect(same.state).toBe('unchanged');
    expect(refreshRowsFor(file, same).error).toMatch(/has not changed/);
    expect(refreshRowsFor({ data: [{ year: 2027, oil_bbl: 10 }] }, { state: 'changed', now: {} }).error).toMatch(/not received/);
    expect(receivedSourceOf({ data: [{ year: 2027, oil_bbl: 10 }] })).toBeNull();
  });

  it('labels and the hint name the button', () => {
    expect(REFRESH_LABEL.hub).toBe('Take the new profile');
    expect(refreshHint('hub')).toBe('Press "Take the new profile" to replace this file only; the other files in the slot stay as they are.');
  });
});

describe('replaceReceivedFile', () => {
  it('inserts the new row with the same case, owner and scenario tag, then deletes only the old row', async () => {
    const calls = [];
    const fake = { from: (t) => ({
      insert: (row) => { calls.push(['insert', t, row]); return { select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }) }; },
      delete: () => ({ eq: async (col, v) => { calls.push(['delete', t, col, v]); return { error: null }; } }),
    }) };
    const file = { ...hubFile(), scenario_label: '2P' };
    const out = await replaceReceivedFile(fake, file, { rows: [{ year: 2027, oil_bbl: 1 }], fileName: 'FSH - x.generated' }, 'u1');
    expect(out).toEqual({ id: 'new' });
    expect(calls[0]).toEqual(['insert', 'epe_production_volumes', { case_id: 'c1', user_id: 'u1', file_name: 'FSH - x.generated', data: [{ year: 2027, oil_bbl: 1 }], scenario_label: '2P' }]);
    expect(calls[1]).toEqual(['delete', 'epe_production_volumes', 'id', 'f-hub']);
    expect(calls).toHaveLength(2);
  });
});

// ---- the card ----
let mockHubNow = null;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: jest.fn(() => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    })),
  },
}));
jest.mock('@/utils/forecastScenarioContract', () => {
  const actual = jest.requireActual('@/utils/forecastScenarioContract');
  return { ...actual, getHubCase: jest.fn(async () => ({ ok: true, contract: mockHubNow })) };
});
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
// eslint-disable-next-line import/first
import EpeDataFileCard from '@/components/epe/EpeDataFileCard';

describe('the file card', () => {
  it('a changed hub source offers the button, which replaces the file and reloads the slot', async () => {
    mockHubNow = hubContract(315);
    const onRefreshed = jest.fn();
    render(<EpeDataFileCard file={hubFile()} onRefreshed={onRefreshed} />);
    const btn = await screen.findByTestId('epe-file-refresh');
    expect(btn).toHaveTextContent('Take the new profile');
    expect(screen.getByTestId('epe-hub-source-state')).toHaveTextContent(/The source changed since it was received \(the case parameters, the volumes\)\. Press "Take the new profile" to replace this file only/);
    fireEvent.click(btn);
    await waitFor(() => expect(onRefreshed).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'File refreshed from its source' }));
  });

  it('negative controls: no button when unchanged, or on a read-only view', async () => {
    mockHubNow = hubContract(450);
    const { unmount } = render(<EpeDataFileCard file={hubFile()} onRefreshed={jest.fn()} />);
    await screen.findByText('Unchanged since it was received.');
    expect(screen.queryByTestId('epe-file-refresh')).toBeNull();
    unmount();
    mockHubNow = hubContract(315);
    render(<EpeDataFileCard file={hubFile()} />);
    await screen.findByText(/Import it again to take the new profile/);
    expect(screen.queryByTestId('epe-file-refresh')).toBeNull();
  });
});
