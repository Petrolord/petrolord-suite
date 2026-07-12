// Ribbon · Wells: well import, bulk visibility and well-tie calibration
// (which opens the velocity dialog with the calibration panel expanded —
// same gating as the old editor's Calibrate button).

import React from 'react';
import { PlusCircle, Eye, EyeOff, Ruler } from 'lucide-react';
import { RibbonGroup, RibbonButton } from '../Ribbon';

export default function WellsTab({
  openWellImport, setAllWellsVisible, wellsCount,
  openCalibrate, velocityForDisplay, visibleWells, horizons,
}) {
  return (
    <>
      <RibbonGroup label="Wells">
        <RibbonButton
          icon={PlusCircle}
          label="Import well…"
          onClick={openWellImport}
          title="Import a well: header + pasted deviation survey, tops and checkshots"
        />
        <RibbonButton
          icon={Eye}
          label="Show all"
          onClick={() => setAllWellsVisible(true)}
          disabled={!wellsCount}
        />
        <RibbonButton
          icon={EyeOff}
          label="Hide all"
          onClick={() => setAllWellsVisible(false)}
          disabled={!wellsCount}
        />
      </RibbonGroup>

      <RibbonGroup label="Tie">
        <RibbonButton
          icon={Ruler}
          label="Calibrate from wells…"
          onClick={openCalibrate}
          disabled={!velocityForDisplay || !(visibleWells || []).length || !horizons.length}
          title={!velocityForDisplay
            ? 'Save a velocity model first — calibration adjusts the current model'
            : !(visibleWells || []).length
              ? 'Toggle wells with tops visible in the explorer first'
              : 'Fit the velocity model so converted horizon depths match the well tops'}
        />
      </RibbonGroup>
    </>
  );
}
