import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * AS4 — the states the old app could not tell apart.
 *
 * `getDocuments()` threw when a query failed AND when it returned zero
 * rows, and the catch returned five invented documents. So a broken
 * database, an empty library and a healthy one with five documents all
 * rendered identically. These three components keep them apart.
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
        <h3 className="font-medium">The document library could not be loaded</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{error}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
          Nothing is shown below. This app used to answer a failed query with
          five invented documents, which is how an organization came to see a
          library that was not its own.
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

/** Shown while migration 20260917200000 is unapplied. */
export const SchemaNotice = () => (
  <div className="mb-4 p-3 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm text-[hsl(var(--muted-foreground))]">
    This database does not have the AS4 document control schema yet, so
    revision files, review periods and supersession links are unavailable.
    Everything else works. Ask your administrator to apply migration
    20260917200000.
  </div>
);

/** Shown when the storage bucket has not been created. */
export const BucketNotice = () => (
  <div className="mb-4 p-3 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm text-[hsl(var(--muted-foreground))]">
    File storage is not set up for this project, so documents can be
    registered and revised but their files cannot be attached. Ask your
    administrator to create the private `documents` storage bucket.
  </div>
);
