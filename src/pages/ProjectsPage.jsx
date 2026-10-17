// Suite Projects P1: clients and projects (docs/scope/SuiteProject-DESIGN.md
// sections 7, 12 and 13). Create clients (companies) and projects, switch
// project, archive and restore, make a project members only, and move wells,
// surfaces and seismic out of the Default project into a client project.
// Theme roles only.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderKanban, Building2, Plus, Archive, ArchiveRestore, ArrowRightLeft, Lock, Unlock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/use-toast';
import { AccountScope, AccountPage, AccountHeader, accountCallout } from '@/components/account/accountChrome';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { MOVABLE, APP_MOVABLE, listMovable, moveToProject } from '@/lib/projects/projectsService';
import { INTERNAL_LABEL, projectLabel } from '@/lib/projects/projectGrouping';
import ProjectSettingsCard from '@/components/projects/ProjectSettingsCard';
import ProjectMembersCard from '@/components/projects/ProjectMembersCard';
import { copyToProject, isCopyable } from '@/lib/projects/copyToProject';
import { useDeepLinkAction } from '@/lib/journey/deepLinks';

const DEFAULT_COLOUR = '#2563EB';

function Swatch({ colour, size = 'h-3 w-3' }) {
  return <span aria-hidden="true" className={`inline-block ${size} shrink-0 rounded-full border border-pl-border`} style={{ backgroundColor: colour || 'transparent' }} />;
}

function useRun() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);
  const run = async (what, fn, done) => {
    setBusy(what);
    try {
      const res = await fn();
      if (done) toast({ title: typeof done === 'function' ? done(res) : done });
      return res;
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e.message });
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function NewClientForm({ onCreate, busy }) {
  const [name, setName] = useState('');
  const [colour, setColour] = useState(DEFAULT_COLOUR);
  const [notes, setNotes] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const ok = await onCreate({ name, colour, notes, logoUrl });
    if (ok) { setName(''); setNotes(''); setLogoUrl(''); }
  };
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" data-testid="projects-new-client">
      <div className="grid gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name, for example Breeze Energy" aria-label="Client name" data-testid="projects-new-client-name" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-pl-muted">
            Colour
            <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} aria-label="Client colour" className="h-7 w-10 cursor-pointer rounded border border-pl-border bg-pl-surface" />
          </label>
          <Input className="h-8 max-w-xs text-xs" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Logo link (optional)" aria-label="Logo link" />
        </div>
        <Input className="h-8 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Client notes" />
      </div>
      <Button type="submit" disabled={!name.trim() || busy === 'client'} data-testid="projects-new-client-submit" className="self-start">
        <Plus className="mr-1 h-4 w-4" /> Add client
      </Button>
    </form>
  );
}

function NewProjectForm({ clients, onCreate, busy, defaultClientId }) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [description, setDescription] = useState('');
  // Local Workspace (owner decision 7): where this project's seismic lives, Local by default
  const [seismicStorage, setSeismicStorage] = useState('local');
  useEffect(() => { if (defaultClientId) setClientId(defaultClientId); }, [defaultClientId]);
  // the guide's "Create your first project" lands here (?new=1): the name box takes the focus
  const nameRef = useRef(null);
  useDeepLinkAction('new', '1', () => { setTimeout(() => { nameRef.current?.scrollIntoView({ block: 'center' }); nameRef.current?.focus(); }, 50); });
  const submit = async (e) => {
    e.preventDefault();
    const ok = await onCreate({ name, clientId: clientId || null, description, seismicStorage });
    if (ok) { setName(''); setDescription(''); }
  };
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]" data-testid="projects-new-project">
      <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name, for example OML 42 field study" aria-label="Project name" data-testid="projects-new-project-name" />
      <NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client" data-testid="projects-new-project-client">
        <option value="">{INTERNAL_LABEL} (no client)</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </NativeSelect>
      <Button type="submit" disabled={!name.trim() || busy === 'project'} data-testid="projects-new-project-submit">
        <Plus className="mr-1 h-4 w-4" /> Create project
      </Button>
      <Input className="h-8 text-xs sm:col-span-3" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" aria-label="Project description" />
      <label className="text-xs text-pl-muted sm:col-span-3 flex flex-wrap items-center gap-2">
        Where should this project&apos;s seismic volumes live?
        <NativeSelect value={seismicStorage} onChange={(e) => setSeismicStorage(e.target.value)} className="h-8 max-w-xs text-xs" aria-label="Seismic storage" data-testid="projects-new-project-seismic">
          <option value="local">On my computer (nothing uploaded; best on a slow link)</option>
          <option value="cloud">On Petrolord servers (opens anywhere; uploads the data)</option>
        </NativeSelect>
        <span>You can choose again for each import.</span>
      </label>
    </form>
  );
}

function ProjectRow({ project, clients, isCurrent, canManage, onOpen, onUpdate, busy }) {
  const archived = project.status === 'archived';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-pl-border px-3 py-2 last:border-b-0" data-testid={`projects-row-${project.id}`}>
      <span className="min-w-[10rem] flex-1 text-sm text-pl-text">
        {project.name}
        {project.is_default && <span className="ml-2 text-[11px] text-pl-muted">default</span>}
        {project.visibility === 'members' && <span className="ml-2 text-[11px] text-pl-muted">members only</span>}
        {archived && <span className="ml-2 text-[11px] text-pl-muted">archived</span>}
        {project.description && <span className="block text-xs text-pl-muted">{project.description}</span>}
      </span>
      {canManage && !project.is_default && (
        <NativeSelect compact className="w-40" value={project.client_id || ''} aria-label={`Client of ${project.name}`}
          onChange={(e) => onUpdate(project.id, { clientId: e.target.value || null }, 'Client changed')}>
          <option value="">{INTERNAL_LABEL}</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
      )}
      {canManage && !project.is_default && !archived && (
        <Button variant="outline" size="sm" disabled={!!busy}
          title={project.visibility === 'members' ? 'Open the project to everyone in your organisation' : 'Only project members (and organisation admins, logged) can see its data'}
          onClick={() => onUpdate(project.id, { visibility: project.visibility === 'members' ? 'organisation' : 'members' },
            project.visibility === 'members' ? 'The project is open to your organisation' : 'The project is now members only')}>
          {project.visibility === 'members' ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
          {project.visibility === 'members' ? 'Open to organisation' : 'Members only'}
        </Button>
      )}
      {canManage && !project.is_default && (
        <Button variant="outline" size="sm" disabled={!!busy || isCurrent} data-testid={`projects-archive-${project.id}`}
          title={isCurrent ? 'Switch to another project first' : ''}
          onClick={() => onUpdate(project.id, { status: archived ? 'active' : 'archived' }, archived ? 'Project restored' : 'Project archived')}>
          {archived ? <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> : <Archive className="mr-1 h-3.5 w-3.5" />}
          {archived ? 'Restore' : 'Archive'}
        </Button>
      )}
      {isCurrent ? (
        <span className="flex items-center gap-1 text-xs text-pl-accent-text"><Check className="h-3.5 w-3.5" /> current</span>
      ) : (
        <Button size="sm" disabled={archived || !!busy} onClick={() => onOpen(project.id)} data-testid={`projects-open-${project.id}`}>Open</Button>
      )}
    </div>
  );
}

function MovePanel({ projects, defaultProjectId, userId, onMoved }) {
  const { busy, run } = useRun();
  const active = projects.filter((p) => p.status === 'active');
  const [source, setSource] = useState(defaultProjectId || '');
  const [table, setTable] = useState(MOVABLE[0].table);
  const [target, setTarget] = useState('');
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setRows(null); setPicked(new Set());
    if (!source) return undefined;
    listMovable(table, source, { isDefault: source === defaultProjectId, userId })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [source, table, defaultProjectId, userId]);

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const label = [...MOVABLE, ...APP_MOVABLE].find((m) => m.table === table)?.label || 'Records';
  const targets = active.filter((p) => p.id !== source);

  const move = () => run('move', async () => {
    const n = await moveToProject(table, [...picked], target);
    setRows((r) => (r || []).filter((x) => !picked.has(x.id)));
    setPicked(new Set());
    onMoved?.();
    return n;
  }, (n) => `${n} moved to ${projects.find((p) => p.id === target)?.name || 'the project'}`);

  const copy = () => run('copy', async () => {
    const tgt = projects.find((p) => p.id === target);
    const src = projects.find((p) => p.id === source);
    const res = await copyToProject({ table, ids: [...picked], target: tgt, sourceName: src?.name });
    setPicked(new Set());
    onMoved?.();
    return res;
  }, (res) => `${res.copied} copied to ${projects.find((p) => p.id === target)?.name || 'the project'}${res.notes.length ? `. ${res.notes.join(' ')}` : ''}`);

  return (
    <div className="space-y-3" data-testid="projects-move">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-pl-muted">From
          <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} data-testid="projects-move-source">
            {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </label>
        <label className="text-xs text-pl-muted">What
          <NativeSelect value={table} onChange={(e) => setTable(e.target.value)} data-testid="projects-move-kind">
            <optgroup label="Data">
              {MOVABLE.map((m) => <option key={m.table} value={m.table}>{m.label}</option>)}
            </optgroup>
            <optgroup label="App projects">
              {APP_MOVABLE.map((m) => <option key={m.table} value={m.table}>{m.label}</option>)}
            </optgroup>
          </NativeSelect>
        </label>
        <label className="text-xs text-pl-muted">To
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} data-testid="projects-move-target">
            <option value="">Choose a project</option>
            {targets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </label>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border border-pl-border">
        {rows === null ? (
          <p className="px-3 py-2 text-sm text-pl-muted">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-pl-muted">No {label.toLowerCase()} of yours in this project.</p>
        ) : rows.map((r) => (
          <label key={r.id} className="flex items-center gap-2 border-b border-pl-border px-3 py-1.5 text-sm text-pl-text last:border-b-0">
            <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} data-testid={`projects-move-pick-${r.id}`} />
            {r.name || r.id.slice(0, 8)}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {rows?.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setPicked(new Set(picked.size === rows.length ? [] : rows.map((r) => r.id)))}>
            {picked.size === rows.length ? 'Clear' : 'Select all'}
          </Button>
        )}
        <Button size="sm" disabled={!picked.size || !target || busy === 'move'} onClick={move} data-testid="projects-move-submit">
          <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Move {picked.size || ''} {label.toLowerCase()}
        </Button>
        {isCopyable(table) && (
          <Button size="sm" variant="outline" disabled={!picked.size || !target || busy === 'copy'} onClick={copy} data-testid="projects-copy-submit"
            title="Copy keeps the originals; the copies record where they came from">
            Copy {picked.size || ''} {label.toLowerCase()}
          </Button>
        )}
        <span className="text-xs text-pl-muted">Logs, tops, horizons and faults go with their well or volume. Only records you own can be moved; copies record where they came from. Seismic is moved, never copied.</span>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const p = useProject();
  const { busy, run } = useRun();
  const [clientForProject, setClientForProject] = useState('');

  const activeClients = useMemo(() => p.clients.filter((c) => c.status === 'active'), [p.clients]);
  const allGroups = useMemo(() => {
    const byClient = new Map(p.clients.map((c) => [c.id, []]));
    const internal = [];
    for (const pr of p.projects) (pr.client_id && byClient.has(pr.client_id) ? byClient.get(pr.client_id) : internal).push(pr);
    return { byClient, internal };
  }, [p.clients, p.projects]);

  const createClient = (c) => run('client', () => p.createClient(c), (row) => `Client ${row.name} added`);
  const createProject = (pr) => run('project', () => p.createProject(pr), (row) => `Project ${row.name} created`);
  const updateProject = (id, patch, done) => run('update', () => p.updateProject(id, patch), done);
  const openProject = (id) => run('open', () => p.switchProject(id, { remount: false }), 'Project opened');
  const setClientStatus = (c, status) => run('client', () => p.updateClient(c.id, { status }), status === 'archived' ? `Client ${c.name} archived` : `Client ${c.name} restored`);

  return (
    <AccountScope testId="projects-page">
      <AccountPage width="max-w-4xl">
        <AccountHeader
          icon={FolderKanban}
          title="Clients and projects"
          description="Keep each client's wells, tops, surfaces and seismic apart. Every app shows the current project only; switch project from the app ribbon or here."
        />

        {!p.available && (
          <div className={accountCallout()} data-testid="projects-unavailable">
            {p.loading ? 'Loading your projects...' : 'Projects are not available on this account yet. Everything you load stays in one list until they are.'}
          </div>
        )}

        {p.available && (
          <>
            <Card data-testid="projects-current">
              <CardHeader>
                <CardTitle className="text-base">Current project</CardTitle>
                <CardDescription>New uploads and imports land here. Links you copy carry the project.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                {p.currentClient && <Swatch colour={p.currentClient.colour} />}
                <span className="text-sm font-medium text-pl-text" data-testid="projects-current-label">{projectLabel(p.current, p.currentClient)}</span>
              </CardContent>
            </Card>

            <ProjectSettingsCard />

            <ProjectMembersCard />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Clients</CardTitle>
                <CardDescription>A client is a company you work for. Give each client its own projects.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <NewClientForm onCreate={createClient} busy={busy} />
                {p.clients.length > 0 && (
                  <div className="rounded-md border border-pl-border" data-testid="projects-clients">
                    {p.clients.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-pl-border px-3 py-2 last:border-b-0">
                        <Swatch colour={c.colour} />
                        {c.logo_url && <img src={c.logo_url} alt="" className="h-5 w-5 rounded object-contain" />}
                        <span className="flex-1 text-sm text-pl-text">
                          {c.name}{c.status === 'archived' && <span className="ml-2 text-[11px] text-pl-muted">archived</span>}
                          {c.notes && <span className="block text-xs text-pl-muted">{c.notes}</span>}
                        </span>
                        <span className="text-xs text-pl-muted">{(allGroups.byClient.get(c.id) || []).length} projects</span>
                        {c.status === 'active' && (
                          <Button variant="outline" size="sm" onClick={() => setClientForProject(c.id)}>New project</Button>
                        )}
                        <Button variant="outline" size="sm" disabled={!!busy}
                          onClick={() => setClientStatus(c, c.status === 'archived' ? 'active' : 'archived')}>
                          {c.status === 'archived' ? 'Restore' : 'Archive'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Projects</CardTitle>
                <CardDescription>Open to your organisation by default. Members only keeps a client's data to the project's members; organisation admins can still open it, and that is logged.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <NewProjectForm clients={activeClients} onCreate={createProject} busy={busy} defaultClientId={clientForProject} />
                {p.clients.map((c) => {
                  const list = allGroups.byClient.get(c.id) || [];
                  if (!list.length) return null;
                  return (
                    <div key={c.id} className="rounded-md border border-pl-border" data-testid={`projects-group-${c.id}`}>
                      <div className="flex items-center gap-2 border-b border-pl-border bg-pl-sunken px-3 py-1.5 text-xs font-semibold text-pl-muted">
                        <Swatch colour={c.colour} size="h-2.5 w-2.5" /> {c.name}
                      </div>
                      {list.map((pr) => (
                        <ProjectRow key={pr.id} project={pr} clients={activeClients} isCurrent={pr.id === p.current?.id}
                          canManage={p.canManage(pr)} onOpen={openProject} onUpdate={updateProject} busy={busy} />
                      ))}
                    </div>
                  );
                })}
                {allGroups.internal.length > 0 && (
                  <div className="rounded-md border border-pl-border" data-testid="projects-group-internal">
                    <div className="border-b border-pl-border bg-pl-sunken px-3 py-1.5 text-xs font-semibold text-pl-muted">{INTERNAL_LABEL}</div>
                    {allGroups.internal.map((pr) => (
                      <ProjectRow key={pr.id} project={pr} clients={activeClients} isCurrent={pr.id === p.current?.id}
                        canManage={p.canManage(pr)} onOpen={openProject} onUpdate={updateProject} busy={busy} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {p.projects.filter((x) => x.status === 'active').length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><ArrowRightLeft className="h-4 w-4" /> Move or copy to project</CardTitle>
                  <CardDescription>Move wells, surfaces and seismic you loaded before projects existed out of Default and into a client project, or copy wells, surfaces and culture into another project.</CardDescription>
                </CardHeader>
                <CardContent>
                  <MovePanel projects={p.projects} defaultProjectId={p.defaultProjectId} userId={user?.id} onMoved={p.refresh} />
                </CardContent>
              </Card>
            )}
          </>
        )}

        <details className="rounded-lg border border-pl-border bg-pl-surface p-4 text-sm text-pl-text" data-testid="projects-help">
          <summary className="cursor-pointer font-medium">How clients and projects work</summary>
          <div className="mt-3 space-y-2 text-pl-muted">
            <p>Your organisation holds clients (the companies you work for) and projects. A project can belong to one client, or to none, in which case it is listed under Internal. A client can have as many projects as you need.</p>
            <p>Everything you had before projects is in the Default project. Nothing was moved or deleted, and colleagues see exactly what they saw before.</p>
            <p>The current project is shown in each app&apos;s ribbon as Client &rsaquo; Project. Pick another there and the app reloads with that project&apos;s wells, tops, surfaces and seismic. New uploads and imports, including Well Data Manager, Seismolord imports and project packages (.pld), go into the current project.</p>
            <p>To separate data you loaded earlier, use Move to project: choose Default as the source, tick the wells, surfaces or seismic, and choose the client project. Logs, tops, horizons and faults travel with their well or volume.</p>
            <p>A project is open to your organisation by default. Members only limits its data to the project&apos;s members; organisation admins can still open it, and each such opening is recorded for the project owner. Sharing a single record with your organisation still works as before inside a project.</p>
            <p>Archive a project or client when the work ends: it leaves the switcher and nothing is deleted. Restore it from this page at any time.</p>
            <p>A link you copy from an app carries the project, so a colleague opens the same project.</p>
          </div>
        </details>
      </AccountPage>
    </AccountScope>
  );
}
