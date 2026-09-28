import React from 'react';
import { cn } from '@/lib/utils';

// Numeric table for ledgers people read line by line (cash flows, volumes
// by year, run comparisons), generalised from the EPE Year-by-Year recipe
// (docs/scope/DesignSystem-example-EPE.md section 4):
//   - the card scrolls the table sideways so the page never does
//   - row labels are <th scope="row">, sticky on the left, so the numbers
//     scroll under them; on phones they wrap inside 8 to 10rem
//   - every number is right aligned in mono tabular figures, no wrap
//   - a negative gets the danger text next to its minus sign (colour is
//     never the only signal); pass signed={false} for values where a minus
//     is not bad news
//   - a totals row has a strong rule above it
// Theme roles only: use it inside an opted-in scope.

export const NUMERIC_TABLE = {
  card: 'rounded-lg border border-pl-border bg-pl-surface p-3',
  title: 'mb-3 ml-1 text-sm font-semibold text-pl-text',
  table: 'w-full min-w-full border-collapse text-sm',
  th: 'border-b-2 border-b-pl-border-strong bg-pl-sunken px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-pl-muted',
  thNum: 'border-b-2 border-b-pl-border-strong bg-pl-sunken px-3 py-2 text-right font-pl-mono text-xs font-semibold uppercase tracking-wide tabular-nums text-pl-muted',
  stickyHead: 'sticky left-0 z-[2]',
  rowLabel: 'sticky left-0 z-[1] min-w-[8rem] max-w-[10rem] whitespace-normal border-b border-pl-border bg-pl-surface px-3 py-2 text-left text-xs font-medium text-pl-text sm:max-w-none sm:whitespace-nowrap',
  cell: 'whitespace-nowrap border-b border-pl-border px-3 py-2 text-right font-pl-mono text-xs tabular-nums',
  row: 'hover:bg-pl-sunken/60',
  total: 'border-t-2 border-t-pl-border-strong font-semibold',
};

/** Danger text for a negative number, '' otherwise. */
export const signedTone = (v) => (typeof v === 'number' && v < 0 ? 'text-pl-danger-text' : '');

/** Card, optional title, sideways scroller and the <table>. */
export function NumericTable({ title, className, tableClassName, children, ...props }) {
  return (
    <div className={cn(NUMERIC_TABLE.card, className)} {...props}>
      {title && <h3 className={NUMERIC_TABLE.title}>{title}</h3>}
      <div className="overflow-x-auto">
        <table className={cn(NUMERIC_TABLE.table, tableClassName)}>{children}</table>
      </div>
    </div>
  );
}

/** Header cell; `numeric` right aligns in mono, `sticky` pins the label column header. */
export function NumTh({ numeric = false, sticky = false, className, ...props }) {
  return (
    <th scope="col" className={cn(numeric ? NUMERIC_TABLE.thNum : NUMERIC_TABLE.th, sticky && NUMERIC_TABLE.stickyHead, className)} {...props} />
  );
}

/** A body row with the hover fill. */
export function NumRow({ className, ...props }) {
  return <tr className={cn(NUMERIC_TABLE.row, className)} {...props} />;
}

/** The sticky row label; `total` adds the strong rule and weight. */
export function RowLabel({ total = false, className, ...props }) {
  return <th scope="row" className={cn(NUMERIC_TABLE.rowLabel, total && NUMERIC_TABLE.total, className)} {...props} />;
}

/**
 * A number cell. `value` (a number) drives the signed colour; children are
 * the formatted text (defaults to String(value)). `tone` overrides the
 * colour class, e.g. success text for a cumulative above zero.
 */
export function NumCell({ value, total = false, signed = true, tone, className, children, ...props }) {
  const colour = tone || (signed && signedTone(value)) || 'text-pl-text';
  return (
    <td className={cn(NUMERIC_TABLE.cell, total && NUMERIC_TABLE.total, colour, className)} {...props}>
      {children !== undefined ? children : (value ?? '')}
    </td>
  );
}
