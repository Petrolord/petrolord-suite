import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2 } from 'lucide-react';

const InviteEmployee = ({ orgId, onSuccess }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        full_name: '',
        role: 'viewer'
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Validation
        if (!orgId) {
            toast({ title: "Error", description: "Organization ID is missing.", variant: "destructive" });
            setLoading(false);
            return;
        }

        try {
            // Call the edge function directly
            const { data, error } = await supabase.functions.invoke('invite-employee', {
                body: {
                    ...formData,
                    organization_id: orgId, // Ensure orgId is passed
                    apps_to_assign: []
                }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast({ 
                title: "Invitation Sent", 
                description: `Invite sent to ${formData.email}`, 
                className: "bg-green-600 text-white" 
            });
            
            if (onSuccess) onSuccess();
            setFormData({ email: '', full_name: '', role: 'viewer' }); // Reset form

        } catch (err) {
            console.error("Invite Error:", err);
            toast({ 
                title: "Invite Failed", 
                description: err.message || "Could not invite employee.", 
                variant: "destructive" 
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Full Name</Label>
                <Input 
                    value={formData.full_name} 
                    onChange={e => setFormData(prev => ({...prev, full_name: e.target.value}))}
                    placeholder="John Doe"
                    required
                    className="bg-slate-950 border-slate-800"
                />
            </div>
            <div className="space-y-2">
                <Label>Email Address</Label>
                <Input 
                    type="email"
                    value={formData.email} 
                    onChange={e => setFormData(prev => ({...prev, email: e.target.value}))}
                    placeholder="john@company.com"
                    required
                    className="bg-slate-950 border-slate-800"
                />
            </div>
            <div className="space-y-2">
                <Label>Role</Label>
                <select 
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-white"
                    value={formData.role}
                    onChange={e => setFormData(prev => ({...prev, role: e.target.value}))}
                >
                    <option value="viewer">Viewer</option>
                    <option value="engineer">Engineer</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                </select>
            </div>
            <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={loading} className="bg-lime-600 hover:bg-lime-700 text-white w-full">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
                    {loading ? 'Sending...' : 'Send Invite'}
                </Button>
            </div>
        </form>
    );
};

export default InviteEmployee;