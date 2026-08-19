// Ribbon · Export: launcher for the surface/pick export dialog
// (surfaces: XYZ / CPS-3 / ZMAP+ / Irap classic, fault-aware gridding,
// contact GRV, save-to-registry; picks: Charisma 3D / IL-XL points).

import React from 'react';
import { Grid3X3 } from 'lucide-react';
import { RibbonGroup, RibbonButton } from '../Ribbon';

export default function ExportTab({ volume, openExport }) {
  return (
    <RibbonGroup label="Surfaces & picks">
      <RibbonButton
        icon={Grid3X3}
        label="Export…"
        onClick={openExport}
        disabled={!volume}
        title="Export a horizon as a gridded surface (XYZ / CPS-3 / ZMAP+ / Irap; fault-aware; depth or TWT; save as a registry surface) or as interpretation picks (Charisma 3D / IL-XL points)"
      />
    </RibbonGroup>
  );
}
