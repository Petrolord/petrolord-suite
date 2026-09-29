// Data AI facies in the Studio (AppUpgrade PETRO-U2-006): each Electrofacies
// Studio curve on the well, a button to draw it as a strip beside the rule
// and crossplot facies, and how it agrees with the published rule facies.

import React, { useState } from 'react';
import { faciesCrosstab } from '../services/mlFacies';

export default function MlFaciesPanel({ items = [], depth = null, intervals = [], onShow }) {
  const [compare, setCompare] = useState(null); // mnemonic
  if (!items.length) return null;
  const rule = (intervals || []).filter((r) => r.kind === 'electrofacies');
  const item = items.find((x) => x.log.mnemonic === compare);
  const tab = item && rule.length && depth ? faciesCrosstab(depth, rule, 'electrofacies', item.rows, item.kind) : null;
  return (
    <div className="mt-1 pt-1 border-t border-pl-border text-[10px]" data-testid="petro-mlfacies">
      <div className="text-pl-muted">Data AI facies</div>
      {items.map((x) => (
        <div key={x.log.mnemonic} className="flex flex-wrap items-center gap-1">
          <span className="text-pl-text">{x.log.mnemonic}</span>
          <span className="text-pl-muted">{x.method || 'electrofacies'}, {x.labels.length} classes</span>
          <button type="button" className="px-1 rounded border border-pl-border hover:bg-pl-sunken" data-testid={`petro-mlfacies-show-${x.log.mnemonic}`} onClick={() => onShow(x)}>Show</button>
          {rule.length > 0 && (
            <button type="button" className="px-1 rounded border border-pl-border hover:bg-pl-sunken" data-testid={`petro-mlfacies-compare-${x.log.mnemonic}`} onClick={() => setCompare(compare === x.log.mnemonic ? null : x.log.mnemonic)}>Compare</button>
          )}
        </div>
      ))}
      {!rule.length && <div className="text-pl-muted">Publish rule facies (Rules…) to compare them with these classes.</div>}
      {tab && (
        <div className="overflow-x-auto" data-testid="petro-mlfacies-crosstab">
          <table className="border-collapse">
            <thead>
              <tr><th className="px-1 text-left font-normal text-pl-muted">rule \ {compare}</th>{tab.b.map((b) => <th key={b} className="px-1 font-normal text-pl-muted">{b}</th>)}</tr>
            </thead>
            <tbody>
              {tab.a.map((a, i) => (
                <tr key={a}>
                  <td className="px-1 text-pl-text">{a}</td>
                  {tab.counts[i].map((c, j) => <td key={j} className="px-1 text-right">{tab.n ? `${Math.round((100 * c) / tab.n)}%` : '0%'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-pl-muted">{tab.n} samples carry both.</div>
        </div>
      )}
    </div>
  );
}
