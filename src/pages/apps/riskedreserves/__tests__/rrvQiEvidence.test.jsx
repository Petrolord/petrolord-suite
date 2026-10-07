/**
 * Risked Reserves Valuation reads a QI Studio prospect record (qi-prospect-1)
 * by link: the QI evidence is shown beside the prospects, read only. It sets
 * no Pg and moves no number; a missing record says why.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, configure } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RrvWorkstation from '../components/RrvWorkstation';
import { makeInMemoryRrvBackend } from '../services/rrvBackend';
import { RRV_SEED_PROSPECTS } from '../services/rrvFixtures';

configure({ asyncUtilTimeout: 15000 });
jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

const RECORD = {
  contract: 'qi-prospect-1', app: 'QI Studio', project: { id: 'qp1', name: 'Keta QI' }, prospect: { id: 'p1', name: 'Ekene North', target: 'SAND A' },
  trap: { crest_depth_m: 2000, spill_depth_m: 2160, column_m: 160, area_km2: 1.2, grv_spill_m3: 98.2e6, limited_by_edge: false, surface: 'Top Sand A' },
  anomaly: { present: true, conformance: 0.96, inside_closure: 1, implied_contact_depth_m: 2100, grv_implied_m3: 39.3e6, source: 'RMS', threshold: 0.5, sense: 'high' },
  evidence: { independent: 2, items: [] }, competing: [], feasibility: 'feasible',
  assessment: { recommendation: 'mature', label: 'Mature: the QI evidence supports the prospect; carry it to volumetrics and risking', seismic_support: 'supports', reasons: ['The anomaly fits the structure (conformance 0.96).'] },
  qi_class: 'interpretation', computed_at: '2026-10-07T02:00:00Z',
};

test('the record is shown beside the prospects, and dismissed', async () => {
  const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
  backend._setQiProspect('qp1', 'p1', RECORD);
  render(<MemoryRouter initialEntries={['/?qiProject=qp1&qiProspect=p1']}><RrvWorkstation backend={backend} /></MemoryRouter>);
  const card = await screen.findByTestId('rrv-qi-card');
  expect(card).toHaveTextContent(/QI evidence for Ekene North \(Keta QI\): Mature/);
  expect(card).toHaveTextContent(/39\.3 million m3 to the contact the anomaly implies; 98\.2 million m3 to spill/);
  expect(card).toHaveTextContent(/does not set the chance of success/);
  fireEvent.click(screen.getByText('Dismiss'));
  await waitFor(() => expect(screen.queryByTestId('rrv-qi-card')).toBeNull());
});

test('a missing record says why', async () => {
  const backend = makeInMemoryRrvBackend(RRV_SEED_PROSPECTS);
  render(<MemoryRouter initialEntries={['/?qiProject=nope&qiProspect=p1']}><RrvWorkstation backend={backend} /></MemoryRouter>);
  expect(await screen.findByTestId('rrv-qi-card')).toHaveTextContent(/cannot be shown: The QI Studio project was not found/);
});
