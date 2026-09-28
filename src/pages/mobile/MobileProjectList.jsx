import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Search, Filter, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

const MobileProjectList = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects')
        .select('id, name, stage, status, percent_complete, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
    setProjects(data || []);
  };

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-lg font-bold text-pl-text mb-4">My Projects</h1>
      
      <div className="flex gap-2">
        <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
            <Input 
                placeholder="Search..." 
                className="pl-9" 
                value={search}
                onChange={e => setSearch(e.target.value)}
            />
        </div>
        <button className="p-2 bg-pl-surface border border-pl-border-strong rounded-md text-pl-muted" aria-label="Filter">
            <Filter className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3 pb-20">
        {filtered.map(project => (
            <Link to={`/mobile/projects/${project.id}`} key={project.id}>
                <Card className="active:bg-pl-sunken transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-pl-text truncate">{project.name}</h3>
                                <Badge variant={
                                    project.status === 'Green' ? 'success' :
                                    project.status === 'Amber' ? 'warning' : 'danger'
                                } className="shrink-0 px-2 py-0 text-[10px]">{project.status}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-pl-muted">
                                <span>{project.stage}</span>
                                <span>•</span>
                                <span>{project.percent_complete}% Done</span>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-pl-muted ml-2" aria-hidden="true" />
                    </CardContent>
                </Card>
            </Link>
        ))}
        {filtered.length === 0 && (
            <div className="text-center text-pl-muted mt-10">No projects found.</div>
        )}
      </div>
    </div>
  );
};

export default MobileProjectList;