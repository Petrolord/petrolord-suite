import React from 'react';

// The CRS check of a prepared well (QI round 3, F3 benchmark F-2): a note
// when the well's position was converted or could not be verified; nothing
// when the well and the volume share a CRS.
export default function WellCrsNote({ well }) {
  const c = well?.crs;
  if (!c?.note || c.status === 'same') return null;
  return <span className={`block ${c.status === 'unverified' && !/neither the well nor the volume/.test(c.note) ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid={`qi-well-crs-${well.name}`}>{c.note}</span>;
}
