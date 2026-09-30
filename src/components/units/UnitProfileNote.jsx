// A small line next to an app's unit toggle (Suite unit profile). Quiet
// when the view follows the profile; when the view differs it says so in
// plain words and offers to go back to the profile. Theme roles only.
import React from 'react';
import { cn } from '@/lib/utils';

const NAMES = { depth: 'depth', temp: 'temperature', temperature: 'temperature', pressure: 'pressure', velocity: 'velocity', density: 'density', volume: 'volume', system: 'units' };

/**
 * @param {{u: ReturnType<import('@/lib/units/useAppUnits').useAppUnits>, names?: Object<string,string>, className?: string}} p
 */
export default function UnitProfileNote({ u, names = {}, className }) {
  if (!u || !u.available) return null;
  const label = (k) => names[k] || NAMES[k] || k;
  if (u.differs.length) {
    const parts = u.differs.map((k) => `${label(k)} ${u.units[k]} (profile ${u.profileUnits[k]})`);
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-1 text-[11px] text-pl-warning-text', className)} data-testid="unit-profile-note" data-state="differs">
        <span>This view differs from your units profile: {parts.join(', ')}.</span>
        <button type="button" className="underline hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus rounded"
          onClick={u.resetToProfile} data-testid="unit-profile-reset">
          Use my profile
        </button>
      </span>
    );
  }
  const approx = Object.keys(u.exact).filter((k) => !u.exact[k]);
  const first = Object.keys(u.sources)[0];
  return (
    <span className={cn('text-[11px] text-pl-muted', className)} data-testid="unit-profile-note" data-state="follows"
      title="Units follow your Suite units profile. Stored data never changes when units change.">
      Units: {u.sources[first] || 'profile'}
      {approx.length ? `; nearest offered for ${approx.map(label).join(', ')}` : ''}
    </span>
  );
}
