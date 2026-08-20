// Ribbon · Export: launchers for the surface/pick export dialog
// (surfaces: XYZ / CPS-3 / ZMAP+ / Irap classic, fault-aware gridding,
// contact GRV, save-to-registry; picks: Charisma 3D / IL-XL points)
// and the surface/pick IMPORT dialog (same dialects inbound).

import React from 'react';
import { FileUp, Grid3X3, Printer } from 'lucide-react';
import { RibbonGroup, RibbonButton } from '../Ribbon';

export default function ExportTab({
  volume, openExport, openSurfaceImport, openPlot,
}) {
  return (
    <>
      <RibbonGroup label="Surfaces & picks">
        <RibbonButton
          icon={Grid3X3}
          label="Export…"
          onClick={openExport}
          disabled={!volume}
          title="Export a horizon as a gridded surface (XYZ / CPS-3 / ZMAP+ / Irap; fault-aware; depth or TWT; save as a registry surface) or as interpretation picks (Charisma 3D / IL-XL points)"
        />
        <RibbonButton
          icon={FileUp}
          label="Import…"
          onClick={openSurfaceImport}
          disabled={!volume}
          title="Import a surface grid file (XYZ / CPS-3 / ZMAP+ / Irap, auto-detected) into the surface registry, or a horizon picks file (Charisma 3D / IL-XL / XYZ) as an editable horizon"
        />
      </RibbonGroup>
      <RibbonGroup label="Plotting">
        <RibbonButton
          icon={Printer}
          label="Plot PDF…"
          onClick={openPlot}
          disabled={!volume}
          title="True-scale PDF plot of the Map or Section window: paper size, 1:X ground scale (sections also ms/cm vertical), title block, exact scale bar"
        />
      </RibbonGroup>
    </>
  );
}
