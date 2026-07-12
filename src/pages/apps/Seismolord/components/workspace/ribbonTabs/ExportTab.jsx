// Ribbon · Export: launcher for the gridding & surface-export dialog
// (XYZ / CPS-3 / ZMAP+ writers, fault-aware gridding, contact GRV).

import React from 'react';
import { Grid3X3 } from 'lucide-react';
import { RibbonGroup, RibbonButton } from '../Ribbon';

export default function ExportTab({ volume, openExport }) {
  return (
    <RibbonGroup label="Surfaces">
      <RibbonButton
        icon={Grid3X3}
        label="Gridding & export…"
        onClick={openExport}
        disabled={!volume}
        title="Grid a horizon and export it (XYZ / CPS-3 / ZMAP+; fault-aware; depth or TWT)"
      />
    </RibbonGroup>
  );
}
