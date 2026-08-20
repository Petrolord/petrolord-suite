import React from 'react';
import { ShieldCheck, ShieldAlert, Grid2X2 } from 'lucide-react';
import { normalizeTag, LOCAL, UNKNOWN } from '@/lib/crs/tags';

/**
 * CRS status badge. Green = known system (shows the tag), amber =
 * unknown (placement unverified), gray = deliberate local grid.
 *
 * @param {{tag: ?string, name?: ?string, className?: string}} p
 */
export default function CrsBadge({ tag, name, className = '' }) {
  const t = normalizeTag(tag);
  if (t === UNKNOWN) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-amber-950/60 text-amber-300 border border-amber-700/50 ${className}`}
        title="No coordinate reference system is recorded for this data. Its placement against other data is unverified."
      >
        <ShieldAlert className="w-3 h-3" />
        CRS unknown
      </span>
    );
  }
  if (t === LOCAL) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-slate-800 text-slate-300 border border-slate-600 ${className}`}
        title="Local engineering grid. It can only be shown together with data on the same local grid."
      >
        <Grid2X2 className="w-3 h-3" />
        Local grid
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 ${className}`}
      title={name || t}
    >
      <ShieldCheck className="w-3 h-3" />
      {t}
    </span>
  );
}
