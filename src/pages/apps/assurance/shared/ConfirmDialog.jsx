import React from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * AS13 — the one confirmation the Assurance apps ask before a delete.
 *
 * Before AS13 a finding, a lesson and a whole standard were deleted on
 * one click, with no question asked and no word about what went with
 * them. The dialog says what the delete takes with it, in the words the
 * page passes, and does nothing until the second click.
 */
export const ConfirmDialog = ({
  open, title, description, confirmLabel = 'Delete', busy = false, onConfirm, onCancel,
}) => (
  <AlertDialog open={Boolean(open)} onOpenChange={(next) => { if (!next && onCancel) onCancel(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
        <AlertDialogAction
          disabled={busy}
          className="bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(var(--destructive))]/90"
          onClick={(e) => { e.preventDefault(); if (onConfirm) onConfirm(); }}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ConfirmDialog;
