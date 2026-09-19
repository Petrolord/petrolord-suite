// What the Consequence Modelling Studio does not model, stated where every
// user sees it (PS2).
import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { NOT_MODELLED } from '@/utils/processSafety/consequenceStudy';

const ConsequenceScopeNotice = ({ compact = false }) => (
  <div
    data-testid="scope-notice"
    className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100"
  >
    <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
    <div className="space-y-1">
      <p>
        <strong>Not modelled here:</strong> {NOT_MODELLED.join('; ')}. The plume is a passive, continuous point
        source over open country.
      </p>
      <p data-testid="facilities-screening-note">
        <strong>A separate screening model.</strong> The flare and pool fire radiation and setbacks in the Facilities apps
        come from a point-source screening model (a fraction of the fire&apos;s heat spread over a sphere, at the API 521
        customary levels), which the NextGen courses FC1 and FC5 grade. This studio uses the solid-flame model (surface emissive power, view factor and
        transmissivity), so the two give different distances for the same fire by design.
      </p>
      {compact ? null : (
        <p>
          Every input is yours. The opening study follows a benzene release into a bund; its fire step is the
          Yellow Book worked example 6.6.3 and its gas release the Yellow Book hydrogen case, and the other values are
          illustrative.
        </p>
      )}
    </div>
  </div>
);

export default ConsequenceScopeNotice;
