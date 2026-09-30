// Dev-only harness route (/dev/contour-map-digitizer, DEV builds only;
// MAP-U1-028): the full Contour Map Digitizer on an in-memory backend, so
// the browser path (drop a scan, georeference, draw, drag-assign values,
// grid, publish, save and reload a project) runs without auth or a
// database. The in-memory store is on window.__DIGITIZER_BACKEND__ for the
// e2e to read back what was published.

import React, { useMemo } from 'react';
import ContourMapDigitizer from './ContourMapDigitizer';
import { makeInMemoryDigitizerBackend } from '@/lib/digitizer/digitizerBackend';

export default function ContourMapDigitizerHarness() {
  const backend = useMemo(() => makeInMemoryDigitizerBackend(), []);
  if (typeof window !== 'undefined') window.__DIGITIZER_BACKEND__ = backend;
  return <ContourMapDigitizer backend={backend} mappingPath="/dev/mapping-surface-studio" />;
}
