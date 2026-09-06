// Conflict resolution (spec section 26): competing versions stay; an
// approver reads them side by side and records a resolving version that
// cites both. Anyone else sees them and waits.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtDepth } from '../services/units';
import { toRigLocal } from '@/lib/wellsite/time';

export default function ConflictResolver({ heads, approver, onResolve, unit, offsetMin, userName }) {
  const [chosen, setChosen] = useState(heads[0] ? heads[0].id : '');
  const [basis, setBasis] = useState('');
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;
  return (
    <div className="rounded border border-amber-500/50 bg-amber-500/5 p-2 space-y-2 text-xs" data-testid="ws-conflict">
      <div className="text-amber-200">Competing versions{approver ? ', choose the one the record keeps' : ', awaiting an approver'}</div>
      <table className="w-full text-slate-300"><tbody>
        {heads.map((h) => (
          <tr key={h.id} data-testid={`ws-conflict-head-${h.id}`}>
            <td className="pr-2">{approver && <input type="radio" name="head" checked={chosen === h.id} onChange={() => setChosen(h.id)} data-testid={`ws-conflict-pick-${h.id}`} />}</td>
            <td className="pr-2 whitespace-nowrap">{fmtDepth(h.md_calc_m, unit)}</td>
            <td className="pr-2">{h.status}{h.confidence ? `, ${h.confidence}` : ''}</td>
            <td className="pr-2 text-slate-500">{h.basis || ''}</td>
            <td className="whitespace-nowrap text-slate-500">{local(h.occurred_at)} v{h.version_no} by {h.created_by === 'user-a' ? userName : h.created_by}</td>
          </tr>
        ))}
      </tbody></table>
      {approver && (
        <div className="flex items-center gap-2">
          <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="why this one stands" data-testid="ws-conflict-basis" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 w-72" />
          <Button size="sm" disabled={!basis.trim() || !chosen} onClick={() => onResolve(heads.find((h) => h.id === chosen), basis.trim(), heads)} data-testid="ws-conflict-resolve">Record resolution</Button>
        </div>
      )}
    </div>
  );
}
