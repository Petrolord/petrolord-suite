// Dev-only harness (/dev/capital-portfolio-studio; senior test T1, Wave 2
// #28): Capital Portfolio Studio on the in-memory Supabase double with a
// stand-in signed-in user, so projects and portfolios save without a database.
//
// Risked Reserves Valuation U2-009: the in-memory rrv_valuations holds the
// valuation the Risked Reserves harness saves with ?saved=1 (Ekene North, id
// valuation-1, the same row) and a colleague's shared one (Ekene Deep), so
// "Send to Capital Portfolio" there opens the intake here
// (?rrvValuation=valuation-1). window.__cpHarness (dev only) lets the e2e
// change a valuation, as Risked Reserves Valuation would.
import React from 'react';
import CapitalPortfolioStudio from '@/pages/apps/CapitalPortfolioStudio';
import { savedValuationRow, colleagueSharedRow } from '@/pages/apps/riskedreserves/services/rrvPortfolioFixtures';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import DevAuth from './DevAuth';

const db = createStore({
  portfolio_projects: [], portfolios: [], epe_mc_runs: [],
  rrv_valuations: [savedValuationRow({ userId: DEV_USER.id }), colleagueSharedRow()],
});
if (typeof window !== 'undefined') window.__cpHarness = db;

export default function CapitalPortfolioHarness() {
  return (
    <InMemorySupabase db={db}>
      <DevAuth><CapitalPortfolioStudio /></DevAuth>
    </InMemorySupabase>
  );
}
