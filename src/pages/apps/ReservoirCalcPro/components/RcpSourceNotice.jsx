// "Source changed" in ReservoirCalc Pro (2026-10-12): the shared notice
// over the inputs, for zone averages, footprint areas, surfaces and
// boundary AOIs taken from the shared registry. Nothing shows for a
// workspace that took nothing from the registry.
import React from 'react';
import SourceChangedNotice, { StaleResultsMark } from '@/lib/sourceFreshness/SourceChangedNotice';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';

export default function RcpSourceNotice() {
  const { sources } = useReservoirCalc();
  if (!sources?.refs?.length) return null;
  return (
    <SourceChangedNotice
      items={sources.items}
      checking={sources.checking}
      checkedAt={sources.checkedAt}
      error={sources.error}
      onCheck={sources.check}
      onRefresh={sources.refresh}
      onKeep={sources.keep}
      title="Registry source changed"
      testId="rcp-source-changed"
      compact
    />
  );
}

/** The mark on the results panel while a source the results use needs attention. */
export function RcpStaleResultsMark() {
  const { sources } = useReservoirCalc();
  return <StaleResultsMark text={sources?.staleText || null} testId="rcp-source-stale" />;
}
