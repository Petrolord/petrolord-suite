import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SupabaseService } from '@/services/SupabaseService';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ArrowRight, Activity, AlertTriangle, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

const MobileDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ projects: 0, tasks: 0, risks: 0 });
  const [recentProjects, setRecentProjects] = useState([]);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    const { count: projectCount } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    const { count: riskCount } = await supabase.from('risks').select('*', { count: 'exact', head: true }).eq('status', 'Open');
    const { count: taskCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'To Do'); // Simplified query logic
    
    const { data: recents } = await supabase.from('projects')
      .select('id, name, status, stage, percent_complete')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(3);

    setStats({ projects: projectCount || 0, tasks: taskCount || 0, risks: riskCount || 0 });
    setRecentProjects(recents || []);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-pl-text">Hello, {user?.user_metadata?.full_name?.split(' ')[0] || 'User'}</h1>
          <p className="text-sm text-pl-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-pl-primary flex items-center justify-center text-pl-primary-fg font-bold">
            {user?.email?.[0].toUpperCase()}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
            <CardContent className="p-4 flex flex-col items-center text-center">
                <Activity className="w-6 h-6 text-pl-muted mb-2" aria-hidden="true" />
                <span className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{stats.projects}</span>
                <span className="text-xs text-pl-muted">Active Projects</span>
            </CardContent>
        </Card>
        <Card>
            <CardContent className="p-4 flex flex-col items-center text-center">
                <AlertTriangle className="w-6 h-6 text-pl-muted mb-2" aria-hidden="true" />
                <span className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{stats.risks}</span>
                <span className="text-xs text-pl-muted">Open Risks</span>
            </CardContent>
        </Card>
      </div>

      {/* Recent Projects */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
            <h2 className="font-bold text-pl-text">Recent Projects</h2>
            <Link to="/mobile/projects" className="text-xs text-pl-primary-text hover:text-pl-primary-text-hover flex items-center">View All <ArrowRight className="w-3 h-3 ml-1"/></Link>
        </div>
        {recentProjects.map(p => (
            <Link to={`/mobile/projects/${p.id}`} key={p.id}>
                <Card className="mb-3 hover:bg-pl-sunken transition-colors">
                    <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-pl-text">{p.name}</h3>
                            <Badge variant={
                                p.status === 'Green' ? 'success' :
                                p.status === 'Amber' ? 'warning' : 'danger'
                            } className="px-2 py-0.5 text-[10px]">{p.status}</Badge>
                        </div>
                        <div className="flex justify-between text-xs text-pl-muted mb-2">
                            <span>{p.stage}</span>
                            <span>{p.percent_complete}%</span>
                        </div>
                        <div className="h-1 bg-pl-sunken rounded-full overflow-hidden">
                            <div className="h-full bg-pl-primary" style={{ width: `${p.percent_complete}%` }} />
                        </div>
                    </CardContent>
                </Card>
            </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button className="w-full" asChild>
            <Link to="/mobile/tasks">My Tasks</Link>
        </Button>
        <Button variant="outline" className="w-full" asChild>
            <Link to="/mobile/notifications">Notifications</Link>
        </Button>
      </div>
    </div>
  );
};

export default MobileDashboard;