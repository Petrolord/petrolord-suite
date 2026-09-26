// Dev-only harness (/dev/capital-portfolio-studio; senior test T1, Wave 2
// #28): Capital Portfolio Studio on the in-memory Supabase double with a
// stand-in signed-in user, so projects and portfolios save without a database.
import React from 'react';
import CapitalPortfolioStudio from '@/pages/apps/CapitalPortfolioStudio';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import DevAuth from './DevAuth';

const db = createStore({ portfolio_projects: [], portfolios: [], epe_mc_runs: [] });

export default function CapitalPortfolioHarness() {
  return (
    <InMemorySupabase db={db}>
      <DevAuth><div className="min-h-screen bg-slate-950 text-slate-100"><CapitalPortfolioStudio /></div></DevAuth>
    </InMemorySupabase>
  );
}
