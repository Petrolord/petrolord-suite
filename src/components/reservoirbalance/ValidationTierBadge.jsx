// src/components/reservoirbalance/ValidationTierBadge.jsx
//
// Reservoir Balance — Validation Tier Badge
// ==========================================
//
// Phase 3 Capsule 4B (2026-05-15). Renders the engine's validation_tier as
// a small badge with constructive language. Used wherever the engine result
// surfaces in the UI — currently AquiferModel.jsx (showing the tier the
// selected model will emit) and RbCaseDetail.jsx (showing the tier the
// completed run emitted).
//
// Three tiers, three visual treatments:
//
//   benchmark_verified  → green badge with check icon
//                         "Benchmark verified"
//                         Tooltip shows the published reference and
//                         the measured tolerance (e.g. "0.13% OOIP error").
//
//   published_method    → slate badge with info icon
//                         "Published method"
//                         Tooltip shows the method's primary publication.
//
//   engineering_basis   → slate badge with info icon
//                         "Engineering basis"
//                         Tooltip explains the documented engineering
//                         judgment basis.
//
// Tooltip wording is the engine's validation_reference string verbatim — that
// way the tier vocabulary stays consistent between engine and UI without
// duplication.

import React from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const TIER_DEFINITIONS = {
  benchmark_verified: {
    label: 'Benchmark verified',
    classes: 'bg-lime-900/30 border-lime-700/50 text-lime-300',
    iconClasses: 'text-lime-400',
    Icon: CheckCircle2,
    defaultTooltip:
      'Implementation has been tested against a published worked example and matches within the stated tolerance. The reference case is recorded for traceability.',
  },
  published_method: {
    label: 'Published method',
    classes: 'bg-slate-800/60 border-slate-600/60 text-slate-300',
    iconClasses: 'text-slate-400',
    Icon: Info,
    defaultTooltip:
      'Implementation follows a recognized peer-reviewed or industry-standard formulation. The workflow includes documented assumptions, internal checks, and calculation traceability.',
  },
  engineering_basis: {
    label: 'Engineering basis',
    classes: 'bg-slate-800/60 border-slate-600/60 text-slate-300',
    iconClasses: 'text-slate-400',
    Icon: Info,
    defaultTooltip:
      'Implementation follows established reservoir engineering principles where a suitable public worked example is not available. The method is documented, traceable, and ready for engineering use within stated assumptions.',
  },
};

/**
 * ValidationTierBadge
 *
 * @param {Object} props
 * @param {'benchmark_verified' | 'published_method' | 'engineering_basis'} props.tier
 * @param {string} [props.reference]      — Engine-supplied reference text (overrides defaultTooltip when present)
 * @param {number} [props.tolerancePct]   — Measured tolerance for benchmark_verified tier (e.g. 0.13)
 * @param {'sm' | 'md'} [props.size='md'] — Badge size
 * @param {string} [props.className]      — Extra wrapper classes
 */
const ValidationTierBadge = ({
  tier,
  reference,
  tolerancePct,
  size = 'md',
  className = '',
}) => {
  if (!tier || !TIER_DEFINITIONS[tier]) {
    // Unknown / missing tier — render nothing rather than a broken badge
    return null;
  }

  const def = TIER_DEFINITIONS[tier];
  const { Icon } = def;

  // Size variants
  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-2 py-0.5 gap-1'
      : 'text-xs px-2.5 py-1 gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  // Tooltip content — prefer engine-supplied reference, fall back to default
  const tooltipBody = reference || def.defaultTooltip;
  const showToleranceLine =
    tier === 'benchmark_verified' && tolerancePct != null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded-md border font-medium cursor-help ${sizeClasses} ${def.classes} ${className}`}
          >
            <Icon className={`${iconSize} ${def.iconClasses}`} />
            <span>{def.label}</span>
            {showToleranceLine && (
              <span className="font-mono opacity-80">
                ({tolerancePct.toFixed(2)}%)
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-sm bg-slate-900 border-slate-700 text-slate-200 leading-relaxed"
        >
          <p className="text-xs font-semibold mb-1 text-slate-100">
            {def.label}
          </p>
          <p className="text-xs text-slate-300">{tooltipBody}</p>
          {showToleranceLine && (
            <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
              Measured tolerance: {tolerancePct.toFixed(2)}%
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ValidationTierBadge;
