import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  CERTIFICATION_STATUSES,
  certificationReadiness,
  daysUntil,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  BlockerList, DetailField, EmptyState, ErrorState, Loading, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { CertificationBadge, ReadinessBadge } from './components/ISOBadges';
import { validateStandard } from './utils/isoPayload';
import { useIsoCompliance } from './hooks/useIsoCompliance';

/**
 * AS8 — the standards an organization actually runs.
 *
 * There was no such page and no such table. Every clause in the old
 * data file carried its standard as free text, assigned by `i % 3`
 * between ISO 9001, 14001 and 45001, so there was nowhere to record
 * that a certificate exists, who issued it, or when it expires — which
 * is the only reason an organization keeps a clause register at all.
 */

const blank = () => ({
  code: '',
  title: '',
  scope_statement: '',
  certification_status: 'Not certified',
  certification_body: '',
  certificate_number: '',
  certified_from: '',
  certificate_expires: '',
  next_surveillance: '',
  cycle_years: 3,
});

export default function Standards() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    standards, clauses, audits, auditClauses, findings, actions,
    loading, error, refresh, hasAs8Schema, createStandard, updateStandard, deleteStandard,
  } = useIsoCompliance();

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);
  const today = new Date();

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const rows = useMemo(() => standards.map((s) => ({
    standard: s,
    readiness: certificationReadiness(s, {
      clauses, findings, actions, audits, auditClauses,
    }, today),
    certDays: daysUntil(s.certificate_expires, today),
  })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [standards, clauses, findings, actions, audits, auditClauses]);

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateStandard(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const result = form.id
      ? await updateStandard(form.id, form)
      : await createStandard(form);
    setSaving(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      description: form.id
        ? `${result.data.code} updated.`
        : `${result.data.code} added to the register.`,
    });
    setForm(null);
    setErrors({});
  };

  /**
   * Removing a standard takes its clause register, its audits' link to
   * it and its findings with it, so the button says so rather than
   * asking twice.
   */
  const remove = async (standard, clauseCount) => {
    setFailure(null);
    setSaving(true);
    const result = await deleteStandard(standard.id);
    setSaving(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      description: `${standard.code} removed, with its ${clauseCount} clause${clauseCount === 1 ? '' : 's'}.`,
    });
  };

  if (loading) return <ISOShell title="Standards"><Loading /></ISOShell>;
  if (error) {
    return <ISOShell title="Standards"><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  }
  if (!hasAs8Schema) return <ISOShell title="Standards"><SchemaNotice /></ISOShell>;

  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  return (
    <ISOShell
      title="Standards"
      description="The management system standards this organization runs, and where its certificate stands"
      actions={(
        <Button onClick={() => { setFailure(null); setForm(form ? null : blank()); }}>
          <Plus className="w-4 h-4 mr-2" /> Add a standard
        </Button>
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        {form ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">
                {form.id ? `Edit ${form.code}` : 'Add a standard'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-code">Standard</label>
                    <Input id="std-code" value={form.code} onChange={set('code')}
                      placeholder="ISO 9001:2015" />
                    {errors.code ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.code}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-title">Title</label>
                    <Input id="std-title" value={form.title} onChange={set('title')}
                      placeholder="Quality management systems" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="std-scope">
                    Scope of the management system
                  </label>
                  <Textarea id="std-scope" rows={2} value={form.scope_statement}
                    onChange={set('scope_statement')}
                    placeholder="The scope as it appears on the certificate: what the system covers, and where." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-status">Certification</label>
                    <select id="std-status" className={selectClass}
                      value={form.certification_status} onChange={set('certification_status')}>
                      {CERTIFICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-body">
                      Certification body
                    </label>
                    <Input id="std-body" value={form.certification_body}
                      onChange={set('certification_body')} />
                    {errors.certification_body ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.certification_body}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-cert">
                      Certificate number
                    </label>
                    <Input id="std-cert" value={form.certificate_number}
                      onChange={set('certificate_number')} />
                    {errors.certificate_number ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.certificate_number}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-cycle">
                      Certification cycle (years)
                    </label>
                    <Input id="std-cycle" type="number" min="1" max="6" value={form.cycle_years}
                      onChange={set('cycle_years')} />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Clause coverage is judged over it.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-from">Certified from</label>
                    <Input id="std-from" type="date" value={form.certified_from}
                      onChange={set('certified_from')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-expires">
                      Certificate expires
                    </label>
                    <Input id="std-expires" type="date" value={form.certificate_expires}
                      onChange={set('certificate_expires')} />
                    {errors.certificate_expires ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.certificate_expires}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="std-surv">
                      Next surveillance audit
                    </label>
                    <Input id="std-surv" type="date" value={form.next_surveillance}
                      onChange={set('next_surveillance')} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setForm(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : (form.id ? 'Save changes' : 'Add standard')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {rows.length === 0 && !form ? (
          <EmptyState
            icon={<ShieldCheck className="w-12 h-12" />}
            title="No standards in the register"
            description="Add the standards this organization runs. Its clause register, internal audit programme and findings all hang off them."
            action={<Button onClick={() => setForm(blank())}>Add the first one</Button>}
          />
        ) : null}

        {rows.map(({ standard, readiness, certDays }) => (
          <Card key={standard.id} className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg">{standard.code}</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  {standard.title || 'No title recorded'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <CertificationBadge standard={standard} />
                <ReadinessBadge readiness={readiness} />
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <DetailField label="Certificate">{standard.certificate_number}</DetailField>
                <DetailField label="Body">{standard.certification_body}</DetailField>
                <DetailField label="Expires">
                  {standard.certificate_expires ? (
                    <span className={certDays !== null && certDays < 90
                      ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                      {standard.certificate_expires}
                      {certDays !== null
                        ? ` (${certDays < 0 ? `${Math.abs(certDays)} days ago` : `in ${certDays} days`})`
                        : ''}
                    </span>
                  ) : null}
                </DetailField>
                <DetailField label="Next surveillance">{standard.next_surveillance}</DetailField>
                <DetailField label="Applicable clauses">{readiness.counts.applicable}</DetailField>
                <DetailField label="Excluded">{readiness.counts.excluded}</DetailField>
                <DetailField label="Audited this cycle">{readiness.counts.covered}</DetailField>
                <DetailField label="Cycle">{standard.cycle_years} years</DetailField>
              </div>

              <DetailField label="Scope">{standard.scope_statement}</DetailField>

              <div className="pt-4 border-t border-[hsl(var(--border))]">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-3">
                  What stands between this standard and a certification audit
                </p>
                <BlockerList readiness={readiness} />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => navigate(`${BASE}/clauses`)}>
                  Clause register
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`${BASE}/audits`)}>
                  Internal audits
                </Button>
                <Button size="sm" variant="outline" disabled={saving}
                  onClick={() => { setFailure(null); setForm({ ...blank(), ...standard }); }}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" disabled={saving}
                  onClick={() => remove(standard, readiness.counts.clauses)}
                  title="This removes its clause register and its findings too">
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ISOShell>
  );
}
