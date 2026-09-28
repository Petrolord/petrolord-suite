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
  // Design system: status roles only (every studio sits in the dashboard scope).
  const source = geometrySourceOf(geometryRow);
  if (source === 'loading' || source === 'geometry' || !geometryRow?.note) return null;
  const none = source === 'none';
  const link = 'underline hover:text-pl-text';
  return (
    <div
      className={`flex items-start gap-2 border-b px-3 py-1.5 text-[11px] ${none ? 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text' : 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text'}`}
      data-testid={`${testPrefix}-geometry-notice`} data-source={source}
    >
      {none ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        {geometryRow.note}
        {showTorqueDragLink && (
          <>
            {' '}
            <Link to="/dashboard/apps/drilling/torque-drag-studio" className={link}>Open Torque &amp; Drag Studio</Link>
            {' · '}
          </>
        )}
        {!showTorqueDragLink && ' '}
        <Link to="/dashboard/apps/drilling/casing-tubing-design-pro" className={link}>Open Casing &amp; Tubing Design Studio</Link>
      </span>
    </div>
  );
}
