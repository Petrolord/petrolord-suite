import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const SaveDesignDialog = ({ isOpen, onOpenChange, designData, currentName = '' }) => {
  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Design name is required.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      
      const userId = userData.user.id;

      // Upsert based on user_id and design_name
      const { error } = await supabase
        .from('artificial_lift_designs')
        .upsert({
          user_id: userId,
          design_name: name.trim(),
          design_description: description.trim(),
          design_data: designData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id, design_name'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Design saved and secured successfully!",
        className: "bg-green-600 text-white border-none",
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving design:', err);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: err.message || "Error saving design. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-slate-100">
        <DialogHeader>
          <DialogTitle>Save Artificial Lift Design</DialogTitle>
          <DialogDescription className="text-slate-400">
            Save your current configuration for screening, ESP, Gas Lift, and Rod Pump parameters.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name *
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3 bg-slate-800 border-slate-600 text-white"
              placeholder="e.g., Well-A1-ESP-Design"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3 bg-slate-800 border-slate-600 text-white"
              placeholder="Optional notes about this design..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300 hover:text-white">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !name.trim()} className="bg-lime-600 hover:bg-lime-500 text-white">
            {isSaving ? "Saving..." : "Save Design"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveDesignDialog;