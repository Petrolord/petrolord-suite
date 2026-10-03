// The Ranking tab of Risked Reserves Valuation (upgrade U2-008,
// 2026-10-02): the user's valuations and, if wanted, those colleagues
// shared, ranked by EMV, risked volume or commercial chance, each with the
// basis it rests on, and a CSV with a provenance header. Every number is
// the valuation engine's; services/rrvRanking.js only orders and words.

import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { rankValuations, RANK_KEYS } from '../services/rrvRanking';
import { F } from '../services/rrvReportModel';

const card = 'rounded border border-pl-border bg-pl-surface p-3';
const btn = 'inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

/**
 * @param {{entries: Array, sharedEntries: Array, units: object, onSelect: function(string): void,
 *   onExport: function(object, boolean): void}} props entries as rankValuations takes them
 */
export default function RrvRankingPanel({ entries, sharedEntries, units, onSelect, onExport }) {
  const [by, setBy] = useState('emv');
  const [withShared, setWithShared] = useState(true);
  const ranked = useMemo(() => rankValuations(withShared ? [...entries, ...sharedEntries] : entries, by), [entries, sharedEntries, withShared, by]);
  return (
    <div className="space-y-3" data-testid="rrv-ranking" data-by={ranked.by}>
      <div className={`${card} flex flex-wrap items-center gap-3 text-xs`}>
        <span className="font-semibold text-pl-text">Rank by</span>
        {Object.entries(RANK_KEYS).map(([k, { label }]) => (
          <label key={k} className="inline-flex items-center gap-1.5">
            <input type="radio" name="rrv-rank-by" checked={by === k} onChange={() => setBy(k)} data-testid={`rrv-rank-by-${k}`} /> {label}
          </label>
        ))}
        <label className="inline-flex items-center gap-1.5 ml-2">
          <input type="checkbox" checked={withShared} onChange={(e) => setWithShared(e.target.checked)} data-testid="rrv-rank-shared" /> Include valuations shared with me ({sharedEntries.length})
        </label>
        <button type="button" className={`${btn} ml-auto`} disabled={!ranked.rows.length} onClick={() => onExport(ranked, withShared)} data-testid="rrv-rank-csv"><Download className="w-3.5 h-3.5" /> CSV</button>
      </div>
      <div className="overflow-x-auto rounded border border-pl-border bg-pl-surface">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="text-pl-muted">
            <tr>
              {['#', 'Prospect', 'Owner', 'Pg', 'Pc', `Risked mean (${units.volumeLabel})`, 'EMV ($MM)', 'EMV per well $', 'Basis'].map((c) => <th key={c} className="text-left font-medium px-2 py-1 border-b border-pl-border">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {ranked.rows.map((r) => (
              <tr key={`${r.shared ? 's' : 'o'}-${r.id}`} className="border-b border-pl-border last:border-0 align-top hover:bg-pl-sunken cursor-pointer" onClick={() => onSelect(r.id)} data-testid={`rrv-rank-row-${r.rank}`} data-name={r.name}>
                <td className="px-2 py-1 font-pl-mono tabular-nums">{r.rank}</td>
                <td className="px-2 py-1 text-pl-text">{r.name}</td>
                <td className="px-2 py-1 text-pl-muted">{r.shared ? `shared by ${r.owner}` : 'you'}</td>
                <td className="px-2 py-1 font-pl-mono tabular-nums">{F.pct(r.pg)}</td>
                <td className="px-2 py-1 font-pl-mono tabular-nums">{F.pct(r.pc)}</td>
                <td className="px-2 py-1 font-pl-mono tabular-nums">{F.n1(units.volume(r.riskedMean))}</td>
                <td className={`px-2 py-1 font-pl-mono tabular-nums ${r.emv < 0 ? 'text-pl-danger-text' : 'text-pl-success-text'}`}>{F.n1(r.emv)}</td>
                <td className="px-2 py-1 font-pl-mono tabular-nums">{F.n2(r.emvPerWellDollar)}</td>
                <td className="px-2 py-1 text-pl-muted min-w-[260px]">{r.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ranked.unranked.length > 0 && (
        <p className="text-xs text-pl-warning-text" data-testid="rrv-rank-unranked">
          Not ranked until their inputs are fixed: {ranked.unranked.map((x) => `${x.name}${x.shared ? ' (shared)' : ''} (${x.problem})`).join('; ')}
        </p>
      )}
      <p className="text-[11px] text-pl-muted" data-testid="rrv-rank-note">
        Ranked by {RANK_KEYS[ranked.by].word}. Each prospect is valued on its own; the ranking assumes nothing about dependence between prospects. EMV per well dollar is the EMV over the exploration well cost. The basis column says what each row rests on: where its volumes came from, where the value of a discovery came from, and whether the MEFS is derived or typed.
      </p>
    </div>
  );
}
