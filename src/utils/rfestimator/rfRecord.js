/**
 * The rf-1 record of the estimate on screen (RF-U2-001): the contract
 * builder (src/lib/rfEstimateSource.js) with this app's method names, the
 * validation state of each method and the analog source line. Written into
 * every save (payload key `rf`) so a reader takes it by id.
 *
 * Pure.
 */
import { buildRfRecord } from '@/lib/rfEstimateSource';
import { ANALOG_BAND_SOURCE } from '@/utils/recoveryFactorCalculations';
import { methodLabel } from '@/components/rfestimator/rfFields';
import { VALIDATION_STATE } from './reportModel.js';

/**
 * @param {{inputs: object, derived: object, identification?: object, inPlaceIntake?: ?object, uncertainty?: ?object}} s
 * @param {{projectId?: ?string, projectName?: ?string, now?: string}} [o]
 */
export function rfRecordOf(s, { projectId = null, projectName = null, now } = {}) {
  return buildRfRecord(s, {
    projectId, projectName, methodLabel, validation: VALIDATION_STATE, rangeSource: ANALOG_BAND_SOURCE, ...(now ? { now } : {}),
  });
}
