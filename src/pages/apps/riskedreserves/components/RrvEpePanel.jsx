// The Petroleum Economics Studio case of a valuation (Risked Reserves
// Valuation U2-001, 2026-10-02). A saved run of that app is picked by id;
// its value per barrel and development cost become the value of a discovery
// here, and the whole handoff (run, case, price deck, discount rate, dates,
// builds) stays with the valuation. The panel says whether the run still
// says what it said, and nothing here names that app as the source unless a
// case was received.

import React, { useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { epePriceDeckLine, epeDiscountLine } from '@/pages/apps/epe/epeUnitValue';
import { epeHandoffRows, epeSentence, F } from '../services/rrvReportModel';

const card = 'rounded border border-pl-border bg-pl-surface p-3';
const h = 'text-xs font-semibold text-pl-text mb-2';
const btn = 'inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';
const day = (iso) => (iso ? String(iso).slice(0, 10) : 'n/a');

/**
 * @param {{prospect: object, state: object, checking?: boolean, units: object, readOnly?: boolean,
 *   offered?: ?object, listCases: ?function(): Promise<Array>, onUse: function(object): void,
 *   onUseAgain: function(): void, onDismissOffer?: function(): void}} props
 *   `state` is epeState(prospect, the run as it is now); `offered` a contract that arrived by link
 */
export default function RrvEpePanel({ prospect, state, checking = false, units, readOnly = false, offered = null, listCases, onUse, onUseAgain, onDismissOffer }) {
  const [list, setList] = useState(null); // null closed; 'loading'; Array; {error}
  const held = prospect.econ?.epe || null;
  const inUse = prospect.econ?.value === 'epe';
  const rows = epeHandoffRows(prospect, state, units);
  const uv = (x) => `${F.plain(units.unitValue(x))} ${units.unitValueLabel}`;

  const openList = async () => {
    if (!listCases) return;
    setList('loading');
    try { setList(await listCases()); } catch (e) { setList({ error: e.message }); }
  };
  const sentence = checking ? 'Checking the run in Petroleum Economics Studio.' : state.state === 'current' ? 'The run is unchanged since its value was received.' : epeSentence(state, units);

  return (
    <div className={card} data-testid="rrv-epe" data-state={held ? (checking ? 'checking' : state.state) : 'none'} data-in-use={inUse ? 'true' : 'false'}>
      <div className={h}>Petroleum Economics Studio case</div>

      {offered && !readOnly && (
        <div className="mb-3 rounded border border-pl-primary bg-pl-primary/10 px-3 py-2 text-xs" data-testid="rrv-epe-offer">
          <p className="text-pl-text">
            Sent from Petroleum Economics Studio: run &quot;{offered.runName}&quot;{offered.caseName ? ` of case "${offered.caseName}"` : ''}, {uv(offered.unitValue)} before capex, development {F.plain(offered.devCost)} $MM, {epeDiscountLine(offered)}.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className={btn} data-testid="rrv-epe-offer-use" onClick={() => onUse(offered)}>Use it for {prospect.name}</button>
            <button type="button" className={btn} data-testid="rrv-epe-offer-dismiss" onClick={onDismissOffer}>Not for this prospect</button>
          </div>
        </div>
      )}

      {!held && (
        <p className="text-xs text-pl-muted" data-testid="rrv-epe-none">
          No case has been received for this prospect. Pick a saved run to take its NPV per barrel and development capex as the value of a discovery; its price deck, discount rate, date and build travel with it.
        </p>
      )}

      {held && (
        <>
          <p className={`text-xs ${inUse ? 'text-pl-text' : 'text-pl-warning-text'}`} data-testid="rrv-epe-status">
            {inUse
              ? `In use: run "${held.runName}"${held.caseName ? ` of case "${held.caseName}"` : ''}, received ${day(held.receivedAt)}.`
              : `Received ${day(held.receivedAt)} from run "${held.runName}" and no longer in use: the value per barrel or the development cost was changed here.`}
            {' '}<span className={!checking && state.state !== 'current' ? 'text-pl-warning-text' : 'text-pl-muted'} data-testid="rrv-epe-source-now">{sentence}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!readOnly && state.state === 'changed' && state.contract && (
              <button type="button" className={btn} data-testid="rrv-epe-refresh" onClick={() => onUse(state.contract)}><RefreshCw className="w-3.5 h-3.5" /> Refresh from Petroleum Economics Studio</button>
            )}
            {!readOnly && !inUse && <button type="button" className={btn} data-testid="rrv-epe-use-again" onClick={onUseAgain}>Use the received case again</button>}
          </div>
          <dl className="mt-3 space-y-1 text-xs" data-testid="rrv-epe-handoff">
            {rows.map(([k, val]) => (
              <div key={k} className="flex flex-wrap gap-x-2"><dt className="w-56 shrink-0 text-pl-muted">{k}</dt><dd className="flex-1 min-w-[200px] text-pl-text">{val}</dd></div>
            ))}
          </dl>
        </>
      )}

      {!readOnly && (
        <div className="mt-3">
          <button type="button" className={btn} data-testid="rrv-epe-pick" onClick={openList} disabled={!listCases || list === 'loading'}>
            <Link2 className="w-3.5 h-3.5" /> {list === 'loading' ? 'Reading your runs' : held ? 'Pick another run' : 'Pick a Petroleum Economics Studio run'}
          </button>
        </div>
      )}
      {list && list !== 'loading' && list.error && <p className="mt-2 text-xs text-pl-warning-text" data-testid="rrv-epe-list-error">{list.error}</p>}
      {Array.isArray(list) && (
        list.length === 0
          ? <p className="mt-2 text-xs text-pl-muted" data-testid="rrv-epe-list-empty">You have no saved runs in Petroleum Economics Studio. Run a development case there first.</p>
          : (
            <div className="mt-2 overflow-x-auto" data-testid="rrv-epe-list">
              <table className="w-full text-xs">
                <thead className="text-pl-muted">
                  <tr>{['Case', 'Run', 'Saved', 'Price deck', 'Discount rate', `NPV per barrel (${units.unitValueLabel})`, `Before capex, u (${units.unitValueLabel})`, 'Capex, D ($MM)', ''].map((c) => <th key={c} className="text-left font-medium px-1.5 py-1 border-b border-pl-border">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.runId} className="border-b border-pl-border last:border-0 align-top" data-testid={`rrv-epe-row-${x.runId}`}>
                      <td className="px-1.5 py-1">{x.caseName || 'n/a'}</td>
                      <td className="px-1.5 py-1">{x.runName || 'n/a'}</td>
                      <td className="px-1.5 py-1 font-pl-mono tabular-nums">{day(x.runSavedAt)}</td>
                      {x.ok ? (
                        <>
                          <td className="px-1.5 py-1">{epePriceDeckLine(x.contract)}</td>
                          <td className="px-1.5 py-1">{epeDiscountLine(x.contract)}</td>
                          <td className="px-1.5 py-1 font-pl-mono tabular-nums">{F.n2(units.unitValue(x.contract.npvPerBoe))}</td>
                          <td className="px-1.5 py-1 font-pl-mono tabular-nums">{F.n2(units.unitValue(x.contract.unitValue))}</td>
                          <td className="px-1.5 py-1 font-pl-mono tabular-nums">{F.n1(x.contract.devCost)}</td>
                          <td className="px-1.5 py-1 text-right"><button type="button" className={btn} data-testid={`rrv-epe-use-${x.runId}`} onClick={() => { onUse(x.contract); setList(null); }}>Use</button></td>
                        </>
                      ) : <td colSpan={6} className="px-1.5 py-1 text-pl-muted">Cannot be used: {x.reason}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  );
}
