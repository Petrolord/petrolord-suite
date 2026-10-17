// The NAPE 2026 series as email_campaign task rows (status proposed). Pure:
// counts are passed in from src/data/suiteCatalog.js by propose.mjs.
import { napeSeries, SERIES, REASON, lagosNine } from '../templates/nape2026.mjs';
import { buildCampaignPayload, KIND } from './campaign.mjs';

export function napeTasks(stats, { only } = {}) {
  return napeSeries(stats)
    .filter((d) => !only || only.includes(d.n))
    .map((d) => {
      const payload = buildCampaignPayload(d, { series: SERIES, scheduledAt: lagosNine(d.date), reason: REASON });
      return { kind: KIND, title: payload.subject, payload, status: 'proposed' };
    });
}
