// What the LOPA & SIL Studio does not do, stated where every user sees it.
import React from 'react';
import { ShieldAlert } from 'lucide-react';

const ScopeNotice = ({ compact = false }) => (
  <div
    data-testid="scope-notice"
    className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100"
  >
    <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
    <div>
      <p>
        <strong>Low demand mode only.</strong> PFDavg is checked against the low demand SIL bands.
        This studio provides no architectural constraint check (minimum hardware fault tolerance)
        and no high demand or continuous mode (PFH). Both are required for a full SIL claim and
        must be done elsewhere.
      </p>
      {compact ? null : (
        <p className="mt-1">
          Every failure rate, PFD, frequency and target is yours to supply. The studio ships no
          failure rate data and no tables from IEC 61508 or IEC 61511; those standards are cited by clause.
        </p>
      )}
    </div>
  </div>
);

export default ScopeNotice;
