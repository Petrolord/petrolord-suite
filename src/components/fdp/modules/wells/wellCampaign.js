/**
 * FDP well campaign layout, pure so it can be tested.
 *
 * EC6-0: each well goes to the rig that comes free first (lowest rig number
 * on a tie), and a well with no drilling days counts as zero.
 *
 * EC6-5 (owner decision 2026-09-15): wells used to be handed out in table
 * order, so re-sorting the table could change the campaign length with no
 * input changed. Wells are now laid out longest first, by the same duration
 * the layout uses, with ties broken by well id, so the campaign depends only
 * on the set of wells and the rig count.
 */

export const wellDuration = (well) => Number(well?.days) || 0;

const compareIds = (a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'en', { numeric: true });

export const campaignOrder = (wells) => [...(wells || [])]
  .sort((a, b) => (wellDuration(b) - wellDuration(a)) || compareIds(a, b));

export function layoutWellCampaign(wells, rigCount = 1) {
  const rigs = new Array(Math.max(1, Number(rigCount) || 1)).fill(0);
  const schedule = campaignOrder(wells).map((well) => {
    const duration = wellDuration(well);
    let next = 0;
    for (let r = 1; r < rigs.length; r += 1) {
      if (rigs[r] < rigs[next]) next = r;
    }
    const start = rigs[next];
    rigs[next] = start + duration;
    return { ...well, start, end: start + duration, rig: next + 1 };
  });
  return {
    schedule,
    rigFinishDays: [...rigs],
    totalDays: Math.max(...rigs, 0),
    rigDays: (wells || []).reduce((sum, w) => sum + wellDuration(w), 0),
  };
}
