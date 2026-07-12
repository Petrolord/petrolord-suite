// Gridding & surface export as a modal dialog (ribbon + volume context
// menu). ExportPanel self-fetches horizons/faults on mount, so every
// open shows a fresh list; its unmount cleanup aborts in-flight gridding.

import React from 'react';
import { Grid3X3 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import ExportPanel from '../../ExportPanel';

export default function ExportDialog({ open, onOpenChange, volume, manifest }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Grid3X3 className="w-5 h-5 mr-2 text-cyan-400" />
            Grid &amp; export surface
          </DialogTitle>
        </DialogHeader>
        <ExportPanel frameless volume={volume} manifest={manifest} />
      </DialogContent>
    </Dialog>
  );
}
