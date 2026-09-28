import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { NativeSelect } from '@/components/ui/native-select';

// EC5-0 (owner decision 2026-09-14): the AFE window. The schedule index and
// the S-curve are measured against start_date and end_date, which the live
// afes table already carries, and the wizard never asked for them.
export const validateAfeWindow = (startDate, endDate) => {
  if (startDate && endDate && endDate < startDate) {
    return 'The end date is before the start date. Choose an end date on or after the start date.';
  }
  return null;
};

const AFECreationWizard = ({ open, onOpenChange, projects, onSuccess }) => {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    project_id: '',
    afe_number: '',
    afe_name: '',
    budget: 0,
    currency: 'USD',
    class: 'Budget',
    operator_share: 100,
    partner_share: 0,
    status: 'Draft',
    start_date: '',
    end_date: ''
  });
  const windowError = validateAfeWindow(formData.start_date, formData.end_date);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const refuseBadWindow = () => {
    if (!windowError) return false;
    toast({ variant: 'destructive', title: 'Check the AFE dates', description: windowError });
    return true;
  };

  const handleNext = () => {
    if (step === 2 && refuseBadWindow()) return;
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (refuseBadWindow()) return;
    const { error } = await supabase.from('afes').insert([{
        ...formData,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        user_id: (await supabase.auth.getUser()).data.user.id
    }]);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: 'AFE Created.' });
      onSuccess();
      onOpenChange(false);
      setStep(1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New AFE - Step {step} of 3</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {step === 1 && (
            <>
              <div>
                <Label>Project Link</Label>
                <NativeSelect
                  aria-label="Project Link"
                  value={formData.project_id}
                  onChange={e => handleChange('project_id', e.target.value)}
                >
                  <option value="">Select Project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>AFE Number</Label>
                  <Input value={formData.afe_number} onChange={e => handleChange('afe_number', e.target.value)} placeholder="AFE-2024-001" />
                </div>
                <div>
                  <Label>AFE Name</Label>
                  <Input value={formData.afe_name} onChange={e => handleChange('afe_name', e.target.value)} placeholder="Drilling Campaign..." />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Currency</Label>
                  <Select value={formData.currency} onValueChange={val => handleChange('currency', val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Budget Amount</Label>
                  <Input type="number" value={formData.budget} onChange={e => handleChange('budget', parseFloat(e.target.value))} />
                </div>
              </div>
              <div>
                <Label>AFE Class</Label>
                <Select value={formData.class} onValueChange={val => handleChange('class', val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Screening">Screening (+/- 50%)</SelectItem>
                    <SelectItem value="Budget">Budget (+/- 30%)</SelectItem>
                    <SelectItem value="Control">Control (+/- 10%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="afe-start-date">Start date</Label>
                  <Input id="afe-start-date" type="date" value={formData.start_date} onChange={e => handleChange('start_date', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="afe-end-date">End date</Label>
                  <Input id="afe-end-date" type="date" min={formData.start_date || undefined} value={formData.end_date} onChange={e => handleChange('end_date', e.target.value)} />
                </div>
              </div>
              {windowError ? (
                <p role="alert" className="text-xs text-pl-danger-text">{windowError}</p>
              ) : (
                <p className="text-xs text-pl-muted">The schedule index and the S curve are measured against this window. Without both dates the schedule index is unavailable.</p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Operator Share (%)</Label>
                  <Input type="number" value={formData.operator_share} onChange={e => handleChange('operator_share', parseFloat(e.target.value))} />
                </div>
                <div>
                  <Label>Partner Share (%)</Label>
                  <Input type="number" value={100 - formData.operator_share} disabled className="opacity-50" />
                </div>
              </div>
              <div className="bg-pl-sunken/60 border border-pl-border p-4 rounded text-sm text-pl-text">
                <p><strong>Summary:</strong></p>
                <p>AFE: {formData.afe_number} - {formData.afe_name}</p>
                <p>Budget: {formData.budget} {formData.currency}</p>
                <p>Window: {formData.start_date && formData.end_date ? `${formData.start_date} to ${formData.end_date}` : 'Not set (the schedule index will be unavailable)'}</p>
                <p>Share: {formData.operator_share}% Ops / {100 - formData.operator_share}% Partner</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {step > 1 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 3 ? (
            <Button onClick={handleNext}>Next</Button>
          ) : (
            <Button onClick={handleSubmit}>Create AFE</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AFECreationWizard;