import React from 'react';
import { ShieldCheck, ShieldAlert, Grid2X2 } from 'lucide-react';
import { normalizeTag, LOCAL, UNKNOWN } from '@/lib/crs/tags';
import { useThemeClass } from '@/design/themeClass';

// Design system: themed class strings for tc() (see src/design/themeClass.js).
// Outside an opted-in scope tc() returns the legacy string unchanged.
const THEMED_CLASSES = {
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-amber-950/60 text-amber-300 border border-amber-700/50 ":
    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-pl-warning-bg text-pl-warning-text border border-pl-warning/50 ",
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-slate-800 text-slate-300 border border-slate-600 ":
    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-pl-sunken text-pl-text border border-pl-border-strong ",
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 ":
    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-pl-success-bg text-pl-success-text border border-pl-success/50 ",
};

/**
 * CRS status badge. Green = known system (shows the tag), amber =
 * unknown (placement unverified), gray = deliberate local grid.
 *
 * @param {{tag: ?string, name?: ?string, className?: string}} p
 */
export default function CrsBadge({ tag, name, className = '' }) {
  const tc = useThemeClass(THEMED_CLASSES);
  const t = normalizeTag(tag);
  if (t === UNKNOWN) {
    return (
      <span
        className={`${tc("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-amber-950/60 text-amber-300 border border-amber-700/50 ")}${className}`}
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
        className={`${tc("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-slate-800 text-slate-300 border border-slate-600 ")}${className}`}
        title="Local engineering grid. It can only be shown together with data on the same local grid."
      >
        <Grid2X2 className="w-3 h-3" />
        Local grid
      </span>
    );
  }
  return (
    <span
      className={`${tc("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 ")}${className}`}
      title={name || t}
    >
      <ShieldCheck className="w-3 h-3" />
      {t}
    </span>
  );
}
