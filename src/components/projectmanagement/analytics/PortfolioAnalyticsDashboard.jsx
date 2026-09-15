import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import AnalyticsOverview from './AnalyticsOverview';
import ProjectTypeAnalytics from './ProjectTypeAnalytics';
import BudgetAnalytics from './BudgetAnalytics';
import RiskAnalytics from './RiskAnalytics';
import AdvancedReportBuilder from '../reports/AdvancedReportBuilder';
import { supabase } from '@/lib/customSupabaseClient';

const PortfolioAnalyticsDashboard = ({ projects }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [reportOpen, setReportOpen] = useState(false);
    const [risks, setRisks] = useState([]);
    const [resources, setResources] = useState([]);
    const [financials, setFinancials] = useState([]);

    useEffect(() => {
        const fetchDeepData = async () => {
            // Ideally, this should be more targeted or paginated for large portfolios
            // Fetching all risks for active projects
            if (projects.length === 0) return;
            
            const projectIds = projects.map(p => p.id);
            
            const { data: riskData } = await supabase.from('risks').select('*').in('project_id', projectIds);
            setRisks(riskData || []);

            const { data: resData } = await supabase.from('pm_resources').select('*').in('project_id', projectIds);
            setResources(resData || []);

            // EC6-0: the portfolio cost charts used to run on a six month series
            // written into the source and a Math.random variance per project.
            // The progress updates people file are the only time-phased cost
            // data the studio holds, so that is what they read.
            const { data: updateData } = await supabase
                .from('project_updates')
                .select('project_id, report_date, planned_value, earned_value, actual_cost')
                .in('project_id', projectIds)
                .order('report_date', { ascending: true });
            setFinancials(updateData || []);
        };

        fetchDeepData();
    }, [projects]);

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex justify-between items-center mb-4">
                        <TabsList className="bg-slate-800">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="types">By Type</TabsTrigger>
                            <TabsTrigger value="budget">Budget & Cost</TabsTrigger>
                            <TabsTrigger value="risks">Risks</TabsTrigger>
                        </TabsList>
                        
                        <Button variant="outline" onClick={() => setReportOpen(true)} className="border-dashed border-slate-600 text-slate-400 hover:text-white">
                            <Download className="w-4 h-4 mr-2" /> Export Report
                        </Button>
                    </div>

                    <div className="mt-4 h-[calc(100vh-250px)] overflow-y-auto pr-2">
                        <TabsContent value="overview" className="mt-0 space-y-6">
                            <AnalyticsOverview projects={projects} risks={risks} financialData={financials} />
                        </TabsContent>
                        
                        <TabsContent value="types" className="mt-0 space-y-6">
                            <ProjectTypeAnalytics projects={projects} />
                        </TabsContent>

                        <TabsContent value="budget" className="mt-0 space-y-6">
                            <BudgetAnalytics projects={projects} financialData={financials} />
                        </TabsContent>

                        <TabsContent value="risks" className="mt-0 space-y-6">
                            <RiskAnalytics risks={risks} />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            <AdvancedReportBuilder 
                open={reportOpen} 
                onOpenChange={setReportOpen} 
                projects={projects}
                risks={risks}
                resources={resources}
            />
        </div>
    );
};

export default PortfolioAnalyticsDashboard;