// Suite Projects P3: members and roles of the current project, and its log
// (admin opens of a members-only project, visibility, members, archive,
// moves). Owners and organisation admins manage; members read.
//   owner   manages the project, its members and settings
//   editor  adds and changes data in the project
//   viewer  reads a members-only project's data, changes nothing
// In a project open to the organisation every colleague reads and adds data
// already; membership matters most for members-only projects.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, History, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/use-toast';
import { useProject } from '@/contexts/ProjectContext';
import {
  PROJECT_ROLES, listProjectMembers, listOrgColleagues, addProjectMember, setProjectMemberRole, removeProjectMember, listAccessLog,
} from '@/lib/projects/projectsService';

const ROLE_LABEL = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

const EVENT_TEXT = {
  admin_open: 'opened the members-only project as an organisation admin',
  visibility_changed: 'changed who can see the project',
  member_added: 'added a member',
  member_removed: 'removed a member',
  member_role_changed: 'changed a member role',
  archived: 'archived the project',
  restored: 'restored the project',
  client_changed: 'changed the client',
  rows_moved_in: 'moved records in',
  rows_moved_out: 'moved records out',
  created: 'created the project',
  deleted: 'deleted the project',
};

export default function ProjectMembersCard() {
  const p = useProject();
  const { toast } = useToast();
  const project = p.current;
  const canEdit = p.canManage(project);
  const [members, setMembers] = useState(null);
  const [colleagues, setColleagues] = useState([]);
  const [log, setLog] = useState([]);
  const [pick, setPick] = useState('');
  const [pickRole, setPickRole] = useState('editor');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const [m, c, l] = await Promise.all([
        listProjectMembers(project.id),
        listOrgColleagues(project.organization_id),
        canEdit ? listAccessLog(project.id) : Promise.resolve([]),
      ]);
      setMembers(m); setColleagues(c); setLog(l);
    } catch (e) {
      setMembers([]);
      toast({ variant: 'destructive', title: 'Members not loaded', description: e.message });
    }
  }, [project, canEdit, toast]);
  useEffect(() => { load(); }, [load]);

  const nameOf = useMemo(() => {
    const m = new Map(colleagues.map((c) => [c.user_id, c.full_name || c.email || 'A colleague']));
    return (id) => m.get(id) || (id ? `User ${String(id).slice(0, 8)}` : 'Someone');
  }, [colleagues]);

  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); toast({ title: done }); await load(); } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e.message });
    } finally { setBusy(false); }
  };

  if (!p.available || !project) return null;
  if (!project.organization_id) return null; // a personal project has its owner only

  const memberIds = new Set((members || []).map((m) => m.user_id));
  const candidates = colleagues.filter((c) => !memberIds.has(c.user_id));

  return (
    <Card data-testid="projects-members">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Members of {project.name}</CardTitle>
        <CardDescription>
          {project.visibility === 'members'
            ? 'Members only: these people read the project\'s data. Editors and owners also add and change it.'
            : 'This project is open to your organisation, so every colleague can read it. Members matter once you make it members only.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-pl-border" data-testid="projects-members-list">
          {members === null ? <p className="px-3 py-2 text-sm text-pl-muted">Loading...</p> : members.map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center gap-2 border-b border-pl-border px-3 py-2 last:border-b-0" data-testid={`projects-member-${m.user_id}`}>
              <span className="flex-1 text-sm text-pl-text">{nameOf(m.user_id)}{m.user_id === project.owner_user_id && <span className="ml-2 text-[11px] text-pl-muted">project owner</span>}</span>
              {canEdit && m.user_id !== project.owner_user_id ? (
                <>
                  <NativeSelect compact className="w-28" value={m.role} aria-label={`Role of ${nameOf(m.user_id)}`} disabled={busy}
                    onChange={(e) => run(() => setProjectMemberRole(project.id, m.user_id, e.target.value), 'Role changed')}>
                    {PROJECT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </NativeSelect>
                  <Button variant="outline" size="sm" disabled={busy} aria-label={`Remove ${nameOf(m.user_id)}`}
                    onClick={() => run(() => removeProjectMember(project.id, m.user_id), 'Member removed')}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : <span className="text-xs text-pl-muted">{ROLE_LABEL[m.role] || m.role}</span>}
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2" data-testid="projects-members-add">
            <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} className="max-w-xs" aria-label="Colleague to add">
              <option value="">Add a colleague</option>
              {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name || c.email}</option>)}
            </NativeSelect>
            <NativeSelect value={pickRole} onChange={(e) => setPickRole(e.target.value)} className="w-32" aria-label="Role">
              {PROJECT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </NativeSelect>
            <Button size="sm" disabled={!pick || busy}
              onClick={() => run(async () => { await addProjectMember(project.id, pick, pickRole); setPick(''); }, 'Member added')}>
              <UserPlus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}
        {canEdit && log.length > 0 && (
          <details className="text-sm" data-testid="projects-log">
            <summary className="flex cursor-pointer items-center gap-1 text-pl-muted"><History className="h-3.5 w-3.5" /> Project log</summary>
            <ul className="mt-2 space-y-1">
              {log.map((e) => (
                <li key={e.id} className={`text-xs ${e.event === 'admin_open' ? 'text-pl-warning-text' : 'text-pl-muted'}`}>
                  {new Date(e.created_at).toLocaleString('en-GB')}: {nameOf(e.actor_id)} {EVENT_TEXT[e.event] || e.event}
                  {e.detail?.count ? ` (${e.detail.count})` : ''}
                  {e.detail?.user_id ? `: ${nameOf(e.detail.user_id)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
