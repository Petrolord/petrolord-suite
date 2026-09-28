import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Building2 } from 'lucide-react';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

const OrgEditPage = () => {
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
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading organization">
        <Loader2 className="w-8 h-8 animate-spin text-pl-muted" aria-hidden="true" />
      </div>
    );
  }

  return (
    <AccountPage width="max-w-3xl">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-pl-muted">
          <Link to="/admin/organizations" className="hover:text-pl-text transition-colors">Organizations</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/admin/organizations/${orgId}`} className="hover:text-pl-text transition-colors">{formData.name}</Link>
          <span aria-hidden="true">/</span>
          <span className="text-pl-text font-medium">Edit</span>
        </nav>

        <AccountHeader
          eyebrow="Platform admin"
          icon={Building2}
          title="Edit Organization"
          backTo={`/admin/organizations/${orgId}`}
          backLabel="Cancel and go back"
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Organization details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Contact Email</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={formData.contact_email} 
                    onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input 
                    id="phone" 
                    value={formData.contact_phone} 
                    onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Suite Status</Label>
                  <Select 
                    value={formData.suite_status} 
                    onValueChange={(val) => setFormData({...formData, suite_status: val})}
                  >
                    <SelectTrigger aria-label="Suite Status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="PENDING_VERIFICATION">Pending Verification</SelectItem>
                      <SelectItem value="PENDING_PAYMENT">Pending Payment</SelectItem>
                      <SelectItem value="NONE">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>HSE Status</Label>
                  <Select 
                    value={formData.hse_status} 
                    onValueChange={(val) => setFormData({...formData, hse_status: val})}
                  >
                    <SelectTrigger aria-label="HSE Status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="NONE">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Subscription Tier</Label>
                  <Select 
                    value={formData.subscription_tier} 
                    onValueChange={(val) => setFormData({...formData, subscription_tier: val})}
                  >
                    <SelectTrigger aria-label="Subscription Tier">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
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
                <Button type="submit" className="font-bold min-w-[120px]" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </div>

            </form>
          </CardContent>
        </Card>
    </AccountPage>
  );
};

export default function OrgEdit() {
  return (
    <AccountScope testId="org-edit-theme-scope">
      <OrgEditPage />
    </AccountScope>
  );
}
