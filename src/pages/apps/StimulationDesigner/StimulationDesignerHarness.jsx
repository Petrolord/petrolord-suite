// Dev-only harness route (/dev/stimulation, DEV builds only): the FULL
// Stimulation Designer on the in-memory backend, no auth or DB. The
// seeded case is the ORACLE GOLDEN frac + acid design on the slant well,
// with the golden profile served as published gm-1.0.0/pp-1.0.0 curves
// (packages/engines/test-data/drilling/goldens/stim_cases.json), so the
// Playwright suite asserts the ORACLE'S numbers off the rendered UI. The
// registry-backed app mounts the same StWorkstation on makeWpBackend.

import React, { useMemo } from 'react';
import StWorkstation from './StWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function StimulationDesignerHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <StWorkstation backend={backend} />
    </div>
  );
}
