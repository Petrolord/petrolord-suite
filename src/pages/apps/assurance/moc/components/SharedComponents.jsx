import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * AS13: a hard delete asks first. In an assurance app the record is
 * the deliverable, and one misplaced click used to remove it.
 */
export const ConfirmDelete = ({
  open, title, description, confirmLabel = 'Delete', busy = false, onConfirm, onCancel,
}) => (
  <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={busy}
          className="bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(var(--destructive))]/90"
          onClick={(e) => { e.preventDefault(); onConfirm(); }}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * AS6 — the states the old app could not tell apart.
 *
 * It could not tell them apart because it never asked. No page in
 * Management of Change issued a query: the register was five literals,
 * so a broken database, an empty register and a healthy one all
 * rendered the same five invented change records.
 */

export const Loading = ({ label = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center py-24 opacity-50">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--primary))] mb-4" />
    <p className="text-[hsl(var(--muted-foreground))]">{label}</p>
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="p-5 rounded-xl border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-medium">The change register could not be loaded</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{error}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
          Nothing is shown below. This app used to show five invented change
          records to every organization, whatever was in its register and
          whether or not the database answered at all.
        </p>
        {onRetry ? (
          <button type="button" onClick={onRetry}
            className="mt-3 text-sm font-medium text-[hsl(var(--destructive))] hover:underline">
            Try again
          </button>
        ) : null}
      </div>
    </div>
  </div>
);

export const EmptyState = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))]/50">
    <div className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50">{icon}</div>
    <h3 className="text-lg font-medium mb-1">{title}</h3>
    <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-sm">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

export const DetailField = ({ label, children }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
    <div className="text-sm mt-1">
      {children === null || children === undefined || children === ''
        ? <span className="text-[hsl(var(--muted-foreground))]">Not set</span>
        : children}
    </div>
  </div>
);

/** Shown while migration 20260917400000 is unapplied. */
export const SchemaNotice = () => (
  <div className="mb-4 p-3 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm text-[hsl(var(--muted-foreground))]">
    This database does not have the AS6 change management schema yet, so
    the current-situation field and the implementation and closure
    signatures are unavailable, and the expiry rule for temporary changes
    is enforced by this app rather than by the database. Everything else
    works. Ask your administrator to apply migration 20260917400000.
  </div>
);
