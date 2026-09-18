/**
 * ASC-0 (RC-6): the Risk Register's figures, from one population.
 *
 * The dashboard heatmap and its Critical tile counted Open and Under
 * Review, the Heatmap tab counted the four live statuses, the Total tile
 * counted Draft and Closed as well, and "Mitigated or closed" added a
 * live status to a finished one. Every live figure now comes from the
 * engine's RISK_LIVE_STATUSES, the not-live figure from
 * RISK_NOT_LIVE_STATUSES, and the bands from countByBand, so the tiles,
 * both heatmaps and the register filter behind a clicked cell agree.
 */
import {
  RISK_LIVE_STATUSES,
  RISK_NOT_LIVE_STATUSES,
  countByBand,
} from '@/lib/riskScoring';

/** How a filter or a caption names the live population. */
export const LIVE_SCOPE = `live risks (${RISK_LIVE_STATUSES.join(', ')})`;

export const isLiveRisk = (risk) => RISK_LIVE_STATUSES.includes(risk?.status);

export const liveRisks = (risks = []) => risks.filter(isLiveRisk);

/**
 * `live`: risks still carried. `liveCritical`: live risks whose
 * inherent score is in the Critical band (the heatmaps plot inherent).
 * `liveMitigated`: live risks with the status Mitigated, still carried.
 * `notLive`: Draft or Closed. `recorded`: every row.
 */
export const registerCounts = (risks = []) => {
  const live = liveRisks(risks);
  return {
    recorded: risks.length,
    live: live.length,
    liveCritical: countByBand(live).Critical,
    liveMitigated: live.filter((r) => r.status === 'Mitigated').length,
    notLive: risks.filter((r) => RISK_NOT_LIVE_STATUSES.includes(r.status)).length,
  };
};
