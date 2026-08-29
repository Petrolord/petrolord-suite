/**
 * Economics E4 guards: Project Management Pro, AFE Cost Control Manager and
 * Technical Report Autopilot.
 *
 * Each of these had a surface that told the user something untrue, and each
 * fix is the kind that a later edit could quietly undo. These pin them.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ROOT = path.resolve(__dirname, '../../..');

const emptyResult = { data: [], error: null };
const makeQuery = () => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'in']
    .forEach((m) => { q[m] = jest.fn(chain); });
  q.single = jest.fn().mockResolvedValue({ data: null, error: null });
  q.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  q.then = (resolve, reject) => Promise.resolve(emptyResult).then(resolve, reject);
  return q;
};

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => makeQuery()),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'tester@example.com' }, session: null, loading: false }),
  SupabaseAuthProvider: ({ children }) => children,
}));

import ProjectManagementPro from '@/pages/apps/ProjectManagementPro';
import AfeCostControlManager from '@/pages/apps/AfeCostControlManager';
import { isServiceUnavailable, ServiceUnavailablePanel } from '@/pages/apps/TechnicalReportAutopilot';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

describe('Project Management Pro', () => {
  it('mounts', async () => {
    render(<MemoryRouter><ProjectManagementPro /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Project Management Pro' })).toBeInTheDocument();
  });

  it('no longer offers the external-systems hub that connected to nothing', async () => {
    render(<MemoryRouter><ProjectManagementPro /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Project Management Pro' });
    expect(screen.queryByText(/External Integrations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Jira Software/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SAP ERP/i)).not.toBeInTheDocument();
  });
});

describe('the PM Pro integration panels', () => {
  const dir = path.join(ROOT, 'components/projectmanagement/integrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsx'));
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

  it('claim no live connection', () => {
    // Each panel used to carry a green "Connected" badge for an app it never
    // contacted.
    const offenders = files.filter((f) => /\bConnected\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('never create a deliverable that is already approved or reviewed', () => {
    // A deliverable's status is a statement about work someone did. The
    // panels used to insert them as Approved or Under Review on the user's
    // behalf; only the deliverable manager, driven by the user, may set that.
    const offenders = files
      .filter((f) => f !== 'DeliverableManager.jsx')
      .filter((f) => /status: '(Approved|Under Review)'/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('no longer inserts invented engineering findings into the risk register', () => {
    // The PPFG panel used to write two risks naming an overpressure ramp "at
    // 3200m based on Eaton calculation", with a risk score of 20, tagged as
    // sourced from the PPFG app, having contacted nothing.
    const ppfg = read('PPFGIntegrationPanel.jsx');
    expect(ppfg).not.toMatch(/High Overpressure Zone Detected/);
    expect(ppfg).not.toMatch(/ppfg_source/);
    expect(ppfg).not.toMatch(/Eaton calculation/);
  });

  it('no longer pushes a mud window that was written into the source', () => {
    // The value survives in the comment recording what was removed, so this
    // checks the code: no safeWindow constant, and no task carrying a window.
    const geomech = read('GeomechIntegrationPanel.jsx');
    expect(geomech).not.toMatch(/const safeWindow/);
    expect(geomech).not.toMatch(/Implement Mud Window:/);
  });

  it('says plainly that there is no live link', () => {
    const panels = files.filter((f) => f.endsWith('IntegrationPanel.jsx'));
    expect(panels.length).toBeGreaterThan(0);
    panels.forEach((f) => {
      expect(read(f)).toMatch(/no live link to the app yet/);
    });
  });
});

describe('AFE Cost Control Manager', () => {
  it('mounts with its help guide', async () => {
    render(<MemoryRouter><AfeCostControlManager /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /AFE & Cost Control/i })).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('no longer ships two invented partner companies', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/afe/JVPartnerManagement.jsx'), 'utf8');
    // The names survive only in the comment explaining what was removed, so
    // check for the seeded state rather than the strings.
    expect(src).not.toMatch(/useState\(\[\s*\{\s*id: 1, name: 'Partner A Corp'/);
    expect(src).toMatch(/from\('afe_partners'\)/);
  });
});

describe('Technical Report Autopilot outage handling', () => {
  it('recognises an absent service rather than calling it a crash', () => {
    // The host behind this app returns a 404 HTML page on every path, so the
    // old error box printed Heroku's markup under the heading "crashed".
    expect(isServiceUnavailable('HTTP 404 on /trp/templates')).toBe(true);
    expect(isServiceUnavailable('Non-JSON response on /trp/templates\n<!DOCTYPE html>')).toBe(true);
    expect(isServiceUnavailable('TypeError: Failed to fetch')).toBe(true);
    expect(isServiceUnavailable('HTTP 503 on /trp/generate')).toBe(true);
    // After the 2026-08-29 rebuild the same panel covers an edge function
    // that is unreachable, unconfigured, or whose model call failed.
    expect(isServiceUnavailable('Edge Function returned a non-2xx status code')).toBe(true);
    expect(isServiceUnavailable('Report generation is not configured: set the OPENAI_API_KEY function secret.')).toBe(true);
    expect(isServiceUnavailable('LLM request failed (429)')).toBe(true);
  });

  it('still treats a real application error as an error', () => {
    expect(isServiceUnavailable('Templates payload shape invalid')).toBe(false);
    expect(isServiceUnavailable('HTTP 400 on /trp/generate')).toBe(false);
  });

  it('explains the outage without blaming the user, and keeps the brief usable', () => {
    render(<ServiceUnavailablePanel detail="HTTP 404 on /trp/templates" />);
    expect(screen.getByText(/Report generation is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing you entered caused this/i)).toBeInTheDocument();
    expect(screen.getByText(/save it as a project/i)).toBeInTheDocument();
  });
});
