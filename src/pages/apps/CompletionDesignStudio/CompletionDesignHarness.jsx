// Dev-only harness route (/dev/completion-design, DEV builds only): the
// FULL Completion Design Studio on the in-memory backend — no auth or DB.
// The seeded case is the ORACLE GOLDEN 3-1/2" completion in the golden
// 9-5/8" + 7" liner program on the slant well (packages/engines/test-data/
// drilling/goldens/completion_cases.json), so the Playwright suite asserts
// the ORACLE'S numbers off the rendered UI (clearances, through-bore,
// volumes, space-out). The registry-backed app mounts the same
// CdWorkstation on makeWpBackend.

import React, { useMemo } from 'react';
import CdWorkstation from './CdWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function CompletionDesignHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <CdWorkstation backend={backend} />
    </div>
  );
}
