/**
 * H1 (Reservoir honesty sweep): the right rail carried two "Integrations"
 * cards, NPV & Economics and FDP Accelerator. Pressing one waited about a
 * second and showed a green tick, while the function behind it logged to the
 * console and sent an empty payload nowhere. Nothing in the app may claim a
 * handoff that does not happen, so the cards and the placeholder senders are
 * gone until the DCA round builds a real sender.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import DeclineCurveAnalysis from '@/pages/apps/DeclineCurveAnalysis';

const SRC = path.resolve(__dirname, '../../..');

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('H1: DCA claims no handoff that does not happen', () => {
  it('the page offers no send-forecast control and no Integrations section', async () => {
    render(
      <MemoryRouter>
        <DeclineCurveAnalysis />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Decline Curve Analysis')).toBeInTheDocument();
    // The right rail is mounted (its Diagnostics section is there)...
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    // ...and holds no sync card.
    expect(screen.queryByRole('button', { name: /send forecast to/i })).toBeNull();
    expect(screen.queryByText('Integrations')).toBeNull();
    expect(screen.queryByText('NPV & Economics')).toBeNull();
    expect(screen.queryByText('FDP Accelerator')).toBeNull();
    expect(screen.queryByText(/Not synced|Synced:/)).toBeNull();
  });

  it('the placeholder senders that returned success without sending are deleted', () => {
    expect(fs.existsSync(path.join(SRC, 'utils/declineCurve/dcaIntegration.js'))).toBe(false);
    expect(fs.existsSync(path.join(SRC, 'components/declineCurve/DCAIntegrationPanel.jsx'))).toBe(false);
    const page = fs.readFileSync(path.join(SRC, 'pages/apps/DeclineCurveAnalysis.jsx'), 'utf8');
    expect(page).not.toMatch(/DCAIntegrationPanel/);
  });

  it('the help guide no longer describes cards that report a successful sync', () => {
    const help = fs.readFileSync(path.join(SRC, 'components/declineCurve/DCAHelpContent.jsx'), 'utf8');
    expect(help).not.toMatch(/report a successful\s+sync/);
    expect(help).toMatch(/has no direct send to another app yet/i);
  });
});
