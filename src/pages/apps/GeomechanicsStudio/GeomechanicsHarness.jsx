// Dev-only harness route (/dev/geomechanics, DEV builds only): the FULL
// Geomechanics Studio on the in-memory backend — no auth or DB. The seeded
// case serves the ORACLE GOLDEN synthetic profile as published pp-1.0.0
// curves plus the golden slant trajectory (packages/engines/test-data/
// drilling/goldens/geomech_cases.json), so the Playwright suite asserts the
// ORACLE'S numbers off the rendered UI (collapse/frac-init EMW, tightest
// window, quality). The registry-backed app mounts the same GmWorkstation
// on makeWpBackend.

import React, { useMemo } from 'react';
import GmWorkstation from './GmWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function GeomechanicsHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <GmWorkstation backend={backend} />
    </div>
  );
}
