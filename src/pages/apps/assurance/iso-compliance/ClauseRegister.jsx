import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ListChecks, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  APPLICABILITIES,
  CLAUSE_STATUSES,
  canSetClauseStatus,
  clauseCoverageByStandard,
  hasEvidenceRecord,
  isReviewOverdue,
  toDateOnlyString,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  ClauseStatusBadge, CoverageBadge, EvidenceBadge,
} from './components/ISOBadges';
import { ASSESSED_STATUSES, validateClause, withAssessor } from './utils/isoPayload';
import { useIsoCompliance } from './hooks/useIsoCompliance';
import { PersonField } from '../shared/PersonField';
import { useOrgMembers } from '../shared/useOrgMembers';

/**
 * AS8 — the clause register, and the one place a clause is assessed.
 *
 * What it replaces listed thirty generated clauses with titles reading
 * "Clause Title 1" to "Clause Title 30", owners called "User 1" to
 * "User 10", and a Last Updated column filled with
 * `Date.now() - Math.random() * 10000000000`. Every row carried a
 * Status pill and an Evidence pill, both assigned by modulo, and
 * neither was backed by anything. Rows were `cursor-pointer` and did
 * not navigate.
 *
 * The create path was the shell's Add Clause modal, which read its
 * fields out of the DOM, set `status: 'Compliant'` on every clause it
 * made, pushed it onto useState and toasted that it had been
 * registered. This form writes to a database, and it will not record a
 * conformity claim without the evidence, the date and the assessor.
 */

const blankClause = (standardId) => ({
  standard_id: standardId || '',
  clause_ref: '',
  title: '',
  requirement: '',
  department: '',
  owner_id: null,
  owner_name: '',
  applicability: 'Applicable',
  applicability_justification: '',
  status: 'Not assessed',
  next_review_due: '',
});

const blankAssessment = () => ({
  status: 'Conformant',
  evidence_reference: '',
  assessed_date: toDateOnlyString(new Date()),
  assessor_name: '',
  notes: '',
});

export default function ClauseRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    standards, clauses, audits, auditClauses, findings,
    loading, error, refresh, hasAs8Schema, createClause, assessClause, deleteClause,
  } = useIsoCompliance();
  const { members, userId } = useOrgMembers();

  const [standardFilter, setStandardFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(null);
  const [errors, setErrors] = useState({});
  const [assessing, setAssessing] = useState(null);
  const [assessment, setAssessment] = useState(blankAssessment());
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const set = (field) => (e) => setCreating((f) => ({ ...f, [field]: e.target.value }));

  const coverageByClause = useMemo(() => {
    const rows = clauseCoverageByStandard({ standards, clauses, auditClauses, audits }, today);
    return new Map(rows.map((r) => [r.clause.id, r]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standards, clauses, auditClauses, audits]);

  const filtered = useMemo(() => clauses.filter((c) => {
    if (standardFilter && c.standard_id !== standardFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return [c.clause_ref, c.title, c.requirement, c.department, c.owner_name]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  }), [clauses, standardFilter, statusFilter, query]);

  const unevidenced = useMemo(
    () => clauses.filter((c) => ['Conformant', 'Partially conformant'].includes(c.status)
      && !hasEvidenceRecord(c)).length, [clauses]);

  // The gate sees the assessor the hook will record: a blank name is the
  // signed-in user. AS8 checked the raw form, so "leave blank to record
  // yourself" kept Record assessment disabled (AS13).
  const gate = useMemo(() => {
    if (!assessing) return { ok: true };
    const patch = ASSESSED_STATUSES.includes(assessment.status)
      ? withAssessor(assessment, userId) : assessment;
    return canSetClauseStatus(assessing, assessment.status, patch);
  }, [assessing, assessment, userId]);

  const submitClause = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateClause(creating);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const result = await createClause({
      ...creating,
      status: creating.applicability === 'Not applicable' ? 'Not applicable' : 'Not assessed',
    });
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Clause ${result.data.clause_ref} added.` });
    setCreating(blankClause(creating.standard_id));
    setErrors({});
  };

  const submitAssessment = async (e) => {
    e.preventDefault();
    setFailure(null);
    setBusy(true);
    const result = await assessClause(assessing, assessment.status, {
      evidence_reference: assessment.evidence_reference || null,
      assessed_date: assessment.assessed_date || null,
      assessor_name: assessment.assessor_name || null,
      notes: assessment.notes || assessing.notes || null,
    });
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Clause ${assessing.clause_ref} assessed ${assessment.status}.` });
    setAssessing(null);
  };

  const remove = async (clause) => {
    setFailure(null);
    setBusy(true);
    const result = await deleteClause(clause.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Clause ${clause.clause_ref} removed.` });
  };

  const exportRegister = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    const standardByT = new Map(standards.map((s) => [s.id, s]));
    exportToCSV(filtered.map((c) => {
      const cov = coverageByClause.get(c.id);
      return {
        Standard: standardByT.get(c.standard_id)?.code || '',
        Clause: c.clause_ref || '',
        Title: c.title || '',
        Applicability: c.applicability || '',
        'Exclusion justification': c.applicability_justification || '',
        Status: c.status || '',
        Evidence: c.evidence_reference || '',
        Evidenced: hasEvidenceRecord(c) ? 'Yes' : 'No',
        Assessed: c.assessed_date || '',
        Department: c.department || '',
        Owner: c.owner_name || '',
        'Last internal audit': cov?.lastExaminedOn || 'Never',
        'Covered this cycle': cov ? (cov.covered ? 'Yes' : 'No') : 'n/a',
        'Review due': c.next_review_due || '',
      };
    }), `iso-clause-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <ISOShell title="Clause register"><Loading /></ISOShell>;
  if (error) {
    return <ISOShell title="Clause register"><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  }
  if (!hasAs8Schema) return <ISOShell title="Clause register"><SchemaNotice /></ISOShell>;

  if (!standards.length) {
    return (
      <ISOShell title="Clause register">
        <EmptyState
          icon={<ListChecks className="w-12 h-12" />}
          title="Add a standard first"
          description="A clause belongs to a standard. Add the standards this organization runs, then build the register under them."
          action={<Button onClick={() => navigate(`${BASE}/standards`)}>Standards</Button>}
        />
      </ISOShell>
    );
  }

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  return (
    <ISOShell
      title="Clause register"
      description="Conformity is a claim about documented information, so every claim here names it"
      actions={(
        <>
          <Button variant="outline" onClick={exportRegister}>Export (CSV)</Button>
          <Button onClick={() => {
            setFailure(null);
            setCreating(creating ? null : blankClause(standardFilter || standards[0]?.id));
          }}>
            <Plus className="w-4 h-4 mr-2" /> Add a clause
          </Button>
        </>
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Clauses" value={clauses.length} />
          <MetricTile
            label="Claims with no evidence" value={unevidenced}
            token={unevidenced ? '--destructive' : '--success'}
            hint="Conformant with nothing recorded behind it"
          />
          <MetricTile
            label="Never internally audited"
            value={[...coverageByClause.values()].filter((c) => !c.lastExaminedOn).length}
            token="--warning"
          />
          <MetricTile
            label="Reviews overdue"
            value={clauses.filter((c) => isReviewOverdue(c, today)).length}
            token="--warning"
          />
        </div>

        {creating ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Add a clause</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                A new clause starts Not assessed. It is assessed from the register,
                with its evidence.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submitClause} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="cl-standard">Standard</label>
                    <select id="cl-standard" className={`${selectClass} w-full`}
                      value={creating.standard_id} onChange={set('standard_id')}>
                      <option value="">Pick a standard</option>
                      {standards.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                    </select>
                    {errors.standard_id ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.standard_id}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="cl-ref">Clause</label>
                    <Input id="cl-ref" value={creating.clause_ref} onChange={set('clause_ref')}
                      placeholder="7.1.5" />
                    {errors.clause_ref ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.clause_ref}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="cl-title">Title</label>
                    <Input id="cl-title" value={creating.title} onChange={set('title')}
                      placeholder="Monitoring and measuring resources" />
                    {errors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="cl-req">The requirement</label>
                  <Textarea id="cl-req" rows={2} value={creating.requirement}
                    onChange={set('requirement')}
                    placeholder="What the clause requires, in the words this organization will be audited against." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="cl-dept">Department</label>
                    <Input id="cl-dept" value={creating.department} onChange={set('department')} />
                  </div>
                  <PersonField
                    id="cl-owner" label="Owner" members={members} userId={userId}
                    personId={creating.owner_id} name={creating.owner_name}
                    onChange={({ id, name }) => setCreating(
                      (f) => ({ ...f, owner_id: id, owner_name: name }))}
                    selectClassName={`${selectClass} w-full`}
                  />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="cl-applic">Applicability</label>
                    <select id="cl-applic" className={`${selectClass} w-full`}
                      value={creating.applicability} onChange={set('applicability')}>
                      {APPLICABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="cl-review">Review due</label>
                    <Input id="cl-review" type="date" value={creating.next_review_due}
                      onChange={set('next_review_due')} />
                  </div>
                </div>

                {creating.applicability === 'Not applicable' ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="cl-just">
                      Why does this requirement not apply?
                    </label>
                    <Textarea id="cl-just" rows={2} value={creating.applicability_justification}
                      onChange={set('applicability_justification')}
                      placeholder="ISO 9001:2015 §4.3 requires this justification to be kept as documented information." />
                    {errors.applicability_justification ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">
                        {errors.applicability_justification}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreating(null)}>
                    Done
                  </Button>
                  <Button type="submit" disabled={busy}>Add clause</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">
                {filtered.length} of {clauses.length} clause{clauses.length === 1 ? '' : 's'}
              </CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clause, title, owner" className="pl-9 w-64" />
              </div>
              <select className={selectClass} value={standardFilter}
                onChange={(e) => setStandardFilter(e.target.value)}>
                <option value="">Every standard</option>
                {standards.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
              <select className={selectClass} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Every status</option>
                {CLAUSE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<ListChecks className="w-12 h-12" />}
                title={clauses.length ? 'Nothing matches those filters' : 'The clause register is empty'}
                description={clauses.length
                  ? 'Clear the filters to see the rest of the register.'
                  : 'Add the clauses of each standard this organization runs. This app used to show thirty invented ones instead, titled "Clause Title 1" to "Clause Title 30".'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Clause</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Owner</th>
                      <th className="data-grid-th">Status</th>
                      <th className="data-grid-th">Evidence</th>
                      <th className="data-grid-th">Internal audit</th>
                      <th className="data-grid-th">Findings</th>
                      <th className="data-grid-th text-right">Assess</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const open = findings.filter(
                        (f) => f.clause_id === c.id && !['Closed', 'Voided'].includes(f.status));
                      return (
                        <tr key={c.id} className="border-b border-[hsl(var(--border))] last:border-0">
                          <td className="data-grid-td font-mono text-xs">{c.clause_ref}</td>
                          <td className="data-grid-td">
                            {c.title}
                            {c.applicability === 'Not applicable' ? (
                              <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                                Excluded: {c.applicability_justification}
                              </span>
                            ) : null}
                          </td>
                          <td className="data-grid-td text-xs">{c.owner_name || 'Unassigned'}</td>
                          <td className="data-grid-td"><ClauseStatusBadge clause={c} /></td>
                          <td className="data-grid-td"><EvidenceBadge clause={c} /></td>
                          <td className="data-grid-td">
                            <CoverageBadge row={coverageByClause.get(c.id)} />
                          </td>
                          <td className="data-grid-td text-xs">
                            {open.length ? `${open.length} open` : ''}
                          </td>
                          <td className="data-grid-td text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" disabled={busy}
                                onClick={() => {
                                  setFailure(null);
                                  setAssessing(c);
                                  setAssessment({
                                    ...blankAssessment(),
                                    evidence_reference: c.evidence_reference || '',
                                  });
                                }}>
                                Assess
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy}
                                onClick={() => remove(c)} title="Remove this clause">
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {assessing ? (
              <form onSubmit={submitAssessment}
                className="p-5 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                <p className="text-sm font-medium">
                  Assess clause {assessing.clause_ref}: {assessing.title}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="as-status">Verdict</label>
                    <select id="as-status" className={`${selectClass} w-full`}
                      value={assessment.status}
                      onChange={(e) => setAssessment((a) => ({ ...a, status: e.target.value }))}>
                      {CLAUSE_STATUSES.filter((s) => s !== 'Not applicable')
                        .map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="as-evidence">
                      Evidence (the documented information)
                    </label>
                    <Input id="as-evidence" value={assessment.evidence_reference}
                      onChange={(e) => setAssessment(
                        (a) => ({ ...a, evidence_reference: e.target.value }))}
                      placeholder="QMS-PR-009 rev 4, calibration register" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="as-date">Assessed on</label>
                    <Input id="as-date" type="date" value={assessment.assessed_date}
                      onChange={(e) => setAssessment(
                        (a) => ({ ...a, assessed_date: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="as-who">
                      Assessor (leave blank to record yourself)
                    </label>
                    <Input id="as-who" value={assessment.assessor_name}
                      onChange={(e) => setAssessment(
                        (a) => ({ ...a, assessor_name: e.target.value }))}
                      placeholder="An external consultant, if it was not a Suite user" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="as-notes">Notes</label>
                    <Input id="as-notes" value={assessment.notes}
                      onChange={(e) => setAssessment((a) => ({ ...a, notes: e.target.value }))} />
                  </div>
                </div>
                {!gate.ok ? <GateNotice reason={gate.reason} /> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAssessing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy || !gate.ok}>Record assessment</Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ISOShell>
  );
}
