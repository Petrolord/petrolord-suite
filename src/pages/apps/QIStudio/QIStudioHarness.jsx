// Dev-only harness route (/dev/qi-studio, DEV builds only): the full QI Studio
// on the in-memory backend (three wells with different gaps, one volume) with
// no auth, no database and no record sharing. Saving reports that it is not
// switched on, which is the state before the migration.
import React, { useMemo } from 'react';
import QIStudio from './QIStudio';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function QIStudioHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return <QIStudio backend={backend} sharingStore={null} />;
}
