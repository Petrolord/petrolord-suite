import React, { useState, useEffect } from 'react';
import { DocControlShell } from './components/DocControlShell';
import { DocumentControlService } from '@/services/DocumentControlService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CheckCircle, Clock, AlertTriangle, ArrowRight, Eye } from 'lucide-react';
import { StatusBadge } from './components/StatusBadge';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, a, app, r] = await Promise.all([
          DocumentControlService.getDashboardStats(),
          DocumentControlService.getActivityLog(),
          DocumentControlService.getApprovals(),
          DocumentControlService.getReportData()
        ]);
        setStats(s);
        setActivity(a);
        setApprovals(app);
        setReportData(r);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#A0AEC0'];

  if (loading) return <DocControlShell><div className="flex h-64 items-center justify-center text-[#A0AEC0]">Loading dashboard...</div></DocControlShell>;

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-[#232B3A] border-[#2D3748]">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#A0AEC0] mb-1">Total Documents</p>
                <h3 className="text-3xl font-bold text-[#E2E8F0]">{stats?.totalDocs}</h3>
              </div>
              <div className="p-3 bg-[#3B82F6]/10 rounded-full">
                <FileText className="w-6 h-6 text-[#3B82F6]" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#232B3A] border-[#2D3748]">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#A0AEC0] mb-1">In Review</p>
                <h3 className="text-3xl font-bold text-[#E2E8F0]">{stats?.inReview}</h3>
              </div>
              <div className="p-3 bg-[#F59E0B]/10 rounded-full">
                <Clock className="w-6 h-6 text-[#F59E0B]" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#232B3A] border-[#2D3748]">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#A0AEC0] mb-1">Approved/Published</p>
                <h3 className="text-3xl font-bold text-[#E2E8F0]">{stats?.approved}</h3>
              </div>
              <div className="p-3 bg-[#10B981]/10 rounded-full">
                <CheckCircle className="w-6 h-6 text-[#10B981]" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#232B3A] border-[#2D3748]">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#A0AEC0] mb-1">Overdue Reviews</p>
                <h3 className="text-3xl font-bold text-[#EF4444]">{stats?.overdue}</h3>
              </div>
              <div className="p-3 bg-[#EF4444]/10 rounded-full">
                <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Left */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-[#232B3A] border-[#2D3748]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium text-[#E2E8F0]">My Pending Approvals</CardTitle>
                <Link to="/dashboard/apps/assurance/document-control/approvals" className="text-sm text-[#3B82F6] hover:underline flex items-center">
                  View All <ArrowRight className="w-4 h-4 ml-1"/>
                </Link>
              </CardHeader>
              <CardContent>
                {approvals.length === 0 ? (
                  <div className="text-center py-8 text-[#A0AEC0] text-sm">No pending approvals.</div>
                ) : (
                  <div className="space-y-4">
                    {approvals.map(app => (
                      <div key={app.id} className="flex items-center justify-between p-4 rounded-lg border border-[#2D3748] bg-[#0F1419] hover:bg-[#1A1F2E] transition-colors">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-[#A0AEC0]">{app.document_number}</span>
                            <StatusBadge status={app.status} />
                          </div>
                          <p className="text-sm font-medium text-[#E2E8F0]">{app.title}</p>
                          <p className="text-xs text-[#A0AEC0] mt-1">Due: {app.due_date} • Requested by: {app.requester}</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-[#2D3748] bg-[#232B3A] text-[#E2E8F0] hover:bg-[#1A1F2E]">
                          Review
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-6">
              <Card className="bg-[#232B3A] border-[#2D3748]">
                 <CardHeader><CardTitle className="text-base font-medium text-[#E2E8F0]">Status Distribution</CardTitle></CardHeader>
                 <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={reportData?.statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} stroke="none">
                           {reportData?.statusDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{backgroundColor: '#232B3A', border: '1px solid #2D3748', borderRadius: '8px', color: '#E2E8F0'}} itemStyle={{color: '#E2E8F0'}} />
                      </PieChart>
                    </ResponsiveContainer>
                 </CardContent>
              </Card>
              <Card className="bg-[#232B3A] border-[#2D3748]">
                 <CardHeader><CardTitle className="text-base font-medium text-[#E2E8F0]">Department Distribution</CardTitle></CardHeader>
                 <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={reportData?.departmentDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} stroke="none">
                           {reportData?.departmentDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{backgroundColor: '#232B3A', border: '1px solid #2D3748', borderRadius: '8px', color: '#E2E8F0'}} itemStyle={{color: '#E2E8F0'}} />
                      </PieChart>
                    </ResponsiveContainer>
                 </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <Card className="bg-[#232B3A] border-[#2D3748] h-full">
              <CardHeader className="pb-2 border-b border-[#2D3748]">
                <CardTitle className="text-lg font-medium text-[#E2E8F0]">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-[#2D3748]">
                  {activity.map(act => (
                    <div key={act.id} className="p-4 hover:bg-[#1A1F2E] transition-colors">
                      <p className="text-sm text-[#E2E8F0] mb-1"><span className="font-semibold">{act.user}</span> {act.action}</p>
                      <div className="flex justify-between items-center text-xs text-[#A0AEC0]">
                        <span className="font-mono">{act.doc}</span>
                        <span>{act.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-[#2D3748] text-center">
                  <Button variant="ghost" size="sm" className="text-[#3B82F6] hover:bg-[#1A1F2E] w-full">View Audit Log</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DocControlShell>
  );
};

export default Dashboard;