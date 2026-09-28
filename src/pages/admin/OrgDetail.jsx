import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Send, Edit, Building2 } from 'lucide-react';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';
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

const OrgDetailPage = () => {
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
        .from('organization_members')
        .select('*')
        .eq('organization_id', orgId);

      if (membersError) throw membersError;
      
      // Flatten members structure for easier usage
      // organization_members carries email/full_name directly
      const formattedMembers = membersData.map(m => ({
        ...m,
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
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading organization">
        <Loader2 className="w-8 h-8 animate-spin text-pl-muted" aria-hidden="true" />
      </div>
    );
  }

  if (!org) return <div className="text-pl-text p-8">Organization not found.</div>;

  const tabCard = 'p-4 sm:p-6';

  return (
    <AdminOrgProvider value={contextValue}>
        <AccountPage width="max-w-7xl">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-pl-muted">
                <Link to="/admin/organizations" className="hover:text-pl-text transition-colors">Organizations</Link>
                <span aria-hidden="true">/</span>
                <span className="text-pl-text font-medium">{org.name}</span>
            </nav>

            <AccountHeader
                eyebrow="Platform admin"
                icon={Building2}
                title={(
                    <span className="flex flex-wrap items-center gap-3">
                        {org.name}
                        <Badge variant={org.suite_status === 'ACTIVE' ? 'success' : org.suite_status === 'PENDING_VERIFICATION' ? 'info' : 'warning'}>
                            {org.suite_status || 'UNKNOWN'}
                        </Badge>
                    </span>
                )}
                description={org.contact_email}
                actions={(
                    <>
                        <UpgradeSuiteButton orgId={orgId} />
                        <Button variant="outline" onClick={() => navigate(`/admin/organizations/${orgId}/send-quote`)}>
                            <Send className="w-4 h-4 mr-2" aria-hidden="true" /> Send Quote
                        </Button>
                        <Button className="font-bold" onClick={() => navigate(`/admin/organizations/${orgId}/edit`)}>
                            <Edit className="w-4 h-4 mr-2" aria-hidden="true" /> Edit
                        </Button>
                    </>
                )}
            />

            {/* Tabs Navigation */}
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full justify-start h-auto flex-wrap gap-1 p-1">
                    {['overview', 'team', 'access', 'subscription', 'quotes', 'payments', 'audit'].map(tab => (
                        <TabsTrigger 
                            key={tab} 
                            value={tab} 
                            className="capitalize px-4 py-2"
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
                        <Card className={tabCard}>
                            <OrgTeam users={members} onUpdate={fetchOrgDetails} />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="access" className="mt-0 focus-visible:outline-none">
                        <Card className={`${tabCard} md:h-[600px]`}>
                            <OrgAccess users={members} />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="subscription" className="mt-0 focus-visible:outline-none">
                        <Card className={tabCard}>
                            <OrgSubscription />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="quotes" className="mt-0 focus-visible:outline-none">
                        <Card className={`${tabCard} md:h-[700px]`}>
                            <OrgQuotes />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="payments" className="mt-0 focus-visible:outline-none">
                        <Card className={tabCard}>
                            <OrgPayments />
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="audit" className="mt-0 focus-visible:outline-none">
                        <Card className={tabCard}>
                            <OrgAudit />
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </AccountPage>
    </AdminOrgProvider>
  );
};

export default function OrgDetail() {
  return (
    <AccountScope testId="org-detail-theme-scope">
      <OrgDetailPage />
    </AccountScope>
  );
}
