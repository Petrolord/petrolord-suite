// Dev-only harness route (/dev/perforation-sand-control, DEV builds only):
// the FULL Perforation & Sand Control Designer on the in-memory backend,
// no auth or DB. The seeded case is the ORACLE GOLDEN perforation on the
// slant well with the golden sieve, the D7 golden completion linked for
// through-tubing clearance, and the golden profile served as published
// gm-1.0.0/pp-1.0.0 curves (packages/engines/test-data/drilling/goldens/
// perfsand_cases.json), so the Playwright suite asserts the ORACLE'S
// numbers off the rendered UI. The registry-backed app mounts the same
// PsWorkstation on makeWpBackend.

import React, { useMemo } from 'react';
import PsWorkstation from './PsWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function PerforationSandControlHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <PsWorkstation backend={backend} />
    </div>
  );
}
