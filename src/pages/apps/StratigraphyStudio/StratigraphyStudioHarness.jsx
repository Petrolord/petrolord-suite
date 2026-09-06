// Dev-only harness route (/dev/stratigraphy-studio, DEV builds only): the
// FULL Stratigraphy Studio app on the in-memory backend, no auth or DB.
// Wells and tops are the Well Correlation sample section, the column is a
// seeded four-unit column, so the Playwright suite can type a top, save a
// unit and toggle the terminology display.

import React, { useMemo } from 'react';
import StratWorkstation from './components/StratWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

export default function StratigraphyStudioHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <StratWorkstation backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
