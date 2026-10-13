// A design's unsaved draft never reaches another design (2026-10-13, video
// dry run: a new design under Ekene-11 opened showing the previous
// design's S-profile, because the draft switched in an effect that ran
// after the Design tab had already loaded the new design).
import React, { useEffect } from 'react';
import { render } from '@testing-library/react';
import { WellPlanningProvider, useWellPlanning } from '../contexts/WellPlanningContext';

jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: () => {} }) }));

const seen = [];
// what a child's load effect sees, as DesignTab's does
const Probe = () => {
  const { wellId, trajectoryDraft } = useWellPlanning();
  useEffect(() => { seen.push({ wellId, segs: trajectoryDraft?.segments?.[0]?.id || null }); }, [wellId, trajectoryDraft]);
  return null;
};

beforeEach(() => { seen.length = 0; localStorage.clear(); });

test('switching to a design with no draft never shows the previous draft', () => {
  localStorage.setItem('well_planning_draft_A', JSON.stringify({ trajectory: { segments: [{ id: 'A-seg' }] } }));
  const { rerender } = render(<WellPlanningProvider wellId="A"><Probe /></WellPlanningProvider>);
  expect(seen[0]).toEqual({ wellId: 'A', segs: 'A-seg' });
  rerender(<WellPlanningProvider wellId="B"><Probe /></WellPlanningProvider>);
  expect(seen.filter((s) => s.wellId === 'B').every((s) => s.segs === null)).toBe(true);
});

test('switching to a design with its own draft shows that draft at once', () => {
  localStorage.setItem('well_planning_draft_A', JSON.stringify({ trajectory: { segments: [{ id: 'A-seg' }] } }));
  localStorage.setItem('well_planning_draft_B', JSON.stringify({ trajectory: { segments: [{ id: 'B-seg' }] } }));
  const { rerender } = render(<WellPlanningProvider wellId="A"><Probe /></WellPlanningProvider>);
  rerender(<WellPlanningProvider wellId="B"><Probe /></WellPlanningProvider>);
  const forB = seen.filter((s) => s.wellId === 'B');
  expect(forB[0].segs).toBe('B-seg');
  expect(forB.every((s) => s.segs === 'B-seg')).toBe(true);
});
