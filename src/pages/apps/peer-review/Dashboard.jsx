import React, { useState, useEffect } from 'react';
import { PeerReviewShell } from './components/PeerReviewShell';
import { PeerReviewService } from './services/PeerReviewService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  ArrowRight, 
  BarChart2, 
  MessageSquare,
  PlusCircle 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentReviews, setRecentReviews] = useState([]);
  
  useEffect(() => {
    PeerReviewService.getDashboardStats().then(setStats);
    PeerReviewService.getReviews().then(data => setRecentReviews(data.slice(0, 4)));
  }, []);

  const COLORS = ['#A0AEC0', '#3B82F6', '#F59E0B', '#10B981'];

  return (
    <PeerReviewShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-panel">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-secondary mb-1">Active Reviews</p>
                <h3 className="text-3xl font-bold text-[hsl(var(--foreground))]">{stats?.activeReviews || '0'}</h3>
              </div>
              <div className="p-3 bg-[hsl(var(--primary))]/10 rounded-full">
                <Users className="w-6 h-6 text-[hsl(var(--primary))]" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-panel">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-secondary mb-1">Overdue Reviews</p>
                <h3 className="text-3xl font-bold text-[hsl(var(--warning))]">{stats?.overdueReviews || '0'}</h3>
              </div>
              <div className="p-3 bg-[hsl(var(--warning))]/10 rounded-full">
                <Clock className="w-6 h-6 text-[hsl(var(--warning))]" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-panel">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-secondary mb-1">Open Comments</p>
                <h3 className="text-3xl font-bold text-[hsl(var(--foreground))]">{stats?.openComments || '0'}</h3>
              </div>
              <div className="p-3 bg-[hsl(var(--info))]/10 rounded-full">
                <MessageSquare className="w-6 h-6 text-[hsl(var(--info))]" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-panel border-[hsl(var(--destructive))]/50">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-secondary mb-1">Critical Comments</p>
                <h3 className="text-3xl font-bold text-[hsl(var(--destructive))]">{stats?.criticalComments || '0'}</h3>
              </div>
              <div className="p-3 bg-[hsl(var(--destructive))]/10 rounded-full">
                <AlertTriangle className="w-6 h-6 text-[hsl(var(--destructive))]" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Charts */}
          <div className="lg:col-span-2 space-y-6">
             <Card className="bg-panel">
                <CardHeader>
                  <CardTitle className="text-lg text-[hsl(var(--foreground))]">Review Pipeline by Stage</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.stageDistribution || []} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} allowDecimals={false} />
                      <RechartsTooltip cursor={{fill: 'hsl(var(--secondary))'}} contentStyle={{backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))'}} />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={60}>
                         {stats?.stageDistribution?.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                         ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
             </Card>

             <Card className="bg-panel">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg text-[hsl(var(--foreground))]">Recent Reviews</CardTitle>
                  <Button variant="ghost" size="sm" className="text-[hsl(var(--primary))]" onClick={() => navigate('/dashboard/apps/assurance/peer-review-manager/register')}>View All <ArrowRight className="w-4 h-4 ml-1"/></Button>
                </CardHeader>
                <CardContent>
                   <div className="space-y-4 mt-2">
                     {recentReviews.map(r => (
                        <div key={r.id} className="flex justify-between items-center p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--secondary))] transition-colors cursor-pointer" onClick={() => navigate(`/dashboard/apps/assurance/peer-review-manager/${r.id}`)}>
                           <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 px-2 py-0.5 rounded">{r.review_code}</span>
                                <span className="text-xs text-[hsl(var(--muted-foreground))]">{r.review_type}</span>
                              </div>
                              <p className="text-sm font-medium text-[hsl(var(--foreground))]">{r.title}</p>
                           </div>
                           <div className="text-right">
                              <span className={`text-xs px-2 py-1 rounded-full border ${r.stage === 'Closed' ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20' : 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20'}`}>{r.stage}</span>
                              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Due: {r.due_date || 'N/A'}</p>
                           </div>
                        </div>
                     ))}
                   </div>
                </CardContent>
             </Card>
          </div>
          
          {/* Action Panel */}
          <div className="space-y-6">
            <Card className="bg-panel">
              <CardHeader>
                <CardTitle className="text-lg text-[hsl(var(--foreground))]">My Actions Required</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-[hsl(var(--muted-foreground))] border-2 border-dashed border-[hsl(var(--border))] rounded-lg">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-[hsl(var(--success))]/50" />
                  <p className="text-sm">All caught up!</p>
                  <p className="text-xs mt-1">No pending actions assigned to you.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-panel">
               <CardHeader>
                  <CardTitle className="text-lg text-[hsl(var(--foreground))]">Quick Actions</CardTitle>
               </CardHeader>
               <CardContent className="space-y-3">
                  <Button className="w-full justify-start btn-primary" onClick={() => navigate('/dashboard/apps/assurance/peer-review-manager/new')}>
                    <PlusCircle className="w-4 h-4 mr-2" /> Initiate New Review
                  </Button>
                  <Button variant="outline" className="w-full justify-start bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]">
                    <BarChart2 className="w-4 h-4 mr-2" /> Generate QA Report
                  </Button>
                  <Button variant="outline" className="w-full justify-start bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]">
                    <Users className="w-4 h-4 mr-2" /> Manage Reviewers
                  </Button>
               </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PeerReviewShell>
  );
};

export default Dashboard;