import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Send, Edit } from 'lucide-react';
import { AdminOrgProvider } from '@/contexts/AdminOrganizationContext';
import UpgradeSuiteButton from '@/components/UpgradeSuiteButton';

// Tabs
import OrgOverview from '@/components/admin/organizations/OrgOverview';
import OrgTeam from '@/components/admin/organizations/OrgTeam';
import OrgAccess from '@/components/admin/organizations/OrgAccess';
import OrgSubscription from '@/components/admin/organizations/OrgSubscription';
import OrgQuotes from '@/components/admin/organizations/OrgQuotes';
import OrgPayments from '@/components/admin/organizations/OrgPayments';
import OrgAudit from '@/components/admin/organizations/OrgAudit';

const OrgDetail = () => {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // We are creating a local provider value here because OrgDetail fetches its own data specific to the ID.
  // In a larger app, the global provider in App.jsx would handle this, but to preserve the specific logic requested:
  
  const fetchOrgDetails = async () => {
    try {
      setLoading(true);
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*, subscription:subscriptions(*)')
        .eq('id', orgId)
        .single();
      
      if (orgError) throw orgError;
      
      // Flatten subscription if it comes as an array or just attach it
      if (orgData.subscription && Array.isArray(orgData.subscription)) {
          orgData.subscription = orgData.subscription[0] || {};
      }
      
      setOrg(orgData);

      const { data: membersData, error: membersError } = await supabase
        .from('organization_users')
        .select('*, users:user_id(email, id)')
        .eq('organization_id', orgId);

      if (membersError) throw membersError;
      
      // Flatten members structure for easier usage
      const formattedMembers = membersData.map(m => ({
        ...m,
        email: m.users?.email,
        user_created_at: m.created_at 
      }));
      
      setMembers(formattedMembers);

    } catch (error) {
      console.error("Error fetching details:", error);
      toast({ title: "Error", description: "Failed to load organization details", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgDetails();
  }, [orgId]);

  // Context value object specifically for this detail view
  const contextValue = {
    selectedOrg: org,
    organizations: [org], 
    selectOrganization: () => {}, 
    updateOrganization: async (id, updates) => {
        const { error } = await supabase.from('organizations').update(updates).eq('id', id);
        if(!error) fetchOrgDetails();
        return { error };
    },
    deleteOrganization: async () => {}, 
    loading: loading,
    fetchOrganizations: async () => {},
    fetchOrgUsers: async () => members
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#FCD34D]" />
      </div>
    );
  }

  if (!org) return <div className="text-white p-8">Organization not found.</div>;

  return (
    <AdminOrgProvider value={contextValue}>
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Link to="/admin/organizations" className="hover:text-white transition-colors">Organizations</Link>
                    <span>/</span>
                    <span className="text-white font-medium">{org.name}</span>
                </div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            {org.name}
                            <Badge className={
                                org.suite_status === 'ACTIVE' ? 'bg-[#84CC16]/20 text-[#84CC16]' : 'bg-slate-800 text-slate-400'
                            }>
                                {org.suite_status || 'UNKNOWN'}
                            </Badge>
                        </h1>
                        <p className="text-slate-400 mt-1">{org.contact_email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <UpgradeSuiteButton orgId={orgId} />
                        
                        <Button variant="outline" className="border-[#FCD34D] text-[#FCD34D] hover:bg-[#FCD34D]/10" onClick={() => navigate(`/admin/organizations/${orgId}/send-quote`)}>
                            <Send className="w-4 h-4 mr-2" /> Send Quote
                        </Button>
                        <Button className="bg-[#84CC16] hover:bg-[#65a30d] text-slate-900 font-bold" onClick={() => navigate(`/admin/organizations/${orgId}/edit`)}>
                            <Edit className="w-4 h-4 mr-2" /> Edit
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="bg-slate-900/80 border border-slate-800 p-1 w-full justify-start h-auto flex-wrap gap-1 rounded-lg backdrop-blur-sm">
                    {['overview', 'team', 'access', 'subscription', 'quotes', 'payments', 'audit'].map(tab => (
                        <TabsTrigger 
                            key={tab} 
                            value={tab} 
                            className="capitalize data-[state=active]:bg-[#FCD34D] data-[state=active]:text-slate-900 data-[state=active]:font-bold px-4 py-2 rounded-md transition-all duration-200"
                        >
                            {tab === 'access' ? 'Access Matrix' : tab === 'audit' ? 'Audit Log' : tab}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="mt-6">
                    <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
                        <OrgOverview orgUsers={members} />
                    </TabsContent>
                    
                    <TabsContent value="team" className="mt-0 focus-visible:outline-none">
                        <Card className="bg-slate-900/50 border-slate-800 p-6 rounded-xl shadow-lg">
                            <OrgTeam users={members} onUpdate={fetchOrgDetails} />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="access" className="mt-0 focus-visible:outline-none">
                        <Card className="bg-slate-900/50 border-slate-800 p-6 rounded-xl shadow-lg h-[600px]">
                            <OrgAccess users={members} />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="subscription" className="mt-0 focus-visible:outline-none">
                        <Card className="bg-slate-900/50 border-slate-800 p-6 rounded-xl shadow-lg">
                            <OrgSubscription />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="quotes" className="mt-0 focus-visible:outline-none">
                        <Card className="bg-slate-900/50 border-slate-800 p-6 rounded-xl shadow-lg h-[700px]">
                            <OrgQuotes />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="payments" className="mt-0 focus-visible:outline-none">
                        <Card className="bg-slate-900/50 border-slate-800 p-6 rounded-xl shadow-lg">
                            <OrgPayments />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="audit" className="mt-0 focus-visible:outline-none">
                        <Card className="bg-slate-900/50 border-slate-800 p-6 rounded-xl shadow-lg">
                            <OrgAudit />
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>

        </div>
        </div>
    </AdminOrgProvider>
  );
};

export default OrgDetail;