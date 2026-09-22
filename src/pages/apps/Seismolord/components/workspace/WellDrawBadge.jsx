// Explorer well-row badge (tester feedback 2026-09-22): a visible well
// that cannot be drawn on the seismic says why, on the row itself. The
// reason text comes from lib/wellDisplay WELL_REASONS (or the CRS guard).

import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * @param {Object} p
 * @param {?{drawn: boolean, reason?: string}} p.status
 * @param {string} p.wellId
 */
export default function WellDrawBadge({ status, wellId }) {
  if (!status || status.drawn) return null;
  return (
    <span
      className="shrink-0 inline-flex items-center text-amber-400"
      title={status.reason}
      aria-label={status.reason}
      role="img"
      data-testid={`sl-well-warn-${wellId}`}
    >
      <AlertTriangle className="w-3.5 h-3.5" />
    </span>
  );
}

/** Row tooltip: TD plus how the well reaches the seismic, or why not. */
export function wellRowTitle(well, status) {
  const parts = [];
  if (well.td_md_m) parts.push(`TD ${Math.round(well.td_md_m)} m MD`);
  if (status?.drawn) {
    parts.push(status.source === 'checkshots'
      ? 'Drawn in time from its checkshots'
      : 'Drawn in time through the volume velocity model');
  } else if (status?.reason) {
    parts.push(`Not drawn on the seismic. ${status.reason}`);
  }
  return parts.length ? parts.join('. ') : undefined;
}
