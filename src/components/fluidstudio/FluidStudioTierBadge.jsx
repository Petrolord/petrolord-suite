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
 * lives with the results cards; this component only renders. The full
 * tierMatrix reference doc lands in FS8.
 */
const TIERS = {
  oracle_gated: {
    label: 'Oracle gated',
    classes: 'bg-lime-900/30 border-lime-700/50 text-lime-300',
    iconClasses: 'text-lime-400',
    Icon: CheckCircle2,
    tooltip:
      'This quantity comes from the PR78 engine, which is validated against an independent Python oracle and NIST reference data in the repository validation harness (tools/validation/fluidstudio). Agreement is at solver precision.',
  },
  published_method: {
    label: 'Published method',
    classes: 'bg-slate-800/60 border-slate-600/60 text-slate-300',
    iconClasses: 'text-slate-400',
    Icon: Info,
    tooltip:
      'This quantity follows a recognized published method. The implementation is transcription-checked against the source, but no independent measurement gate applies at this point.',
  },
  screening: {
    label: 'Screening estimate',
    classes: 'bg-amber-900/30 border-amber-700/50 text-amber-300',
    iconClasses: 'text-amber-400',
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
        <TooltipContent side="top" align="start" className="max-w-sm bg-slate-900 border-slate-700 text-slate-200 leading-relaxed">
          <p className="text-xs font-semibold mb-1 text-slate-100">{def.label}</p>
          <p className="text-xs text-slate-300">{note || def.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default FluidStudioTierBadge;
