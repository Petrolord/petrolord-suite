// One memory budget for everything the viewer keeps of a survey (large-
// survey plan section 6): about 256 MB on an 8 GB laptop, 512 MB on 16 GB,
// never more than 1 GB. navigator.deviceMemory is the machine's reported
// RAM in GB (Chrome rounds it and caps it at 8; Firefox and Safari leave
// it undefined, which gets the 8 GB answer).

const MB = 1024 * 1024;

export const BUDGET_PER_GB = 32 * MB;
export const BUDGET_MIN = 128 * MB;
export const BUDGET_MAX = 1024 * MB;
export const BUDGET_DEFAULT_GB = 8;

/** Share of the budget kept as assembled slices (the rest is bricks). */
export const SLICE_CACHE_SHARE = 0.25;

/**
 * @param {number|undefined} deviceMemoryGb navigator.deviceMemory
 * @returns {number} bytes
 */
export function cacheBudgetBytes(deviceMemoryGb) {
  const gb = Number.isFinite(deviceMemoryGb) && deviceMemoryGb > 0
    ? deviceMemoryGb : BUDGET_DEFAULT_GB;
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(gb * BUDGET_PER_GB)));
}

/** Split a total budget into the brick cache and the slice cache. */
export function splitBudget(totalBytes) {
  const slices = Math.floor(totalBytes * SLICE_CACHE_SHARE);
  return { bricks: totalBytes - slices, slices };
}

/** The reported memory of this machine (window or worker), or undefined. */
export function reportedDeviceMemory(scope = globalThis) {
  const dm = scope?.navigator?.deviceMemory;
  return Number.isFinite(dm) ? dm : undefined;
}

/** "256 MB" / "1 GB" for user-facing copy. */
export function formatBudget(bytes) {
  if (bytes >= 1024 * MB && bytes % (1024 * MB) === 0) return `${bytes / (1024 * MB)} GB`;
  return `${Math.round(bytes / MB)} MB`;
}
