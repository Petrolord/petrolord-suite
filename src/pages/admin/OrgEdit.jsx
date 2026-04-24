import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save } from 'lucide-react';

const OrgEdit = () => {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    contact_email: '',
    contact_phone: '',
    suite_status: '',
    hse_status: '',
    subscription_tier: ''
  });

  useEffect(() => {
    fetchOrgDetails();
  }, [orgId]);

  const fetchOrgDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();
      
      if (error) throw error;
      
      setFormData({
        name: data.name || '',
        contact_email: data.contact_email || '',
        contact_phone: data.contact_phone || '', // Check DB column name
        suite_status: data.suite_status || 'PENDING',
        hse_status: data.hse_status || 'NONE',
        subscription_tier: data.subscription_tier || 'free'
      });

    } catch (error) {
      console.error("Error fetching details:", error);
      toast({ title: "Error", description: "Failed to load organization details", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update(formData)
        .eq('id', orgId);

      if (error) throw error;

      toast({ 
        title: "Success", 
        description: "Organization updated successfully.",
        className: "bg-green-600 text-white"
      });
      navigate(`/admin/organizations/${orgId}`);

    } catch (error) {
      console.error("Update error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#84CC16]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/admin/organizations" className="hover:text-white transition-colors">Organizations</Link>
            <span>/</span>
            <Link to={`/admin/organizations/${orgId}`} className="hover:text-white transition-colors">{formData.name}</Link>
            <span>/</span>
            <span className="text-white font-medium">Edit</span>
          </div>
          
          <div className="flex justify-between items-center">
            <Button variant="ghost" className="text-slate-400 hover:text-white pl-0" onClick={() => navigate(`/admin/organizations/${orgId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Cancel
            </Button>
          </div>
        </div>

        <Card className="bg-slate-900 border-slate-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-white">Edit Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300">Organization Name</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="bg-slate-950 border-slate-700"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300">Contact Email</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={formData.contact_email} 
                    onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                    className="bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-slate-300">Phone</Label>
                  <Input 
                    id="phone" 
                    value={formData.contact_phone} 
                    onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                    className="bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-slate-300">Suite Status</Label>
                  <Select 
                    value={formData.suite_status} 
                    onValueChange={(val) => setFormData({...formData, suite_status: val})}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-700">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="PENDING_VERIFICATION">Pending Verification</SelectItem>
                      <SelectItem value="PENDING_PAYMENT">Pending Payment</SelectItem>
                      <SelectItem value="NONE">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">HSE Status</Label>
                  <Select 
                    value={formData.hse_status} 
                    onValueChange={(val) => setFormData({...formData, hse_status: val})}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-700">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="NONE">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Subscription Tier</Label>
                  <Select 
                    value={formData.subscription_tier} 
                    onValueChange={(val) => setFormData({...formData, subscription_tier: val})}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-700">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => navigate(`/admin/organizations/${orgId}`)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#84CC16] hover:bg-[#65a30d] text-slate-900 font-bold min-w-[120px]" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </div>

            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default OrgEdit;