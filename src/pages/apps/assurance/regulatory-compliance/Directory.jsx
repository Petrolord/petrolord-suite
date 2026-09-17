import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Edit, ExternalLink, Mail, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRegulatoryCompliance } from './hooks/useRegulatoryCompliance';
import { validateAuthority } from './utils/obligationPayload';
import {
  EmptyState,
  ErrorState,
  Loading,
  SchemaNotice,
} from './components/SharedComponents';

const EMPTY = {
  name: '', acronym: '', jurisdiction: '', contact_name: '',
  email: '', phone: '', website: '', notes: '',
};

/**
 * AS3 — the regulator directory.
 *
 * Add Regulator, Edit and the website link all called the handler that
 * toasted "This feature isn't implemented yet". `addRegulator` and
 * `updateRegulator` existed in the service and no UI called either, so
 * the directory could only ever be empty, and the Email and Call
 * buttons fell through to the same toast when a regulator had no
 * address, which no regulator could have, because none could be added.
 */
export default function Directory() {
  const { toast } = useToast();
  const {
    authorities, obligations, loading, error, hasAs3Schema,
    createAuthority, updateAuthority, deleteAuthority, refresh,
  } = useRegulatoryCompliance();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  if (loading) return <Loading label="Loading the directory..." />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;

  const term = search.trim().toLowerCase();
  const filtered = authorities.filter((a) =>
    !term || [a.name, a.acronym, a.jurisdiction, a.contact_name]
      .some((v) => String(v || '').toLowerCase().includes(term)));

  const countFor = (id) => obligations.filter((o) => o.authority_id === id).length;

  const handleSave = async (e) => {
    e.preventDefault();
    const found = validateAuthority(editing);
    if (Object.keys(found).length) { setErrors(found); return; }
    setSaving(true);
    const result = editing.id
      ? await updateAuthority(editing.id, editing)
      : await createAuthority(editing);
    setSaving(false);
    if (result.success) {
      toast({ description: editing.id ? 'Regulator updated.' : 'Regulator added.' });
      setEditing(null);
      setErrors({});
    } else {
      toast({ title: 'Not saved', description: result.error, variant: 'destructive' });
    }
  };

  const handleDelete = async (a) => {
    const result = await deleteAuthority(a.id);
    toast(result.success
      ? { description: `${a.acronym || a.name} removed.` }
      : { title: 'Not removed', description: result.error, variant: 'destructive' });
  };

  const set = (field) => (e) => {
    setEditing((f) => ({ ...f, [field]: e.target.value }));
    setErrors((p) => (p[field] ? { ...p, [field]: undefined } : p));
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 pb-24 bg-[hsl(var(--background))]">
      {!hasAs3Schema ? <SchemaNotice /> : null}

      <div className="p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-col sm:flex-row gap-4 justify-between items-center sticky top-0 z-10">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            placeholder="Search regulators, agencies, jurisdictions..."
            className="pl-9 bg-[hsl(var(--background))] border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--warning))] text-[hsl(var(--foreground))]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0"
          onClick={() => { setEditing({ ...EMPTY }); setErrors({}); }}>
          <Plus className="w-4 h-4 mr-2" /> Add regulator
        </Button>
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="m-6 p-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] grid grid-cols-1 md:grid-cols-3 gap-4">
          <h2 className="md:col-span-3 font-medium text-[hsl(var(--foreground))]">
            {editing.id ? 'Edit regulator' : 'Add a regulator'}
          </h2>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={editing.name} onChange={set('name')}
              placeholder="Nigerian Upstream Petroleum Regulatory Commission" />
            {errors.name ? <p className="text-xs text-[hsl(var(--destructive))] mt-1">{errors.name}</p> : null}
          </div>
          <div>
            <Label htmlFor="acronym">Acronym</Label>
            <Input id="acronym" value={editing.acronym || ''} onChange={set('acronym')} placeholder="NUPRC" />
          </div>
          <div>
            <Label htmlFor="jurisdiction">Jurisdiction</Label>
            <Input id="jurisdiction" value={editing.jurisdiction || ''} onChange={set('jurisdiction')} placeholder="Federal" />
          </div>
          <div>
            <Label htmlFor="contact_name">Contact</Label>
            <Input id="contact_name" value={editing.contact_name || ''} onChange={set('contact_name')} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={editing.email || ''} onChange={set('email')} />
            {errors.email ? <p className="text-xs text-[hsl(var(--destructive))] mt-1">{errors.email}</p> : null}
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={editing.phone || ''} onChange={set('phone')} />
          </div>
          {hasAs3Schema ? (
            <>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={editing.website || ''} onChange={set('website')} placeholder="https://" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" rows={1} value={editing.notes || ''} onChange={set('notes')} />
              </div>
            </>
          ) : null}
          <div className="md:col-span-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setEditing(null); setErrors({}); }}
              className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              Cancel
            </Button>
            <Button type="submit" disabled={saving}
              className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
              {saving ? 'Saving...' : 'Save regulator'}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="p-6 flex-1 overflow-auto">
        {authorities.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-12 h-12" />}
            title="No regulators yet"
            description="Add the agencies this organization answers to, then attribute obligations to them."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((a) => {
              const count = countFor(a.id);
              return (
                <Card key={a.id} className="panel-elevation hover:border-[hsl(var(--warning))]/50 transition-colors group">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-[hsl(var(--foreground))]">{a.acronym || a.name}</h3>
                        <p className="text-sm text-[hsl(var(--muted-foreground))] line-clamp-1" title={a.name}>{a.name}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity -mt-2 -mr-2">
                        <Button variant="ghost" size="icon" aria-label="Edit"
                          className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                          onClick={() => { setEditing({ ...a }); setErrors({}); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete"
                          className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                          onClick={() => handleDelete(a)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex">
                        <span className="inline-block w-28 text-[hsl(var(--muted-foreground))]">Jurisdiction</span>
                        <span className="text-[hsl(var(--foreground))]">{a.jurisdiction || 'Not set'}</span>
                      </div>
                      <div className="flex">
                        <span className="inline-block w-28 text-[hsl(var(--muted-foreground))]">Contact</span>
                        <span className="text-[hsl(var(--foreground))]">{a.contact_name || 'Not set'}</span>
                      </div>
                      <div className="flex">
                        <span className="inline-block w-28 text-[hsl(var(--muted-foreground))]">Obligations</span>
                        <span className="text-[hsl(var(--foreground))]">{count}</span>
                      </div>
                    </div>

                    {/* A contact button is shown only where there is
                        something to contact. The old card offered Email
                        and Call on every regulator and fell through to a
                        "not implemented" toast when the field was empty. */}
                    <div className="flex gap-2 mt-6 pt-4 border-t border-[hsl(var(--border))]">
                      {a.email ? (
                        <Button variant="outline" size="sm" asChild
                          className="flex-1 bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                          <a href={`mailto:${a.email}`}><Mail className="w-4 h-4 mr-2" /> Email</a>
                        </Button>
                      ) : null}
                      {a.phone ? (
                        <Button variant="outline" size="sm" asChild
                          className="flex-1 bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                          <a href={`tel:${a.phone}`}><Phone className="w-4 h-4 mr-2" /> Call</a>
                        </Button>
                      ) : null}
                      {a.website ? (
                        <Button variant="outline" size="icon" asChild
                          className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
                          <a href={a.website} target="_blank" rel="noreferrer" aria-label="Website">
                            <ExternalLink className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                          </a>
                        </Button>
                      ) : null}
                      {!a.email && !a.phone && !a.website ? (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          No contact details recorded.
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 ? (
              <div className="col-span-full py-12 text-center text-[hsl(var(--muted-foreground))] border border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))]/50">
                No regulators match that search. The directory holds {authorities.length}.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
