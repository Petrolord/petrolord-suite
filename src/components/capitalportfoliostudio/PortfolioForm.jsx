import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

const PortfolioForm = ({ portfolio, onSave, onCancel }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: portfolio?.name || '',
    capex_limit: portfolio?.capex_limit || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();

    const portfolioData = {
      user_id: user.id,
      name: formData.name,
      capex_limit: parseFloat(formData.capex_limit),
    };

    if (!portfolioData.name || isNaN(portfolioData.capex_limit)) {
      toast({ variant: 'destructive', title: 'Please fill all fields correctly.' });
      return;
    }

    let error;
    if (portfolio?.id) {
      const { error: updateError } = await supabase.from('portfolios').update(portfolioData).eq('id', portfolio.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('portfolios').insert(portfolioData);
      error = insertError;
    }

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to save portfolio', description: error.message });
    } else {
      toast({ title: 'Success!', description: `Portfolio ${portfolio?.id ? 'updated' : 'created'}.` });
      onSave();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><Label htmlFor="name">Portfolio Name</Label><Input id="name" name="name" value={formData.name} onChange={handleChange} required /></div>
      <div><Label htmlFor="capex_limit">CAPEX Limit ($MM)</Label><Input id="capex_limit" name="capex_limit" type="number" value={formData.capex_limit} onChange={handleChange} required /></div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{portfolio?.id ? 'Update' : 'Create'} Portfolio</Button>
      </DialogFooter>
    </form>
  );
};

export default PortfolioForm;