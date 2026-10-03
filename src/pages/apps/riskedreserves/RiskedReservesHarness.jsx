// Dev-only harness (/dev/risked-reserves): the workstation on an in-memory
// ReservoirCalc Pro inventory and an in-memory account, no auth or DB.
//   ?table=off   the database before the rrv_valuations migration: valuations
//                stay in the browser and the page says so
//   ?saved=1     one valuation already saved on the account
//   ?shared=1    a colleague's shared prospect and shared valuation
//   ?legacy=1    adds a prospect saved before units and the basis were recorded
//   ?rerunDone=1 Ekene North saved, then re-run in ReservoirCalc Pro (a new
//                record naming prospect-1, which is retired): with
//                ?refresh=prospect-1 it is the way back from that app
//   ?epe=off     no Petroleum Economics Studio runs to pick (the default has
//                three: two that can be sent and one with no results)
//   ?epeRun=id   as the link from a Petroleum Economics Studio run: the run
//                is offered to the selected prospect on the Economics tab
//   ?chain=1     ReservoirCalc Pro's own Prospect Risking panel above the
//                workstation, on the SAME inventory: risk a prospect there,
//                import it here (the chain the e2e walks)
// window.__rrvHarness (dev only) lets the e2e act as ReservoirCalc Pro:
// re-risk a prospect, or switch the table on.
import React, { useMemo } from 'react';
import RrvWorkstation from './components/RrvWorkstation';
import ProspectRiskingPanel from '../ReservoirCalcPro/components/tools/ProspectRiskingPanel';
import { makeInMemoryRrvBackend } from './services/rrvBackend';
import { fromRcpProspect, toRow, setInput } from './services/rrvStore';
import { RRV_SEED_PROSPECTS, RRV_LEGACY_PROSPECT, CHAIN_RUN, RRV_EPE_RUNS } from './services/rrvFixtures';

export default function RiskedReservesHarness() {
  const backend = useMemo(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    // ?rerunDone=1: the shared database after ReservoirCalc Pro re-ran Ekene
    // North (U2-006): a new record that names prospect-1, which was retired
    const rerunDone = q.get('rerunDone') === '1';
    const north = RRV_SEED_PROSPECTS[0];
    const rerunRow = { ...north, id: 'prospect-3', updated_at: '2026-10-03T09:00:00.000Z', inputs: { ...north.inputs, mean: 41, p90: 14, p50: 34, p10: 80, source: { ...north.inputs.source, replaces: 'prospect-1', run: { ...north.inputs.source.run, ranAt: '2026-10-03T08:55:00.000Z' } } }, risked: { ...north.risked, success: { p90: 14, p50: 34, p10: 80, mean: 41 } } };
    const seed = [...(rerunDone ? [rerunRow, RRV_SEED_PROSPECTS[1]] : RRV_SEED_PROSPECTS), ...(q.get('legacy') === '1' ? [RRV_LEGACY_PROSPECT] : [])];
    const saved = q.get('saved') === '1' || rerunDone
      ? [{ ...toRow({ ...setInput(fromRcpProspect({ id: 'prospect-1', ...RRV_SEED_PROSPECTS[0] }, { now: new Date('2026-10-02T15:00:00Z') }), 'mefs', 15), ident: { company: 'Harness Energy', licence: 'OML 143', play: 'Agbada stacked sands', analyst: 'A. Analyst' } }), schema_version: 1, updated_at: '2026-10-02T15:01:00.000Z' }]
      : [];
    const b = makeInMemoryRrvBackend(seed, { table: q.get('table') !== 'off', valuations: saved, sharedValuations: q.get('shared') === '1', sharedRows: q.get('shared') === '1', epeRuns: q.get('epe') === 'off' ? [] : RRV_EPE_RUNS });
    if (typeof window !== 'undefined') window.__rrvHarness = b;
    return b;
  }, []);
  const chain = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('chain') === '1';
  if (chain) {
    return (
      <div className="h-screen w-full flex flex-col overflow-hidden">
        <div className="max-h-[46%] overflow-auto border-b border-pl-border bg-pl-surface p-3" data-testid="rrv-chain-rcp">
          <div className="mb-1 text-[11px] text-pl-muted">ReservoirCalc Pro, Prospect Risking (the sending side of the chain)</div>
          <ProspectRiskingPanel backend={backend} unrisked={CHAIN_RUN.unrisked} source={CHAIN_RUN.source} valuationHref="#valuation" />
        </div>
        <div className="flex-1 min-h-0"><RrvWorkstation backend={backend} rcpHref="/dev/reservoircalc-pro" /></div>
      </div>
    );
  }
  return <div className="h-screen w-full overflow-hidden"><RrvWorkstation backend={backend} rcpHref="/dev/reservoircalc-pro" /></div>;
}
