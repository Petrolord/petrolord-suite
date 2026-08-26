// Dev-only harness route (/dev/torque-drag, DEV builds only): the FULL
// Torque & Drag Studio on the in-memory backend — no auth or DB. The seeded
// case IS the oracle golden horizontal well (packages/engines/test-data/
// drilling/goldens/torquedrag_cases.json), so the Playwright suite asserts
// the ORACLE'S numbers off the rendered UI (hookload, torque, buckling
// onset, casing wear). The registry-backed app mounts the same
// TDWorkstation on makeWpBackend.

import React, { useMemo } from 'react';
import TDWorkstation from './TDWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function TorqueDragHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <TDWorkstation backend={backend} />
    </div>
  );
}
