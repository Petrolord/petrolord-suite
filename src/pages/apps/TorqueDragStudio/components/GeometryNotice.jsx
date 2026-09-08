// Hole-section provenance for the Drilling studios that run on the shared
// wp_wellbore_geometry spine (tester fix 2026-09-08). `geometryRow` is the
// resolved row from tdApi.getGeometry: `source` geometry | casing_programme
// | none, `label`, `note`. Renders nothing while loading or when the saved
// spine row is in use; an amber banner when the sections were derived from
// the Casing & Tubing programme; a red one when nothing was found, with
// links to the two places that can supply them. Shared by Torque & Drag,
// Hydraulics, Cementing and Well Control.

import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info } from 'lucide-react';

export function geometrySourceOf(geometryRow) {
  if (!geometryRow) return 'loading';
  if (geometryRow.source) return geometryRow.source;
  return geometryRow.hole_sections?.length ? 'geometry' : 'none';
}

export function geometryStatusText(geometryRow) {
  const source = geometrySourceOf(geometryRow);
  const n = geometryRow?.hole_sections?.length || 0;
  if (source === 'loading') return 'hole sections loading';
  if (source === 'none') return 'no hole sections';
  return `${n} hole section${n === 1 ? '' : 's'}${source === 'casing_programme' ? ' (from Casing & Tubing)' : ''}`;
}

export default function GeometryNotice({ geometryRow, testPrefix = 'td', showTorqueDragLink = true }) {
  const source = geometrySourceOf(geometryRow);
  if (source === 'loading' || source === 'geometry' || !geometryRow?.note) return null;
  const none = source === 'none';
  return (
    <div
      className={`flex items-start gap-2 border-b px-3 py-1.5 text-[11px] ${none ? 'border-red-900/60 bg-red-950/40 text-red-200' : 'border-amber-900/60 bg-amber-950/30 text-amber-200'}`}
      data-testid={`${testPrefix}-geometry-notice`} data-source={source}
    >
      {none ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        {geometryRow.note}
        {showTorqueDragLink && (
          <>
            {' '}
            <Link to="/dashboard/apps/drilling/torque-drag-studio" className="underline hover:text-white">Open Torque &amp; Drag Studio</Link>
            {' · '}
          </>
        )}
        {!showTorqueDragLink && ' '}
        <Link to="/dashboard/apps/drilling/casing-tubing-design-pro" className="underline hover:text-white">Open Casing &amp; Tubing Design Studio</Link>
      </span>
    </div>
  );
}
