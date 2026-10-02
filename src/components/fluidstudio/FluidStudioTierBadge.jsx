import React from 'react';
import { CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Fluid Studio validation tier badge (FS5).
 *
 * Same visual vocabulary as MB Studio's ValidationTierBadge, with tiers
 * matched to the EOS program's validation story. The tier-to-output map
 * lives with the results cards; this component only renders. The
 * quantity-by-quantity reference is docs/scope/FluidStudio-TierMatrix.md
 * (FS8) and must stay in step with the badges the cards render.
 */
const TIERS = {
  lab_tuned: {
    label: 'Lab tuned',
    classes: 'bg-pl-info-bg border-pl-info/40 text-pl-info-text',
    iconClasses: 'text-pl-info-text',
    Icon: CheckCircle2,
    tooltip:
      'The C7+ plus fraction of this fluid has been regressed to the measured lab values you entered in the Lab tuning card. All compositional results use the tuned fluid; the before and after table on that card shows exactly how well each measurement is matched.',
  },
  // H10: a tune made before the feed, the C7+ description, the lab values,
  // the flash conditions or the separator train changed. The knobs are
  // still applied; the claim "matched to lab data" is withdrawn.
  lab_tuned_stale: {
    label: 'Tuned on earlier inputs',
    classes: 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text',
    iconClasses: 'text-pl-warning-text',
    Icon: AlertTriangle,
    tooltip:
      'The C7+ plus fraction was tuned to lab values, and the composition, the lab values, the flash conditions or the separator train changed afterwards. The tuned C7+ properties are still applied, so these results no longer reproduce the lab match. Run Tune to lab data again on the Lab tuning card, or reset to untuned.',
  },
  lab_tuned_unrecorded: {
    label: 'Tuned, not confirmed',
    classes: 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text',
    iconClasses: 'text-pl-warning-text',
    Icon: AlertTriangle,
    tooltip:
      'This fluid was tuned before the app kept a record of what it was tuned on, so it cannot confirm that the fluid is unchanged since. Run Tune to lab data again on the Lab tuning card to confirm the match.',
  },
  oracle_gated: {
    label: 'Oracle gated',
    classes: 'bg-pl-success-bg border-pl-success/40 text-pl-success-text',
    iconClasses: 'text-pl-success-text',
    Icon: CheckCircle2,
    tooltip:
      'This quantity comes from the PR78 engine, which is validated against an independent Python oracle and NIST reference data in the repository validation harness (tools/validation/fluidstudio). Agreement is at solver precision.',
  },
  published_method: {
    label: 'Published method',
    classes: 'bg-pl-sunken border-pl-border text-pl-text',
    iconClasses: 'text-pl-muted',
    Icon: Info,
    tooltip:
      'This quantity follows a recognized published method. The implementation is transcription-checked against the source, but no independent measurement gate applies at this point.',
  },
  screening: {
    label: 'Screening estimate',
    classes: 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text',
    iconClasses: 'text-pl-warning-text',
    Icon: AlertTriangle,
    tooltip:
      'This quantity comes from an untuned engineering correlation. Expect meaningful scatter against lab data and treat it as a screening number until it is tuned to measurements.',
  },
};

const FluidStudioTierBadge = ({ tier, note, className = '' }) => {
  const def = TIERS[tier];
  if (!def) return null;
  const { Icon } = def;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center rounded-md border font-medium cursor-help text-[10px] px-2 py-0.5 gap-1 ${def.classes} ${className}`}>
            <Icon className={`w-3 h-3 ${def.iconClasses}`} />
            <span>{def.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-sm leading-relaxed">
          <p className="text-xs font-semibold mb-1 text-pl-text">{def.label}</p>
          <p className="text-xs text-pl-text">{note || def.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * The tuning badge of a compositional card, from tuningStatus()
 * (utils/fluidstudio/eosAnalysis.js). `true` is accepted for a caller that
 * only knows a tune is applied and current.
 */
const TUNE_TIER = { current: 'lab_tuned', stale: 'lab_tuned_stale', unrecorded: 'lab_tuned_unrecorded' };
export const TuneStatusBadge = ({ status }) => {
  const tier = status === true ? 'lab_tuned' : TUNE_TIER[status];
  return tier ? <FluidStudioTierBadge tier={tier} /> : null;
};

export default FluidStudioTierBadge;
