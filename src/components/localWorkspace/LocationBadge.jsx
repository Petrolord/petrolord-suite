// Where a volume lives, on every volumes list (Seismic Explorer, QI Data):
// "This computer", "Cloud", "Both", or the computer it lives on.
import React from 'react';
import { Cloud, HardDrive, Laptop, AlertTriangle } from 'lucide-react';
import { PLACEMENT } from '@/lib/localWorkspace/placement';

const STYLE = {
  [PLACEMENT.HERE]: { icon: HardDrive, cls: 'text-pl-success-text' },
  [PLACEMENT.BOTH]: { icon: HardDrive, cls: 'text-pl-info-text' },
  [PLACEMENT.CLOUD_COPY]: { icon: Cloud, cls: 'text-pl-muted' },
  [PLACEMENT.ELSEWHERE]: { icon: Laptop, cls: 'text-pl-warning-text' },
  [PLACEMENT.MISSING]: { icon: AlertTriangle, cls: 'text-pl-danger-text' },
};

/**
 * @param {{placement: ?Object, compact?: boolean}} p compact: icon only (explorer rows)
 */
export default function LocationBadge({ placement, compact = false }) {
  if (!placement || placement.kind === PLACEMENT.CLOUD) return null;
  const st = STYLE[placement.kind] || { icon: Cloud, cls: 'text-pl-muted' };
  const Icon = st.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 text-[11px] ${st.cls}`}
      title={placement.title}
      data-testid="volume-location"
      data-location={placement.kind}
    >
      <Icon className="w-3 h-3" />
      {!compact && <span>{placement.badge}</span>}
    </span>
  );
}
