// Dev-only harness route (/dev/well-integrity, DEV builds only): the
// FULL Well Integrity & P&A Studio on the in-memory backend, no auth or
// DB. The seeded case is the ORACLE GOLDEN barrier/annulus/P&A design on
// the slant well
// (packages/engines/test-data/drilling/goldens/wellintegrity_cases.json),
// so the Playwright suite asserts the ORACLE'S numbers off the rendered
// UI. The registry-backed app mounts the same WiWorkstation on
// makeWpBackend.

import React, { useMemo } from 'react';
import WiWorkstation from './WiWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function WellIntegrityPAHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <WiWorkstation backend={backend} />
    </div>
  );
}
