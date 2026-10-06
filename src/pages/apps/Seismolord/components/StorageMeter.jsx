// Seismic storage meter: the friendly face of the seismic quota (per user,
// or the organisation's shared pool when it has a storage tier) that
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
  const size = (n) => (gib(n) >= 1024 ? `${(gib(n) / 1024).toFixed(gib(n) >= 10240 ? 0 : 1)} TiB` : `${gib(n).toFixed(0)} GiB`);
  const usedText = used >= 1024 ? `${(used / 1024).toFixed(2)} TiB` : `${used < 10 ? used.toFixed(2) : used.toFixed(1)} GiB`;
  const bar = frac >= 0.95 ? 'bg-pl-danger' : frac >= 0.8 ? 'bg-pl-warning' : 'bg-pl-primary';
  const text = frac >= 0.95 ? 'text-pl-danger-text' : frac >= 0.8 ? 'text-pl-warning-text' : 'text-pl-muted';

  return (
    <div
      className={`text-xs ${text} ${className}`}
      data-testid="seismic-storage-meter"
      title={usage.pooled
        ? `Seismic storage shared by ${usage.organizationName || 'your organisation'}${usage.tierLabel ? ` (${usage.tierLabel} tier` : ''}${usage.tierLabel && usage.members ? `, ${usage.members} members)` : usage.tierLabel ? ')' : ''}: everyone's volumes and 2D lines against the shared pool`
        : 'Seismic storage used by your volumes and 2D lines, against your quota'}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{usage.pooled ? `Storage (shared${usage.tierLabel ? `, ${usage.tierLabel}` : ''})` : 'Storage'}</span>
        <span className="font-mono">
          {`${usedText} of ${size(usage.quotaBytes)}`}
        </span>
      </div>
      <div className="h-1 mt-1 rounded bg-pl-border/60 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${Math.max(frac * 100, usage.usedBytes > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}
