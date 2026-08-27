// Dev-only harness route (/dev/casing-tubing, DEV builds only): the FULL
// Casing & Tubing Design Studio on the in-memory backend — no auth or DB.
// The seeded case is the ORACLE GOLDEN two-section 9-5/8 design on the
// golden slant trajectory (packages/engines/test-data/drilling/goldens/
// tubular_cases.json), so the Playwright suite recomputes expectations via
// ctRun + engines and asserts them off the rendered UI. The registry-backed
// app mounts the same content on makeWpBackend.

import React, { useMemo } from 'react';
import { CasingTubingDesignProvider } from './contexts/CasingTubingDesignContext';
import { CasingTubingDesignProContent } from './CasingTubingDesignPro';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function CasingTubingHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <CasingTubingDesignProvider backend={backend}>
      <CasingTubingDesignProContent />
    </CasingTubingDesignProvider>
  );
}
