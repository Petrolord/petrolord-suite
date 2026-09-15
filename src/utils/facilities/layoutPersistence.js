/**
 * What a saved Facility Layout Mapper project holds (FC1-0).
 *
 * facility_layouts.layout_data is one jsonb column. Version 1 rows hold
 * the layer array alone. Version 2 rows hold an object with the layers
 * and the radiation inputs of the spacing check, so a reopened layout
 * checks against the duty it was saved with. No schema change: the
 * object lives inside the existing jsonb column, and the state version
 * (PP0) tells readers which shape they have.
 */
import { registerStateKind } from '@/lib/stateVersion';
import { normaliseSpacingInputs } from '@/utils/facilities/layoutSpacing';

export const FACILITY_LAYOUT_KIND = 'facility-layout';
export const FACILITY_LAYOUT_STATE_VERSION = 2;

/** Read either stored shape as { layers, spacingInputs }. */
export const readLayoutData = (layoutData) => {
  if (Array.isArray(layoutData)) {
    // Version 1: layers only. The spacing inputs were never saved, so the
    // layout opens with the initial values it was being checked with.
    return { layers: layoutData, spacingInputs: normaliseSpacingInputs(null) };
  }
  if (layoutData && typeof layoutData === 'object') {
    return {
      layers: Array.isArray(layoutData.layers) ? layoutData.layers : [],
      spacingInputs: normaliseSpacingInputs(layoutData.spacingInputs),
    };
  }
  return { layers: [], spacingInputs: normaliseSpacingInputs(null) };
};

/** The layout_data object a save writes. */
export const buildLayoutData = ({ layers, spacingInputs }) => ({
  layers: Array.isArray(layers) ? layers : [],
  spacingInputs: normaliseSpacingInputs(spacingInputs),
});

registerStateKind(FACILITY_LAYOUT_KIND, {
  current: FACILITY_LAYOUT_STATE_VERSION,
  label: 'facility layout',
  migrations: {
    // 1 -> 2: wrap the bare layer array. Tolerant of a row that already
    // has the object shape (a save that fell back to writing unstamped).
    1: (row) => ({ ...row, layout_data: buildLayoutData(readLayoutData(row?.layout_data)) }),
  },
});
