import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useRegulatoryCompliance } from './hooks/useRegulatoryCompliance';
import ObligationForm from './components/ObligationForm';
import { ErrorState, Loading } from './components/SharedComponents';

const BASE = '/dashboard/apps/assurance/regulatory-compliance';

/**
 * AS3 — create and edit an obligation.
 *
 * This file used to be a dashed box reading "New compliance creation
 * form will be implemented here", reachable from the Add Obligation
 * button in the app header. Nothing in the app could write a row.
 */
export default function NewCompliance() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    obligations, authorities, loading, error, hasAs3Schema,
    createObligation, updateObligation, refresh,
  } = useRegulatoryCompliance();

  const editing = id ? obligations.find((o) => o.id === id) : null;

  if (loading) return <Loading label="Loading the register..." />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (id && !editing) {
    return (
      <div className="p-10 text-center text-[hsl(var(--muted-foreground))]">
        That obligation is not in this organization&apos;s register.
      </div>
    );
  }

  const handleSubmit = async (form) => {
    const result = editing
      ? await updateObligation(editing.id, form)
      : await createObligation(form);
    if (result.success) {
      toast({
        description: editing
          ? 'Obligation updated.'
          : `Obligation ${result.data?.obligation_code || ''} created.`.trim(),
      });
      navigate(`${BASE}/${result.data?.id || editing.id}`);
    }
    return result;
  };

  return (
    <div>
      <div className="px-6 pt-6">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          {editing ? `Edit ${editing.obligation_code || 'obligation'}` : 'Add a compliance obligation'}
        </h1>
      </div>
      <ObligationForm
        initial={editing || undefined}
        authorities={authorities}
        hasAs3Schema={hasAs3Schema}
        onSubmit={handleSubmit}
        onCancel={() => navigate(editing ? `${BASE}/${editing.id}` : `${BASE}/register`)}
        submitLabel={editing ? 'Save changes' : 'Create obligation'}
      />
    </div>
  );
}
