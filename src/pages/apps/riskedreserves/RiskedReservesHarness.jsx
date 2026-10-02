// Dev-only harness (/dev/risked-reserves): the workstation on an in-memory
// ReservoirCalc Pro inventory and an in-memory account, no auth or DB.
//   ?table=off   the database before the rrv_valuations migration: valuations
//                stay in the browser and the page says so
//   ?saved=1     one valuation already saved on the account
//   ?shared=1    a colleague's shared prospect and shared valuation
//   ?legacy=1    adds a prospect saved before units and the basis were recorded
//   ?chain=1     ReservoirCalc Pro's own Prospect Risking panel above the
//                workstation, on the SAME inventory: risk a prospect there,
//                import it here (the chain the e2e walks)
// window.__rrvHarness (dev only) lets the e2e act as ReservoirCalc Pro:
// re-risk a prospect, or switch the table on.
import React, { useMemo } from 'react';
import RrvWorkstation from './components/RrvWorkstation';
import ProspectRiskingPanel from '../ReservoirCalcPro/components/tools/ProspectRiskingPanel';
import { makeInMemoryRrvBackend } from './services/rrvBackend';
import { fromRcpProspect, toRow } from './services/rrvStore';
import { RRV_SEED_PROSPECTS, RRV_LEGACY_PROSPECT, CHAIN_RUN } from './services/rrvFixtures';

export default function RiskedReservesHarness() {
  const backend = useMemo(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const seed = [...RRV_SEED_PROSPECTS, ...(q.get('legacy') === '1' ? [RRV_LEGACY_PROSPECT] : [])];
    const saved = q.get('saved') === '1'
      ? [{ ...toRow({ ...fromRcpProspect({ id: 'prospect-1', ...RRV_SEED_PROSPECTS[0] }, { now: new Date('2026-10-02T15:00:00Z') }), mefs: 15, touched: { mefs: true }, ident: { company: 'Harness Energy', licence: 'OML 143', play: 'Agbada stacked sands', analyst: 'A. Analyst' } }), schema_version: 1, updated_at: '2026-10-02T15:01:00.000Z' }]
      : [];
    const b = makeInMemoryRrvBackend(seed, { table: q.get('table') !== 'off', valuations: saved, sharedValuations: q.get('shared') === '1', sharedRows: q.get('shared') === '1' });
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
        <div className="flex-1 min-h-0"><RrvWorkstation backend={backend} /></div>
      </div>
    );
  }
  return <div className="h-screen w-full overflow-hidden"><RrvWorkstation backend={backend} /></div>;
}
