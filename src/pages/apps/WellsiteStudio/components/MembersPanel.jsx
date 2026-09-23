// Members of the live well (spec section 9), on the Config view: who can
// read and write this well and in which role. An administrator of the well
// (or of the organisation) adds people from the organisation, changes a
// role, or makes a member inactive; the server checks the same rule.
// Inactive members keep their name on everything they recorded.

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WS_ROLES, roleName } from '../services/vocab';
import { canManageMembers, memberChangeError, memberName } from '../services/members';

export default function MembersPanel({ backend, well, members, user, onChanged, onStatus }) {
  const [people, setPeople] = useState(null);
  const [addId, setAddId] = useState('');
  const [addRole, setAddRole] = useState('wellsite_geologist');
  const [busy, setBusy] = useState(false);
  const online = backend.online();
  const canManage = canManageMembers(user, members);

  useEffect(() => {
    let alive = true;
    if (!online) { setPeople(null); return undefined; }
    backend.listOrgPeople(well.id).then((p) => { if (alive) setPeople(p); }).catch((e) => { if (alive) { setPeople([]); onStatus?.(e.message); } });
    return () => { alive = false; };
  }, [backend, well.id, online, onStatus]);

  const sorted = useMemo(() => [...(members || [])].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)), [members]);
  const addable = useMemo(() => (people || []).filter((p) => !(members || []).some((m) => m.user_id === p.user_id && m.status === 'active')), [people, members]);

  const change = async (userId, role, status, done) => {
    const refused = memberChangeError(members, { userId, role, status });
    if (refused) { onStatus?.(refused); return; }
    setBusy(true);
    try {
      await backend.setMember(well.id, { userId, role, status });
      onStatus?.(done);
      onChanged?.();
    } catch (e) { onStatus?.(e.message); } finally { setBusy(false); }
  };

  const nameOf = (m) => memberName(m, people, user);
  const sel = 'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';
  return (
    <section className="space-y-2" data-testid="ws-members">
      <h2 className="text-sm font-semibold text-slate-100">Members</h2>
      <p className="text-[11px] text-slate-400">Only members open this well and record on it. Roles decide who may approve (see the approver roles below). A member who leaves is made inactive, so their name stays on what they recorded.</p>
      {!online && <div className="text-[11px] text-amber-400" data-testid="ws-members-offline">A connection is needed to change members.</div>}
      {online && !canManage && <div className="text-[11px] text-amber-400" data-testid="ws-members-readonly">Only a well administrator or an organisation administrator changes members.</div>}
      <table className="w-full text-xs text-slate-300">
        <thead><tr className="text-left text-slate-500"><th className="py-1">Person</th><th>Role</th><th>Status</th><th /></tr></thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.id} className="border-t border-slate-800" data-testid={`ws-member-${m.user_id}`}>
              <td className="py-1">{nameOf(m)}{user && m.user_id === user.id ? ' (you)' : ''}</td>
              <td>
                {canManage && online && m.status === 'active'
                  ? (
                    <select className={sel} value={m.role} disabled={busy} data-testid={`ws-member-role-${m.user_id}`}
                      onChange={(e) => change(m.user_id, e.target.value, 'active', `${nameOf(m)} is now ${roleName(e.target.value)}.`)}>
                      {WS_ROLES.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                    </select>
                  )
                  : roleName(m.role)}
              </td>
              <td className={m.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}>{m.status}</td>
              <td className="text-right">
                {canManage && online && (m.status === 'active'
                  ? <Button size="sm" variant="outline" disabled={busy} data-testid={`ws-member-deactivate-${m.user_id}`} onClick={() => change(m.user_id, m.role, 'inactive', `${nameOf(m)} is no longer a member.`)}>Make inactive</Button>
                  : <Button size="sm" variant="outline" disabled={busy} data-testid={`ws-member-reactivate-${m.user_id}`} onClick={() => change(m.user_id, m.role, 'active', `${nameOf(m)} is a member again.`)}>Make active</Button>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && online && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="text-xs text-slate-300">Add a person from the organisation<br />
            <select className={sel} value={addId} onChange={(e) => setAddId(e.target.value)} data-testid="ws-member-add-person">
              <option value="">{people ? (addable.length ? 'choose a person' : 'everyone is already a member') : 'loading people'}</option>
              {addable.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}{p.email && p.email !== p.name ? ` (${p.email})` : ''}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">Role<br />
            <select className={sel} value={addRole} onChange={(e) => setAddRole(e.target.value)} data-testid="ws-member-add-role">
              {WS_ROLES.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </label>
          <Button size="sm" disabled={busy || !addId} data-testid="ws-member-add"
            onClick={async () => {
              const p = addable.find((x) => x.user_id === addId);
              await change(addId, addRole, 'active', `${p ? p.name : 'The person'} added as ${roleName(addRole)}.`);
              setAddId('');
            }}>Add member</Button>
        </div>
      )}
    </section>
  );
}
