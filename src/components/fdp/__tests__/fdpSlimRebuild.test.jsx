/**
 * FDP Accelerator slim rebuild guards (Economics E3).
 *
 * Two kinds of check. The first mounts the app and proves the real sections
 * are there and the deleted theatre is not, because the failure mode this
 * phase most needs to prevent is a module quietly coming back. The second
 * checks the tree itself: no file may reference the mock data or the fake
 * cross-app importers again, and no user-facing string may claim a sync that
 * does not happen.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ROOT = path.resolve(__dirname, '../../..');

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import FDPAccelerator from '@/pages/apps/FDPAccelerator';
import { openItems } from '@/components/fdp/layout/MainLayout';
import { exampleSchedule, exampleCosts, exampleWells } from '@/services/fdp/exampleData';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

beforeEach(() => { localStorage.clear(); });

const mount = () => render(<MemoryRouter><FDPAccelerator /></MemoryRouter>);

describe('FDP Accelerator after the slim rebuild', () => {
  it('mounts with the real plan sections in the sidebar', async () => {
    mount();
    // Several labels appear twice, in the sidebar and again as the open
    // module's heading, so count rather than expecting one.
    for (const label of [
      'Field Overview', 'Subsurface', 'Concepts', 'Scenarios', 'Wells & Drilling',
      'Facilities', 'Schedule', 'Economics', 'HSE', 'Community', 'Risk Management', 'Documents',
    ]) {
      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
    }
  });

  it('no longer offers the deleted theatre sections', async () => {
    mount();
    await screen.findAllByText('Field Overview');
    for (const gone of [
      'Optimization', 'Workflow & Tasks', 'Collaboration', 'Mobile App',
      'API Integration', 'Training Academy', 'Help Center',
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it('carries the saved-plan rail, the autosave control and a real help guide', async () => {
    mount();
    expect(await screen.findByText('Saved plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('shows what the plan is still missing, from the plan itself', async () => {
    mount();
    expect(await screen.findByText('Plan status')).toBeInTheDocument();
    // A brand new plan is empty, so every item is outstanding.
    expect(screen.getByText(/Name the field on the Field Overview tab/i)).toBeInTheDocument();
    expect(screen.getByText(/Add at least one well on the Wells tab/i)).toBeInTheDocument();
    // And the fabrications that used to sit here are gone.
    expect(screen.queryByText(/Active Integrations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pending validation from the engineering team/i)).not.toBeInTheDocument();
  });

  it('loads example data, and the button says example rather than sync', async () => {
    mount();
    // The example button is labelled for what it does. The old one said
    // "Sync Data" and claimed to have fetched the user's own field.
    const buttons = await screen.findAllByRole('button', { name: /Load example/i });
    expect(buttons.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Sync Data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sync Apps/i })).not.toBeInTheDocument();

    // Before: the plan has no reserves, so the panel says so.
    expect(screen.getByText(/Enter P50 reserves on the Subsurface tab/i)).toBeInTheDocument();

    // Loading the example really writes to the plan (the toast itself renders
    // through the app-level Toaster, which is not mounted here, so the state
    // change is what this asserts).
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.queryByText(/Enter P50 reserves on the Subsurface tab/i)).not.toBeInTheDocument();
    });
  });
});

describe('openItems', () => {
  const empty = {
    fieldData: { fieldName: '' },
    subsurface: { reserves: { summary: { p50: 0 } } },
    wells: { list: [] },
    facilities: { list: [] },
    costs: { items: [] },
    schedule: { activities: [] },
    risks: [],
  };

  it('lists every section of an empty plan', () => {
    expect(openItems(empty)).toHaveLength(7);
  });

  it('clears an item once that section has data', () => {
    const withWells = { ...empty, wells: { list: [{ id: 'w1' }] } };
    expect(openItems(withWells).some((i) => /Wells tab/.test(i))).toBe(false);
  });

  it('reads reserves from where the state actually keeps them', () => {
    // The old right panel read `reserves.p50` and printed undefined; the
    // state nests it under `summary`.
    const withReserves = { ...empty, subsurface: { reserves: { summary: { p50: 115 } } } };
    expect(openItems(withReserves).some((i) => /P50 reserves/.test(i))).toBe(false);
  });

  it('says nothing is outstanding only when every section is filled', () => {
    const full = {
      fieldData: { fieldName: 'Alpha' },
      subsurface: { reserves: { summary: { p50: 115 } } },
      wells: { list: [{}] },
      facilities: { list: [{}] },
      costs: { items: [{}] },
      schedule: { activities: [{}] },
      risks: [{}],
    };
    expect(openItems(full)).toEqual([]);
  });
});

describe('example data', () => {
  it('is dated relative to now, so the schedule never reads as stale', () => {
    const a = exampleSchedule(new Date('2030-01-01'));
    const b = exampleSchedule(new Date('2031-01-01'));
    expect(a[0].start).toBe('2030-01-01');
    expect(b[0].start).toBe('2031-01-01');
  });

  it('returns fresh objects each call, so loading twice cannot alias state', () => {
    const first = exampleCosts();
    first[0].amount = 999;
    expect(exampleCosts()[0].amount).not.toBe(999);
  });

  it('carries the wells the plan needs to compute anything', () => {
    const wells = exampleWells();
    expect(wells.length).toBeGreaterThan(0);
    wells.forEach((w) => {
      expect(w.name).toBeTruthy();
      expect(w.tvd).toBeGreaterThan(0);
    });
  });
});

describe('the deleted seams stay deleted', () => {
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip the tests themselves: this file quotes the retired claims in
        // order to forbid them.
        if (entry.name !== '__tests__') walk(full, out);
      }
      else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  const sources = walk(path.join(ROOT, 'components/fdp'))
    .concat(walk(path.join(ROOT, 'services/fdp')))
    .concat([path.join(ROOT, 'contexts/FDPContext.jsx')]);

  it('no FDP file imports the deleted mock data or importers', () => {
    const banned = [
      'mockCollaborationData', 'mockWorkflowData', 'mockTrainingData', 'mockHelpData',
      'mockOptimizationData', 'mockAnalyticsData',
      'DataImporter', 'SubsurfaceDataImporter', 'WellDataImporter',
      'FacilitiesDataImporter', 'CostDataImporter', 'HSEDataImporter',
      'ScheduleDataImporter', 'OptimizationService', 'CollaborationService',
      'WorkflowService', 'IntegrationService',
    ];
    const offenders = [];
    for (const file of sources) {
      const src = fs.readFileSync(file, 'utf8');
      for (const name of banned) {
        if (src.includes(`fdp/${name}`) || src.includes(`{ ${name} }`)) {
          offenders.push(`${path.relative(ROOT, file)} -> ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no FDP file claims to sync or import from another Suite app', () => {
    // The exact claims that were false. A file that wants to say one of these
    // again has to make it true first.
    const banned = [
      /Import Successful/,
      /updated from Geoscience/,
      /Connecting to Well Design Studio/,
      /Importing from AFE/,
      /Syncing with HSE Management System/,
      /Loading plan from Project Management Pro/,
      /Connecting to reservoir engines/,
    ];
    const offenders = [];
    for (const file of sources) {
      const src = fs.readFileSync(file, 'utf8');
      for (const pattern of banned) {
        // The example-data module documents what it replaced; that is a
        // comment about history, not a claim, and it is the one exemption.
        if (pattern.test(src) && !file.endsWith('exampleData.js')) {
          offenders.push(`${path.relative(ROOT, file)} -> ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
