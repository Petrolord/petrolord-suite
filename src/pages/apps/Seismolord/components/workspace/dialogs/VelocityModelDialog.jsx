// Velocity model editing + well-tie calibration as a modal dialog. The
// controller renders a fully-wired VelocityModelEditor as children so
// this wrapper stays free of the editor's two dozen state props.

import React from 'react';
import { Ruler } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export default function VelocityModelDialog({ open, onOpenChange, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Ruler className="w-5 h-5 mr-2 text-cyan-400" />
            Velocity model
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
