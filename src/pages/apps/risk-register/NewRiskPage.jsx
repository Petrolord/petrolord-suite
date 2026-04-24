import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRiskRegister } from './hooks/useRiskRegister';
import { useRiskReporting } from '@/hooks/useRiskReporting';
import { RiskRegisterShell } from './components/RiskRegisterShell';
import { RiskForm } from './components/forms/RiskForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const NewRiskPage = () => {
  const navigate = useNavigate();
  const { addRisk } = useRiskRegister();
  const { closeReport } = useRiskReporting() || {}; // Safely destructure
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Navigates back to the main Risk Register Dashboard.
   * Ensures any local reporting state is cleared before navigation.
   */
  const handleBack = () => {
    if (closeReport) {
      closeReport();
    }
    navigate('/dashboard/apps/assurance/risk-register');
  };

  // Keep handleCancel for form-specific cancel actions if needed (can also point to handleBack)
  const handleCancel = () => {
    handleBack();
  };

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    const res = await addRisk(formData);
    if(res.success) {
        toast({ title: "Success", description: "New risk has been added." });
        if (closeReport) closeReport();
        navigate('/dashboard/apps/assurance/risk-register');
    } else {
        toast({ variant: "destructive", title: "Error", description: res.error || "Failed to save risk" });
        setIsSubmitting(false);
    }
  };

  return (
    <RiskRegisterShell>
      <div className="p-6 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
            {/* Back Button leading to Risk Register Dashboard */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleBack} 
              className="text-slate-400 hover:text-white bg-slate-900/50 hover:bg-red-500/20 rounded-full"
              title="Return to Risk Register"
            >
                <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
                <h2 className="text-2xl font-bold text-white">Log New Risk</h2>
                <p className="text-sm text-slate-400">Record a new risk into the corporate register.</p>
            </div>
        </div>

        <RiskForm 
            onSubmit={handleSubmit} 
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
        />
      </div>
    </RiskRegisterShell>
  );
};

export default NewRiskPage;