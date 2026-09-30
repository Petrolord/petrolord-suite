// Dev-only harness route (/dev/well-correlation, DEV builds only): the
// FULL Well Correlation app on the in-memory backend — no auth or DB.
// The seeded 3-well synthetic section (services/sampleSection.js) lets
// the Playwright suite assert exact geometry: flatten on Top Dome and
// the correlation line is flat across all wells (shifts 0/-40/+30).
// The registry-backed app (G3.3 tile) mounts the same
// CorrelationWorkstation on makeRegistryBackend.
//
// AppUpgrade WC-U1 (2026-09-29): ?scaleWells=<n> adds n ten-curve wells
// (PL10), ?sample=0 drops the KETA wells, and an e2e can seed hostile wells
// and a saved section from the evidence kit through window.__CORR_SEED__
// ({ wells, section }) set by an init script before the page loads.

import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import CorrelationWorkstation from './components/CorrelationWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';
import { scaleWells } from './services/scaleSection';

export default function WellCorrelationHarness() {
  const [params] = useSearchParams();
  const n = Number(params.get('scaleWells')) || 0;
  const sample = params.get('sample') !== '0';
  const backend = useMemo(() => {
    const seed = (typeof window !== 'undefined' && window.__CORR_SEED__) || {};
    return makeInMemoryBackend({ sample, seedWells: [...(seed.wells || []), ...scaleWells(n)], section: seed.section || null, sections: seed.sections || [] });
  }, [n, sample]);
  return (
    <div className="h-screen w-full overflow-hidden" data-testid="corr-theme-scope">
      <CorrelationWorkstation backend={backend} wellDataManagerPath="/dev/well-data-manager" mappingPath="/dev/mapping-surface-studio" />
    </div>
  );
}
