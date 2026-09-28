import React, { useState, useEffect } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';

const DCAWellMetadata = () => {
  const { currentWell, updateWellMetadata } = useDeclineCurve();
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (currentWell) {
      setNotes(currentWell.notes || '');
      setTags((currentWell.tags || []).join(', '));
    }
  }, [currentWell]);

  const handleSave = () => {
    if (!currentWell) return;
    updateWellMetadata(currentWell.id, {
      notes,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean)
    });
  };

  if (!currentWell) return <div className="text-pl-muted text-xs italic p-4">Select a well to edit metadata</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-pl-muted mb-2">
        <Info size={14} />
        <span className="text-xs font-medium uppercase tracking-wider">Metadata</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Tags (comma separated)</Label>
        <Input 
          value={tags} 
          onChange={(e) => setTags(e.target.value)} 
          placeholder="e.g. HZ, Pad A, Gas Lift"
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Notes</Label>
        <Textarea 
          value={notes} 
          onChange={(e) => setNotes(e.target.value)} 
          placeholder="Engineering comments..."
          className="min-h-[80px] text-xs resize-none"
        />
      </div>

      <Button onClick={handleSave} size="sm" variant="secondary" className="w-full h-7 text-xs">
        Save Metadata
      </Button>
    </div>
  );
};

export default DCAWellMetadata;