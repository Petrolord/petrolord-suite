import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Search, LayoutGrid, List as ListIcon, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import ExecutiveSummary from './ExecutiveSummary';
import PortfolioFilters from './PortfolioFilters';
import PortfolioAnalyticsDashboard from './analytics/PortfolioAnalyticsDashboard';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const PortfolioDashboard = ({ projects, onSelectProject }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('grid');
  const [filteredProjects, setFilteredProjects] = useState(projects);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [activeTab, setActiveTab] = useState('dashboard');

  // Handle filtering logic
  useEffect(() => {
    let result = projects;

    // Search
    if (searchTerm) {
        result = result.filter(p => 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }

    // Filters
    Object.keys(activeFilters).forEach(key => {
        if (activeFilters[key] && activeFilters[key].length > 0) {
            result = result.filter(p => activeFilters[key].includes(p[key]));
        }
    });

    setFilteredProjects(result);
  }, [projects, searchTerm, activeFilters]);

  const StatusBadge = ({ status }) => {
      // RAG status: the word is always shown beside the colour.
      const colors = {
          'Green': 'bg-pl-success-bg text-pl-success-text border-pl-success/40',
          'Amber': 'bg-pl-warning-bg text-pl-warning-text border-pl-warning/40',
          'Red': 'bg-pl-danger-bg text-pl-danger-text border-pl-danger/40'
      };
      return (
          <span className={`px-2 py-0.5 rounded text-xs border ${colors[status] || colors.Green}`}>
              {status || 'Green'}
          </span>
      );
  };

  return (
    <div className="h-full flex flex-col space-y-6 p-2">
        {/* Header Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-pl-text">Portfolio Overview</h2>
                <p className="text-pl-muted text-sm">Managing {projects.length} active projects across {new Set(projects.map(p => p.asset)).size} assets.</p>
            </div>
        </div>

        {/* Executive Summary - Always visible at top */}
        <ExecutiveSummary projects={filteredProjects} />

        {/* Main Content Area */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                <TabsList>
                    <TabsTrigger value="dashboard">Projects</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" />
                        <Input 
                            placeholder="Search projects..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-8 h-9"
                        />
                    </div>
                    <PortfolioFilters projects={projects} onFilterChange={setActiveFilters} />
                    <SegmentedControl
                        label="Project view"
                        size="sm"
                        value={viewMode}
                        onValueChange={setViewMode}
                        options={[
                            { value: 'grid', label: 'Grid', icon: LayoutGrid },
                            { value: 'list', label: 'List', icon: ListIcon },
                        ]}
                    />
                </div>
            </div>

            <TabsContent value="dashboard" className="flex-1 mt-0 overflow-y-auto pb-10">
                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredProjects.map(project => (
                            <motion.div 
                                key={project.id} 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Card 
                                    className="hover:border-pl-border-strong transition-all cursor-pointer group"
                                    onClick={() => onSelectProject(project.id)}
                                >
                                    <CardContent className="p-5 space-y-4">
                                        <div className="flex justify-between items-start">
                                            <Badge variant="neutral">
                                                {project.stage || 'Concept'}
                                            </Badge>
                                            <StatusBadge status={project.status} />
                                        </div>
                                        
                                        <div>
                                            <h3 className="font-bold text-pl-text group-hover:text-pl-primary-text transition-colors truncate" title={project.name}>{project.name}</h3>
                                            <p className="text-xs text-pl-muted truncate">{project.asset} • {project.country}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-pl-muted">Progress</span>
                                                <span className="text-pl-text font-pl-mono tabular-nums">{project.percent_complete || 0}%</span>
                                            </div>
                                            <div className="h-1.5 bg-pl-sunken rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-pl-primary rounded-full" 
                                                    style={{ width: `${project.percent_complete || 0}%` }} 
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-pl-border grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[10px] text-pl-muted uppercase">Budget</p>
                                                <p className="text-sm font-pl-mono tabular-nums text-pl-text">${((project.baseline_budget || 0) / 1000000).toFixed(1)}M</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-pl-muted uppercase">Target Date</p>
                                                <p className="text-sm text-pl-text">{project.end_date ? format(new Date(project.end_date), 'MMM yyyy') : 'TBD'}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-pl-surface border border-pl-border rounded-lg overflow-x-auto">
                        <div className="min-w-[640px]">
                        <div className="grid grid-cols-12 bg-pl-sunken p-3 text-xs font-bold uppercase text-pl-muted border-b border-pl-border">
                            <div className="col-span-4">Project Name</div>
                            <div className="col-span-2">Stage</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-2 text-right">Budget</div>
                            <div className="col-span-2 text-right">Completion</div>
                        </div>
                        <div className="divide-y divide-pl-border">
                            {filteredProjects.map(project => (
                                <div 
                                    key={project.id} 
                                    className="grid grid-cols-12 p-3 text-sm text-pl-text hover:bg-pl-sunken/60 cursor-pointer items-center"
                                    onClick={() => onSelectProject(project.id)}
                                >
                                    <div className="col-span-4 font-medium text-pl-text">{project.name}</div>
                                    <div className="col-span-2">{project.stage}</div>
                                    <div className="col-span-2"><StatusBadge status={project.status} /></div>
                                    <div className="col-span-2 text-right font-pl-mono tabular-nums">${((project.baseline_budget || 0) / 1000000).toFixed(1)}M</div>
                                    <div className="col-span-2 text-right font-pl-mono tabular-nums">{project.percent_complete || 0}%</div>
                                </div>
                            ))}
                        </div>
                        </div>
                    </div>
                )}
                
                {filteredProjects.length === 0 && (
                    <div className="text-center py-20 text-pl-muted">
                        No projects found matching your filters.
                    </div>
                )}
            </TabsContent>

            <TabsContent value="analytics" className="mt-0 flex-1 overflow-hidden">
                <PortfolioAnalyticsDashboard projects={filteredProjects} />
            </TabsContent>
        </Tabs>
    </div>
  );
};

export default PortfolioDashboard;