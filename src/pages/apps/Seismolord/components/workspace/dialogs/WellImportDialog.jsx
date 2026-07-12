// Well import as a modal dialog (ribbon + explorer Wells section). The
// column-mapped WellImport form is presentation-only; onSave persists
// through useWells and the controller closes the dialog on success.

import React from 'react';
import { CircleDot } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import WellImport from '../../WellImport';

export default function WellImportDialog({ open, onOpenChange, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <CircleDot className="w-5 h-5 mr-2 text-amber-400" />
            Import well
          </DialogTitle>
        </DialogHeader>
        <WellImport onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
}
