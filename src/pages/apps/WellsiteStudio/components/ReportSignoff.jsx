// Sign-off (spec section 32): an authenticated record of who signed
// which report version and the hash of its content, made offline and
// countersigned by the platform after synchronising. The block below
// the report is a rendering of that record.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toRigLocal } from '@/lib/wellsite/time';
import { roleName } from '../services/vocab';

export default function ReportSignoff({ signoffs, role, userName, onSign, offsetMin, reportVersion, contentHash, canSign = true }) {
  const [statement, setStatement] = useState('I confirm this report reflects the well record for the period.');
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).iso.replace('T', ' ');
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-3 space-y-2 text-xs" data-testid="ws-signoff">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">Sign-off</div>
      {signoffs.map((so) => (
        <div key={so.id} data-testid={`ws-signoff-row-${so.id}`} data-countersigned={so.countersignature ? '1' : '0'} className="text-slate-300">
          Signed by {so.user_name || so.user_id} ({roleName(so.role)}) at {local(so.signed_at)} rig time ({so.signed_at} UTC), report version {so.report_version}, hash {String(so.content_hash).slice(0, 23)}.
          <div className="text-[11px] text-slate-500">{so.countersignature ? `Countersigned by Petrolord (key ${so.countersignature.key_id}) at ${so.countersigned_at}${so.countersignature.certificate_no ? `, certificate ${so.countersignature.certificate_no}` : ''}.` : 'Platform countersignature pending until synchronised.'}</div>
        </div>
      ))}
      {signoffs.length === 0 && <div className="text-slate-500">Not signed.</div>}
      {canSign && (
        <div className="flex items-end gap-2 flex-wrap pt-1">
          <label className="text-[10px] text-slate-400 grow">Statement<br /><input value={statement} onChange={(e) => setStatement(e.target.value)} data-testid="ws-signoff-statement" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100" /></label>
          <Button size="sm" onClick={() => onSign(statement)} disabled={!role || !statement.trim()} data-testid="ws-signoff-sign" title={role ? `Sign as ${userName}, ${roleName(role)}` : 'You are not a member of this well'}>Sign as {roleName(role || 'member')}</Button>
        </div>
      )}
      <div className="text-[10px] text-slate-600">Report version {reportVersion || 'not yet recorded'}{contentHash ? `, content hash ${String(contentHash).slice(0, 23)}` : ''}. Signing records this version.</div>
    </div>
  );
}
