/**
 * Technical Report Autopilot after the rebuild (2026-08-29).
 *
 * The app's backend host had ceased to exist, so its whole generation path
 * was unreachable on an Active tile. The owner's decision was to rebuild onto
 * Supabase edge functions. These guard the three things that decision turned
 * on: the dead host is gone from the tree, the app opens without any network
 * call at all, and a failure to generate is still reported as an outage
 * rather than as the user's mistake.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ROOT = path.resolve(__dirname, '../../..');

// Prefixed `mock` so jest allows the factory below to reference it.
const mockInvoke = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })) })),
      insert: jest.fn(() => ({ select: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null }) })),
      update: jest.fn(() => ({ eq: jest.fn(() => ({ select: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null }) })) })),
    })),
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'tester@example.com' }, session: null, loading: false }),
  SupabaseAuthProvider: ({ children }) => children,
}));

import TechnicalReportAutopilot from '@/pages/apps/TechnicalReportAutopilot';
import {
  REPORT_TEMPLATES, sectionsFor, selectedSectionsFor,
} from '@/data/reportAutopilotTemplates';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

beforeEach(() => { mockInvoke.mockReset(); });

const mount = () => render(<MemoryRouter><TechnicalReportAutopilot /></MemoryRouter>);

describe('the dead host is gone', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  it('no report autopilot file calls the retired Heroku service', () => {
    const files = [
      'pages/apps/TechnicalReportAutopilot.jsx',
      'components/reportautopilot/InputPanel.jsx',
      'components/reportautopilot/PreviewPanel.jsx',
      'components/reportautopilot/EmptyState.jsx',
    ];
    const offenders = files.filter((f) => /herokuapp\.com/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('generation goes through the Suite edge function', () => {
    expect(read('pages/apps/TechnicalReportAutopilot.jsx')).toMatch(/functions\.invoke\('report-autopilot'/);
  });
});

describe('templates', () => {
  it('are client-side, so the app needs no network call to open', () => {
    expect(REPORT_TEMPLATES.types.length).toBeGreaterThan(0);
    REPORT_TEMPLATES.types.forEach((t) => {
      expect(sectionsFor(t.id).length).toBeGreaterThan(0);
    });
  });

  it('give every section an id, a name and a brief for the writer', () => {
    REPORT_TEMPLATES.types.forEach((t) => {
      sectionsFor(t.id).forEach((s) => {
        expect(s.id).toBeTruthy();
        expect(s.name).toBeTruthy();
        expect(s.brief.length).toBeGreaterThan(20);
      });
    });
  });

  it('return the chosen sections in the report order, not the click order', () => {
    const type = REPORT_TEMPLATES.types[0].id;
    const all = sectionsFor(type).map((s) => s.id);
    const reversed = [...all].reverse();
    expect(selectedSectionsFor(type, reversed).map((s) => s.id)).toEqual(all);
  });

  it('ignore a section id that is not part of the type', () => {
    const type = REPORT_TEMPLATES.types[0].id;
    expect(selectedSectionsFor(type, ['not_a_section'])).toEqual([]);
    expect(selectedSectionsFor('no_such_type', ['exec_summary'])).toEqual([]);
  });
});

describe('the page', () => {
  it('opens straight into the brief, with no loading spinner waiting on a service', async () => {
    mount();
    // The name appears as the page h1 and again in the Helmet title node.
    expect(await screen.findByRole('heading', { level: 1, name: 'Technical Report Autopilot' })).toBeInTheDocument();
    // Templates are local, so the report type list is populated on first paint.
    // The type appears in the select trigger and again in its option list.
    expect((await screen.findAllByText(REPORT_TEMPLATES.types[0].name)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Loading Autopilot/i)).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows the empty state rather than an outage on a healthy load', async () => {
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Technical Report Autopilot' });
    await waitFor(() => {
      expect(screen.queryByText(/Report generation is unavailable/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Autopilot crashed/i)).not.toBeInTheDocument();
  });
});
