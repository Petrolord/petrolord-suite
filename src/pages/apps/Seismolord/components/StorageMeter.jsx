// Seismic storage meter: the friendly face of the per-user quota that
// previously only ever surfaced as an "exceeded" error at import time.
// Renders nothing while usage is unknown (signed out, read hiccup) —
// the quota's authoritative layer is the bucket policy either way.
import React, { useEffect, useState } from 'react';
import { getStorageUsage } from '../services/seismicStorage';

export default function StorageMeter({ className = '', refreshKey = 0 }) {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let stale = false;
    getStorageUsage()
      .then((u) => { if (!stale) setUsage(u); })
      .catch(() => {});
    return () => { stale = true; };
  }, [refreshKey]);

  if (!usage?.known) return null;
  const frac = Math.min(1, usage.usedBytes / usage.quotaBytes);
  const gib = (n) => n / 1024 ** 3;
  const used = gib(usage.usedBytes);
  const bar = frac >= 0.95 ? 'bg-red-500' : frac >= 0.8 ? 'bg-amber-400' : 'bg-cyan-500';
  const text = frac >= 0.95 ? 'text-red-400' : frac >= 0.8 ? 'text-amber-300' : 'text-slate-400';

  return (
    <div
      className={`text-xs ${text} ${className}`}
      data-testid="seismic-storage-meter"
      title="Seismic storage used by your volumes and 2D lines, against the per-user quota"
    >
      <div className="flex items-center justify-between gap-2">
        <span>Storage</span>
        <span className="font-mono">
          {`${used < 10 ? used.toFixed(2) : used.toFixed(1)} of ${gib(usage.quotaBytes).toFixed(0)} GiB`}
        </span>
      </div>
      <div className="h-1 mt-1 rounded bg-slate-700/60 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${Math.max(frac * 100, usage.usedBytes > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}
