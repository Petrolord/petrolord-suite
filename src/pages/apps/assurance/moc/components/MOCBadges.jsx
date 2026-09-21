import React from 'react';
import { cn } from '@/lib/utils';
import {
  RISK_TOKENS,
  STAGE_TOKENS,
  TYPE_TOKENS,
} from '@/lib/managementOfChange';
import { expiryDisplay } from '../utils/expiryDisplay';

/**
 * AS6 — badges painted from the one authority.
 *
 * Register.jsx had `getStageBadge()`, a switch returning CSS class
 * names with a silent default, and painted risk inline with a nested
 * ternary. Both were fed by hardcoded rows, so neither had ever been
 * asked to render a value from a database.
 */

const Pill = ({ token, children, className, title, small }) => (
  <span
    title={title}
    className={cn(
      small
        ? 'px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border whitespace-nowrap'
        : 'px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap',
      className,
    )}
    style={{
      backgroundColor: `hsl(var(${token}) / 0.1)`,
      color: `hsl(var(${token}))`,
      borderColor: `hsl(var(${token}) / 0.25)`,
    }}
  >
    {children}
  </span>
);

const fallback = '--muted-foreground';

export const StageBadge = ({ stage }) => (
  <Pill token={STAGE_TOKENS[stage] || fallback}>{stage || 'Unknown'}</Pill>
);

export const TypeBadge = ({ type }) => (
  <Pill small token={TYPE_TOKENS[type] || fallback}>{type || 'Unset'}</Pill>
);

export const RiskBadge = ({ risk }) => (
  <Pill small token={RISK_TOKENS[risk] || fallback}>{risk || 'Unassessed'}</Pill>
);

/**
 * Where a temporary change stands against its expiry date.
 *
 * Shown only when it says something. A permanent change has no expiry
 * to be past, and a badge saying so on every row is noise that hides
 * the ones that matter.
 *
 * AS13: the words come from expiryDisplay. A change not yet in effect
 * used to read "No expiry" beside its own expiry date.
 */
export const ExpiryBadge = ({ moc, today }) => {
  const shown = expiryDisplay(moc, today || new Date());
  if (!shown) return null;
  return (
    <Pill token={shown.token} title={shown.title}>
      {shown.label}
    </Pill>
  );
};
