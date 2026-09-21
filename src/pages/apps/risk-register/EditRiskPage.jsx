import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRiskRegister } from './hooks/useRiskRegister';
import { useRiskChildren } from './hooks/useRiskChildren';
import { RiskRegisterShell } from './components/RiskRegisterShell';
import { RiskForm } from './components/forms/RiskForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * AS2 — editing a risk.
 *
 * The Edit button on the detail page was wired to a toast reading
 * "This feature isn't implemented yet". A register whose entries cannot
 * be changed is not a register: a risk's whole working life is being
 * re-scored as controls land.
 */
const EditRiskPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { risks, loading, updateRisk, hasAs2Schema } = useRiskRegister();
  const { tags, linkedRisks, loading: childLoading } = useRiskChildren(id, risks);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const risk = risks.find((r) => r.id === id);

  useEffect(() => {
    if (!loading && !risk) navigate('/dashboard/apps/assurance/risk-register');
  }, [loading, risk, navigate]);

  const back = () => {
    navigate(`/dashboard/apps/assurance/risk-register/${id}`);
  };

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    const res = await updateRisk(id, formData);
    if (res.success) {
      const warnings = res.warnings || [];
      toast(warnings.length
        ? { title: `${risk.risk_id} saved, with something to check`, description: warnings.join(' ') }
        : { title: 'Saved', description: `${risk.risk_id} has been updated.` });
      back();
    } else {
      toast({ variant: 'destructive', title: 'Not saved', description: res.error });
      setIsSubmitting(false);
    }
  };

  if (loading || childLoading || !risk) {
    return (
      <RiskRegisterShell>
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </RiskRegisterShell>
    );
  }

  return (
    <RiskRegisterShell>
      <div className="p-6 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
          <Button
            variant="ghost" size="icon" onClick={back}
            className="text-slate-400 hover:text-white bg-slate-900/50 rounded-full"
            title="Back to the risk"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-white">Edit {risk.risk_id}</h2>
            <p className="text-sm text-slate-400">
              Re-score the risk, record what the controls achieved, and set when it is next reviewed.
            </p>
          </div>
        </div>

        <RiskForm
          initialData={{
            ...risk,
            tags: tags.map((t) => t.tag).join(', '),
            linked_risks: linkedRisks.map((l) => l.code).join(', '),
          }}
          onSubmit={handleSubmit}
          onCancel={back}
          isSubmitting={isSubmitting}
          hasAs2Schema={hasAs2Schema}
        />
      </div>
    </RiskRegisterShell>
  );
};

export default EditRiskPage;
