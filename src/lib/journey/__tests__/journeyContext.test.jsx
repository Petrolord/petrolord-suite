// JourneyProvider: loads once signed in, acknowledges work that existed before
// the record, never writes while impersonating, and follows the mockProject.
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { JourneyProvider, useJourney } from '@/contexts/JourneyContext';

const mockAuth = { user: { id: 'u1' }, isImpersonating: false };
let mockProject = { current: { id: 'p1' } };
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/contexts/ProjectContext', () => ({ useProject: () => mockProject }));
jest.mock('@/hooks/usePurchasedModules', () => ({
  usePurchasedModules: () => ({ isAllowed: () => true, isModuleActive: (m) => m === 'geoscience', loading: false }),
}));
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const STATE = {
  user: { display_name: 'Ayo', created_at: '2025-01-01T00:00:00Z' },
  org: { id: 'o1', name: 'Lordsway Energy', role: 'owner', joined_at: '2025-01-01T00:00:00Z', member_count: 6 },
  projects: { real: 1, shared_with_me: 0 },
  work: { seismolord: { any: true, in_project: false } },
  journey: { guidance: 'guide', disciplines: [], missing: true },
};

function service() {
  return {
    fetchJourneyState: jest.fn(async () => STATE),
    setJourney: jest.fn(async (p) => ({ guidance: p.guidance || 'guide', disciplines: p.disciplines || [] })),
    markJourney: jest.fn(async () => ({})),
  };
}
let seen;
function Probe() { seen = useJourney(); return null; }

beforeEach(() => { mockAuth.isImpersonating = false; mockProject = { current: { id: 'p1' } }; });

test('loads, greets by name and acknowledges pre-existing seismic once', async () => {
  const svc = service();
  render(<JourneyProvider service={svc}><Probe /></JourneyProvider>);
  await waitFor(() => expect(seen.journey).not.toBeNull());
  expect(svc.fetchJourneyState).toHaveBeenCalledWith({ projectId: 'p1' });
  expect(seen.greeting.name).toBe('Ayo');
  expect(seen.journey.disciplines).toEqual(['geoscience']);   // inferred from the one open module
  expect(svc.markJourney).toHaveBeenCalledWith('acknowledged', 'after_first:seismic');
  expect(svc.markJourney).toHaveBeenCalledTimes(1);
});

test('impersonating: reads, never writes (no baseline, no guidance change)', async () => {
  mockAuth.isImpersonating = true;
  const svc = service();
  render(<JourneyProvider service={svc}><Probe /></JourneyProvider>);
  await waitFor(() => expect(seen.journey).not.toBeNull());
  await act(async () => { await seen.setGuidance('quiet'); await seen.mark('dismissed', 'x'); });
  expect(svc.markJourney).not.toHaveBeenCalled();
  expect(svc.setJourney).not.toHaveBeenCalled();
});

test('quiet mode is written and reflected at once', async () => {
  const svc = service();
  render(<JourneyProvider service={svc}><Probe /></JourneyProvider>);
  await waitFor(() => expect(seen.journey).not.toBeNull());
  await act(async () => { await seen.setGuidance('quiet'); });
  expect(svc.setJourney).toHaveBeenCalledWith({ guidance: 'quiet' });
  expect(seen.journey.guidance).toBe('quiet');
});

test('outside a provider guidance is off', () => {
  render(<Probe />);
  expect(seen.journey).toBeNull();
});
