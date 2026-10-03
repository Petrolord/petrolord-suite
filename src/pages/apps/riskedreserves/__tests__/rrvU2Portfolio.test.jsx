/**
 * U2-009 on the Risked Reserves screen (jsdom): "Send to Capital Portfolio"
 * on a saved valuation, own or shared. Capital Portfolio Studio reads the
 * SAVED row by its id, so the action waits for a save, and a colleague's
 * shared valuation goes as read-only provenance.
 */
import React from 'react';
import {
  render, screen, fireEvent, waitFor, configure,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RrvWorkstation, { CP_PATH } from '../components/RrvWorkstation';
import { makeInMemoryRrvBackend } from '../services/rrvBackend';
import { RRV_SEED_PROSPECTS } from '../services/rrvFixtures';
import { ekeneNorthRowBody } from '../services/rrvPortfolioFixtures';

configure({ asyncUtilTimeout: 15000 });

jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

const mount = (backend, props = {}) => render(<MemoryRouter><RrvWorkstation backend={backend} {...props} /></MemoryRouter>);
const el = (id) => screen.getByTestId(id);
const settled = () => waitFor(() => expect(el('rrv-save-state').textContent).not.toMatch(/Checking/));
const saved = (o = {}) => makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { valuations: [ekeneNorthRowBody()], ...o });

describe('U2-009: Send to Capital Portfolio', () => {
  test('a saved valuation links to Capital Portfolio Studio by its id', async () => {
    mount(saved());
    await settled();
    await waitFor(() => expect(el('rrv-send-portfolio').tagName).toBe('A'));
    const a = el('rrv-send-portfolio');
    expect(a.getAttribute('href')).toBe(`${CP_PATH}?rrvValuation=valuation-1`);
    expect(a.getAttribute('title')).toMatch(/success-case mean value, Pg, the well cost as the budget line/);
  });

  test('the harness sends to the Capital Portfolio harness', async () => {
    mount(saved(), { cpHref: '/dev/capital-portfolio-studio' });
    await settled();
    await waitFor(() => expect(el('rrv-send-portfolio').getAttribute('href')).toBe('/dev/capital-portfolio-studio?rrvValuation=valuation-1'));
  });

  test('an edit not yet saved holds the action until it is saved', async () => {
    mount(saved());
    await settled();
    await waitFor(() => expect(el('rrv-send-portfolio').tagName).toBe('A'));
    fireEvent.change(el('rrv-wellCost-Ekene North'), { target: { value: '30' } });
    fireEvent.blur(el('rrv-wellCost-Ekene North'));
    await waitFor(() => expect(el('rrv-send-portfolio').tagName).toBe('BUTTON'));
    expect(el('rrv-send-portfolio').disabled).toBe(true);
    expect(el('rrv-send-portfolio').getAttribute('title')).toMatch(/Save your edits first/);
    fireEvent.click(el('rrv-save'));
    await waitFor(() => expect(el('rrv-send-portfolio').tagName).toBe('A'));
  });

  test('a valuation kept in the browser only cannot be sent, and says why', async () => {
    mount(makeInMemoryRrvBackend(RRV_SEED_PROSPECTS, { table: false }));
    await settled();
    fireEvent.click(el('rrv-add'));
    await waitFor(() => expect(el('rrv-send-portfolio').disabled).toBe(true));
    expect(el('rrv-send-portfolio').getAttribute('title')).toMatch(/Save the valuation to your account first/);
  });

  test('a colleague\'s shared valuation is sent as read-only provenance', async () => {
    mount(saved({ sharedValuations: true, sharedRows: true }));
    await settled();
    fireEvent.click(await screen.findByTestId('rrv-row-Ada Deep (shared)'));
    await waitFor(() => expect(el('rrv-send-portfolio').getAttribute('href')).toBe(`${CP_PATH}?rrvValuation=valuation-shared`));
    expect(el('rrv-send-portfolio').getAttribute('title')).toMatch(/read-only provenance: the valuation stays theirs/);
  });
});
