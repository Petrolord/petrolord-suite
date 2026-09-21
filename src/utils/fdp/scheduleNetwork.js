/**
 * The plan's schedule as a network the engine can run.
 *
 * EC6-0. The Schedule tab promised a critical path in its own header and in
 * the Guided step, and had nothing to compute one with: no activity carried
 * a dependency, and `calculateCPM` passed the caller's own float back out
 * and called every activity critical. The form now collects predecessors
 * and this module hands them to the engine.
 *
 * The schedule rows carry `start` and `end`; the engine's calendar span
 * reads `startDate` and `endDate`, so the mapping happens here in one place.
 */

import { calculateCPM, calculateNetworkDuration, criticalPaths, calculateProjectDuration } from '@/utils/fdp/scheduleCalculations';

/** Schedule rows in the shape the engine reads. */
export const toNetwork = (activities) => (activities || []).map((a) => ({
  ...a,
  startDate: a.startDate ?? a.start,
  endDate: a.endDate ?? a.end,
  dependencies: Array.isArray(a.dependencies) ? a.dependencies : [],
}));

/**
 * The critical path method over the plan's schedule.
 *
 * @param {object[]} activities
 * @returns {{available: boolean, error?: string, activities?: object[],
 *   durationDays?: number, paths?: Array<Array<string>>, calendarDays?: number|null,
 *   anyDependencies?: boolean}}
 */
export const scheduleAnalysis = (activities) => {
  const network = toNetwork(activities);
  if (!network.length) return { available: false, error: null, empty: true };
  try {
    const table = calculateCPM(network);
    return {
      available: true,
      activities: table,
      durationDays: calculateNetworkDuration(network),
      paths: criticalPaths(network),
      calendarDays: calculateProjectDuration(network),
      anyDependencies: network.some((a) => a.dependencies.length > 0),
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
};
