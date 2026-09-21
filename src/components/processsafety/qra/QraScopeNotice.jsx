// What the QRA Studio does not do, stated where every user sees it (PS3).
import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { NOT_MODELLED } from '@/utils/processSafety/qraStudy';

const QraScopeNotice = () => (
  <div
    data-testid="scope-notice"
    className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100"
  >
    <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
    <div className="space-y-1">
      <p>
        <strong>Not done here:</strong> {NOT_MODELLED.join('; ')}.
      </p>
      <p data-testid="consequence-note">
        <strong>The doses come from the Consequence Modelling Studio.</strong> A heat flux, an overpressure or a toxic
        probit probability computed there is typed here, and the Purple Book rules turn it into a probability of death.
        This studio recomputes no source term, plume, flame or probit coefficient.
      </p>
      <p>
        Every input is yours. The opening study is illustrative: a gas line and an H2S source on one site, three places
        people stand, and the HSE cost benefit checklist worked example as the measure under test. Criteria are
        guidelines: R2P2 calls its limits &quot;not intended to be rigid benchmarks&quot;, and Bevi was repealed on
        1 January 2024.
      </p>
    </div>
  </div>
);

export default QraScopeNotice;
