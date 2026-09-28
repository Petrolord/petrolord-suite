import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Save, UserPlus, X } from 'lucide-react';

const ResourceForm = ({ open, onOpenChange, project, existingResource, onSaved }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [name, setName] = useState('');
  const [type, setType] = useState('Person');
  const [discipline, setDiscipline] = useState('General');
  const [availability, setAvailability] = useState(100);
  const [cost, setCost] = useState(0);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('Active');
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState('');

  useEffect(() => {
    if (existingResource) {
      setName(existingResource.name || '');
      setType(existingResource.type || 'Person');
      setDiscipline(existingResource.discipline || 'General');
      setAvailability(existingResource.availability_percent || 100);
      setCost(existingResource.cost_per_day || 0);
      setEmail(existingResource.contact_info?.email || '');
      setPhone(existingResource.contact_info?.phone || '');
      setDepartment(existingResource.department || '');
      setStatus(existingResource.status || 'Active');
      setSkills(existingResource.skills || []);
    } else {
      setName('');
      setType('Person');
      setDiscipline('General');
      setAvailability(100);
      setCost(0);
      setEmail('');
      setPhone('');
      setDepartment('');
      setStatus('Active');
      setSkills([]);
    }
  }, [existingResource, open]);

  const handleAddSkill = (e) => {
    e.preventDefault();
    if (newSkill && !skills.includes(newSkill)) {
      setSkills([...skills, newSkill]);
      setNewSkill('');
    }
  };

  const removeSkill = (skillToRemove) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!project) return;
    setLoading(true);

    const payload = {
        project_id: project.id,
        name,
        type,
        discipline,
        availability_percent: availability,
        cost_per_day: cost,
        contact_info: { email, phone },
        department,
        status,
        skills
    };

    let error = null;

    if (existingResource) {
        const { error: updateError } = await supabase
            .from('pm_resources')
            .update({ ...payload, updated_at: new Date() })
            .eq('id', existingResource.id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase
            .from('pm_resources')
            .insert([payload]);
        error = insertError;
    }

    setLoading(false);

    if (error) {
        toast({ variant: "destructive", title: "Error saving resource", description: error.message });
    } else {
        toast({ title: "Resource Saved", description: "Resource pool updated successfully." });
        onSaved();
        onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-pl-muted" />
            {existingResource ? 'Edit Resource' : 'Add New Resource'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Name</Label>
                    <Input 
                        placeholder="e.g. John Doe" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        required 
                       
                    />
                </div>
                <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Person">Person</SelectItem>
                            <SelectItem value="Team">Team</SelectItem>
                            <SelectItem value="Vendor">Vendor</SelectItem>
                            <SelectItem value="Equipment">Equipment</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Discipline</Label>
                    <Select value={discipline} onValueChange={setDiscipline}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="General">General</SelectItem>
                            <SelectItem value="Geologist">Geologist</SelectItem>
                            <SelectItem value="Petrophysicist">Petrophysicist</SelectItem>
                            <SelectItem value="Drilling Engineer">Drilling Engineer</SelectItem>
                            <SelectItem value="Reservoir Engineer">Reservoir Engineer</SelectItem>
                            <SelectItem value="Production Engineer">Production Engineer</SelectItem>
                            <SelectItem value="Data Scientist">Data Scientist</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Department / Vendor</Label>
                    <Input 
                        placeholder="e.g. Subsurface or Schlumberger" 
                        value={department} 
                        onChange={e => setDepartment(e.target.value)} 
                       
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-pl-sunken rounded border border-pl-border">
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Availability (%)</Label>
                        <span className="font-pl-mono tabular-nums text-pl-text">{availability}%</span>
                    </div>
                    <Slider 
                        value={[availability]} 
                        onValueChange={vals => setAvailability(vals[0])} 
                        max={100} step={5} 
                    />
                </div>
                <div className="space-y-2">
                    <Label>Cost Per Day ($)</Label>
                    <Input 
                        type="number"
                        placeholder="0.00"
                        value={cost} 
                        onChange={e => setCost(parseFloat(e.target.value))} 
                       
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Skills</Label>
                <div className="flex gap-2 mb-2 flex-wrap">
                    {skills.map(skill => (
                        <Badge key={skill} variant="secondary" className="bg-pl-sunken hover:bg-pl-border cursor-pointer flex items-center gap-1">
                            {skill}
                            <X className="w-3 h-3" onClick={() => removeSkill(skill)} />
                        </Badge>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Input 
                        placeholder="Add skill (e.g. Python, Petrel)" 
                        value={newSkill} 
                        onChange={e => setNewSkill(e.target.value)} 
                       
                        onKeyDown={e => e.key === 'Enter' && handleAddSkill(e)}
                    />
                    <Button type="button" onClick={handleAddSkill} size="sm" variant="secondary">Add</Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                        type="email"
                        placeholder="contact@example.com" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                       
                    />
                </div>
                <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input 
                        placeholder="+1 234 567 890" 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                       
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="On Leave">On Leave</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Resource
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ResourceForm;