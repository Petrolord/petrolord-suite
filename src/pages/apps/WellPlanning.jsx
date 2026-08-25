import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, ChevronLeft, List, Waypoints, Shield, DollarSign, 
  FileText, BarChart2, Layers, Trash2, AlertTriangle, Home, ChevronRight, 
  Save, Clock, Settings, Briefcase, Search, Layout, ChevronDown, 
  MoreVertical, Info, Map as MapIcon, Database, Activity, FolderPlus, History, ClipboardList
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// Import Tab Contents
import TargetsTab from './well-planning/tabs/TargetsTab';
import TrajectoryTab from './well-planning/tabs/TrajectoryTab';
import AntiCollisionTab from './well-planning/tabs/AntiCollisionTab';
import CasingCementTab from './well-planning/tabs/CasingCementTab';
import CostingTab from './well-planning/tabs/CostingTab';
import ReportsTab from './well-planning/tabs/ReportsTab';
import AnalysisTab from './well-planning/tabs/AnalysisTab';
import { WellPlanningProvider, useWellPlanning } from './well-planning/contexts/WellPlanningContext';

// --- Sub-Components ---

const StatusBadge = ({ status }) => {
  const styles = {
    'Planning': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'Approved': 'bg-green-500/10 text-green-400 border-green-500/20',
    'Drilling': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    'Abandoned': 'bg-red-500/10 text-red-400 border-red-500/20',
    'Completed': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  
  const defaultStyle = 'bg-slate-500/10 text-slate-400 border-slate-500/20';

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border flex items-center", styles[status] || defaultStyle)}>
      <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", status === 'Drilling' ? 'animate-pulse bg-current' : 'bg-current')}></div>
      {status || 'Draft'}
    </span>
  );
};

const ProjectSummaryDrawer = ({ isOpen, project, wellCount, onToggle }) => {
  if (!isOpen) return null;
  
  return (
    <motion.div 
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="bg-slate-800/50 border-b border-slate-800 overflow-hidden"
    >
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-sm font-medium text-slate-400">Project Overview</h3>
            <p className="text-white font-semibold text-lg">{project?.name || 'No Project Selected'}</p>
          </div>
          <Badge variant="outline" className="border-slate-600 text-slate-300">
            {project?.status || 'Active'}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
            <span className="text-slate-500 block text-xs">Total Wells</span>
            <span className="text-white font-mono">{wellCount}</span>
          </div>
          <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
            <span className="text-slate-500 block text-xs">Est. Budget</span>
            <span className="text-emerald-400 font-mono">$ --</span>
          </div>
        </div>
        
        <p className="text-xs text-slate-500 line-clamp-2">
          {project?.description || "No description provided for this project."}
        </p>
      </div>
    </motion.div>
  );
};

const WellListSidebar = ({ wells, currentWellId, onSelectWell, onNewWell, isOpen, onToggle }) => {
  return (
    <motion.div 
      className={cn(
        "flex flex-col border-r border-slate-800 bg-slate-900 h-full transition-all duration-300",
        isOpen ? "w-64" : "w-14"
      )}
    >
      <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0 h-14">
        {isOpen && <span className="font-semibold text-slate-200">Wells</span>}
        <Button variant="ghost" size="icon" onClick={onToggle} className="ml-auto h-8 w-8 text-slate-400 hover:text-white">
          <Layout className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {wells.map(well => (
            <button
              key={well.id}
              onClick={() => onSelectWell(well.id)}
              className={cn(
                "w-full flex items-center rounded-md px-2 py-2 text-sm transition-colors group relative",
                currentWellId === well.id 
                  ? "bg-[#4CAF50]/10 text-[#4CAF50] border border-[#4CAF50]/20" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent"
              )}
            >
              <div className={cn("w-2 h-2 rounded-full mr-3 shrink-0", 
                well.status === 'Drilling' ? 'bg-orange-500' : 
                well.status === 'Approved' ? 'bg-green-500' : 
                'bg-slate-600'
              )} />
              
              {isOpen ? (
                <div className="flex flex-col items-start truncate">
                  <span className="font-medium truncate w-full text-left">{well.name}</span>
                  <span className="text-[10px] opacity-70 truncate w-full text-left">{well.well_type || 'Vertical'}</span>
                </div>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute inset-0" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{well.name}</p>
                      <p className="text-xs text-slate-400">{well.status}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </button>
          ))}
          
          {wells.length === 0 && isOpen && (
            <div className="text-center py-8 px-4 text-slate-500 text-xs">
              No wells found in this project.
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-slate-800 shrink-0">
        {isOpen ? (
          <Button onClick={onNewWell} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
            <PlusCircle className="mr-2 h-4 w-4" /> New Well
          </Button>
        ) : (
          <Button onClick={onNewWell} size="icon" variant="ghost" className="w-full h-10 text-slate-400 hover:text-white">
            <PlusCircle className="h-5 w-5" />
          </Button>
        )}
      </div>
    </motion.div>
  );
};

const ContextPanel = ({ well, isOpen, onToggle }) => {
  if (!isOpen) return (
    <div className="w-8 border-l border-slate-800 bg-slate-900 h-full flex flex-col items-center py-4 space-y-4">
      <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8 text-slate-400 hover:text-white">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="h-px w-4 bg-slate-800" />
      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" title="Properties">
        <Info className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" title="Map">
        <MapIcon className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <motion.div 
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 300, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      className="border-l border-slate-800 bg-slate-900 h-full flex flex-col shrink-0"
    >
      <div className="p-3 border-b border-slate-800 flex items-center justify-between h-14">
        <span className="font-semibold text-slate-200">Properties</span>
        <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8 text-slate-400 hover:text-white">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {well ? (
            <>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wider">Well Name</Label>
                  <p className="text-sm font-medium text-white mt-1">{well.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wider">Status</Label>
                  <div className="mt-1"><StatusBadge status={well.status} /></div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wider">Coordinates</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="bg-slate-800 p-2 rounded text-xs border border-slate-700">
                      <span className="text-slate-500 mr-2">X:</span>
                      <span className="font-mono text-slate-300">--</span>
                    </div>
                    <div className="bg-slate-800 p-2 rounded text-xs border border-slate-700">
                      <span className="text-slate-500 mr-2">Y:</span>
                      <span className="font-mono text-slate-300">--</span>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wider">Configuration</Label>
                  <div className="mt-1 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Type</span>
                      <span className="text-slate-200">{well.well_type || 'Vertical'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Unit</span>
                      <span className="text-slate-200 capitalize">{well.depth_unit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">CRS</span>
                      <span className="text-slate-200 truncate max-w-[150px]">{well.crs || 'WGS 84'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-700" />

              <div className="space-y-3">
                <Label className="text-xs text-slate-500 uppercase tracking-wider">Integrations</Label>
                <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 h-9">
                  <Database className="w-3 h-3 mr-2 text-blue-400" />
                  PPFG Envelope
                </Button>
                <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 h-9">
                  <Layers className="w-3 h-3 mr-2 text-orange-400" />
                  Casing Design
                </Button>
                <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 h-9">
                  <DollarSign className="w-3 h-3 mr-2 text-emerald-400" />
                  AFE Estimation
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center text-slate-500 text-sm py-10">
              Select a well to view properties
            </div>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
};

// --- Main App Component ---

const WellPlanningContent = () => {
  const { user } = useAuth();
  const { wellId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // State
  const [projects, setProjects] = useState([]);
  const [wells, setWells] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentWell, setCurrentWell] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [isNewWellOpen, setIsNewWellOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isSaveVersionOpen, setIsSaveVersionOpen] = useState(false);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);
  
  // Form States
  const [newWellName, setNewWellName] = useState('');
  const [newWellDepthUnit, setNewWellDepthUnit] = useState('feet');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [versionNote, setVersionNote] = useState('');

  // Initial Data Fetch
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      
      try {
        // 1. Fetch Projects
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
          
        if (projectsError) throw projectsError;
        setProjects(projectsData || []);

        // 2. Fetch Wells
        const { data: wellsData, error: wellsError } = await supabase
          .from('wells')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (wellsError) throw wellsError;
        setWells(wellsData || []);

        // 3. Logic to set Current Well/Project
        if (wellId) {
          const foundWell = wellsData.find(w => w.id === wellId);
          if (foundWell) {
            setCurrentWell(foundWell);
            if (foundWell.project_id) {
              const linkedProject = projectsData.find(p => p.id === foundWell.project_id);
              setCurrentProject(linkedProject || null);
            }
          }
        } else if (wellsData.length > 0) {
          // Default to first well if none selected
          // navigate(`/dashboard/apps/drilling/well-planning/${wellsData[0].id}`, { replace: true });
        }

      } catch (error) {
        console.error("Data loading error:", error);
        toast({ variant: "destructive", title: "Error loading data", description: error.message });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, wellId, toast, navigate]);

  // Derived State
  const projectWells = useMemo(() => {
    if (!currentProject) return wells.filter(w => !w.project_id); // Unassigned wells
    return wells.filter(w => w.project_id === currentProject.id);
  }, [wells, currentProject]);

  // Handlers
  const handleProjectChange = (projectId) => {
    if (projectId === 'all') {
      setCurrentProject(null);
      return;
    }
    const project = projects.find(p => p.id === projectId);
    setCurrentProject(project);
    // Optionally auto-select first well in project
    const firstWell = wells.find(w => w.project_id === projectId);
    if (firstWell) {
        navigate(`/dashboard/apps/drilling/well-planning/${firstWell.id}`);
    } else {
        // Clear current well if project has no wells
        setCurrentWell(null);
        navigate(`/dashboard/apps/drilling/well-planning`);
    }
  };

  const handleWellChange = (wellId) => {
    navigate(`/dashboard/apps/drilling/well-planning/${wellId}`);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !user) return;
    try {
        const { data, error } = await supabase
            .from('projects')
            .insert({ name: newProjectName, description: newProjectDesc, user_id: user.id, status: 'Active' })
            .select()
            .single();
        
        if (error) throw error;
        
        setProjects([data, ...projects]);
        setCurrentProject(data);
        setIsNewProjectOpen(false);
        setNewProjectName('');
        setNewProjectDesc('');
        toast({ title: "Project Created", className: "bg-[#4CAF50] text-white" });
    } catch (error) {
        toast({ variant: "destructive", title: "Failed to create project", description: error.message });
    }
  };

  const handleCreateWell = async () => {
    if (!newWellName.trim() || !user) return;
    try {
        const payload = { 
            name: newWellName, 
            user_id: user.id, 
            depth_unit: newWellDepthUnit,
            project_id: currentProject?.id || null,
            status: 'Planning'
        };

        const { data, error } = await supabase
            .from('wells')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

        setWells([data, ...wells]);
        navigate(`/dashboard/apps/drilling/well-planning/${data.id}`);
        setIsNewWellOpen(false);
        setNewWellName('');
        toast({ title: "Well Created", className: "bg-[#4CAF50] text-white" });
    } catch (error) {
        toast({ variant: "destructive", title: "Failed to create well", description: error.message });
    }
  };

  // Mock save version handler - in real app, call context method that writes to DB
  const handleSaveVersion = async () => {
      setIsSaveVersionOpen(false);
      // Here we would call context.saveVersion(versionNote)
      // For demo, just toast
      toast({ 
          title: "Version Saved", 
          description: `Snapshot created: ${versionNote || 'No description'}`,
          className: "bg-[#4CAF50] text-white border-none"
      });
      setVersionNote('');
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#4CAF50]"></div>
          <p className="text-slate-400 font-medium">Loading Well Design Studio...</p>
        </div>
      </div>
    );
  }

  return (
    <WellPlanningProvider wellId={currentWell?.id}>
      <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
        
        {/* LEFT SIDEBAR */}
        <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 shrink-0 z-20">
            {/* Project Summary Header (Inside Sidebar) */}
            <div className={cn("p-4 border-b border-slate-800 transition-all duration-300", sidebarOpen ? "w-64" : "w-14 px-2")}>
                {sidebarOpen ? (
                    <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <div className="bg-gradient-to-br from-[#FFC107] to-[#FFA000] p-1.5 rounded-lg shadow-lg shadow-orange-900/20">
                                <Waypoints className="h-5 w-5 text-slate-900" />
                            </div>
                            <div>
                                <h1 className="font-bold text-sm leading-tight text-white">Well Design Studio</h1>
                                <p className="text-[10px] text-slate-500">v4.2.0 Enterprise</p>
                            </div>
                        </div>
                        
                        <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-slate-400 uppercase">Project</span>
                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => setIsNewProjectOpen(true)}>
                                    <PlusCircle className="h-3 w-3 text-[#4CAF50]" />
                                </Button>
                            </div>
                            <Select value={currentProject?.id || 'all'} onValueChange={handleProjectChange}>
                                <SelectTrigger className="h-8 text-xs bg-slate-900 border-slate-700 focus:ring-0">
                                    <SelectValue placeholder="Select Project" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                    <SelectItem value="all">Unassigned / All</SelectItem>
                                    {projects.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            
                            {currentProject && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-[10px] text-slate-500 block">Wells</span>
                                        <span className="text-sm font-mono">{projectWells.length}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-500 block">Cost</span>
                                        <span className="text-sm font-mono text-emerald-400">$ --</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center space-y-4 pt-2">
                        <div className="bg-gradient-to-br from-[#FFC107] to-[#FFA000] p-1.5 rounded-lg">
                            <Waypoints className="h-5 w-5 text-slate-900" />
                        </div>
                    </div>
                )}
            </div>

            {/* Well List */}
            <WellListSidebar 
                wells={projectWells} 
                currentWellId={currentWell?.id} 
                onSelectWell={handleWellChange} 
                onNewWell={() => setIsNewWellOpen(true)}
                isOpen={sidebarOpen}
                onToggle={() => setSidebarOpen(!sidebarOpen)}
            />
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
            
            {/* TOP HEADER */}
            <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-10">
                <div className="flex items-center space-x-4">
                    {/* Breadcrumbs */}
                    <nav className="flex items-center text-xs text-slate-500">
                        <Link to="/dashboard" className="hover:text-white transition-colors"><Home className="w-3 h-3" /></Link>
                        <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
                        <Link to="/dashboard/drilling" className="hover:text-white transition-colors">Drilling</Link>
                        <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
                        <span className="text-[#4CAF50] font-medium">Well Design Studio</span>
                    </nav>
                    
                    <div className="h-4 w-px bg-slate-700 mx-2" />
                    
                    {/* Current Context Display */}
                    {currentWell ? (
                        <div className="flex items-center space-x-3">
                            <h2 className="text-sm font-bold text-white flex items-center">
                                {currentWell.name}
                            </h2>
                            <StatusBadge status={currentWell.status} />
                        </div>
                    ) : (
                        <span className="text-sm text-slate-400 italic">No well selected</span>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                    <ContextSaveIndicator />
                    
                    <div className="h-4 w-px bg-slate-700 mx-2" />
                    
                    {/* History / Audit Log Trigger */}
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 text-slate-400 hover:text-white hover:bg-slate-800">
                                <ClipboardList className="w-4 h-4 mr-1.5" /> History
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="bg-slate-900 border-slate-800 text-white w-[400px]">
                            <SheetHeader>
                                <SheetTitle className="text-white">Audit Log</SheetTitle>
                            </SheetHeader>
                            <div className="py-6">
                                <p className="text-sm text-slate-400">Recent activities for this project.</p>
                                <div className="mt-4 space-y-4">
                                    {/* Mock Audit Log Items */}
                                    {[1,2,3].map(i => (
                                        <div key={i} className="flex gap-3 text-sm">
                                            <div className="mt-1 w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                                            <div>
                                                <p className="text-slate-200">Trajectory updated by {user?.email}</p>
                                                <p className="text-xs text-slate-500">Today, 10:{30+i} AM</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>

                    <Button onClick={() => setIsSaveVersionOpen(true)} size="sm" className="h-8 bg-[#4CAF50] hover:bg-[#43a047] text-white font-semibold shadow-lg shadow-green-900/20">
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        Save Version
                    </Button>
                </div>
            </header>

            {/* WORKSPACE */}
            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-0 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                    {currentWell ? (
                        <Tabs defaultValue="targets" className="w-full flex flex-col h-full">
                            <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 pt-2">
                                <TabsList className="bg-transparent h-12 w-full justify-start space-x-6 p-0">
                                    {[
                                      { id: 'targets', label: 'Targets', icon: Waypoints },
                                      { id: 'trajectory', label: 'Trajectory', icon: List },
                                      { id: 'anti-collision', label: 'Anti-Collision', icon: Shield },
                                      { id: 'casing-cement', label: 'Casing/Cement', icon: Layers },
                                      { id: 'costing', label: 'Costing', icon: DollarSign },
                                      { id: 'analysis', label: 'Analysis', icon: BarChart2 },
                                      { id: 'reports', label: 'Reports', icon: FileText },
                                    ].map(tab => (
                                        <TabsTrigger 
                                            key={tab.id} 
                                            value={tab.id}
                                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#4CAF50] data-[state=active]:text-[#4CAF50] text-slate-400 hover:text-white rounded-none h-full px-2 transition-all"
                                        >
                                            <tab.icon className="w-4 h-4 mr-2" />
                                            {tab.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </div>

                            <div className="p-6 pb-20">
                                <TabsContent value="targets" className="mt-0 outline-none"><TargetsTab wellId={currentWell.id} depthUnit={currentWell.depth_unit} crs={currentWell.crs} /></TabsContent>
                                <TabsContent value="trajectory" className="mt-0 outline-none"><TrajectoryTab wellId={currentWell.id} user={user} /></TabsContent>
                                <TabsContent value="anti-collision" className="mt-0 outline-none"><AntiCollisionTab wellId={currentWell.id} user={user} /></TabsContent>
                                <TabsContent value="casing-cement" className="mt-0 outline-none"><CasingCementTab wellId={currentWell.id} user={user} /></TabsContent>
                                <TabsContent value="costing" className="mt-0 outline-none"><CostingTab wellId={currentWell.id} user={user} /></TabsContent>
                                <TabsContent value="analysis" className="mt-0 outline-none"><AnalysisTab wellId={currentWell.id} user={user} /></TabsContent>
                                <TabsContent value="reports" className="mt-0 outline-none"><ReportsTab wellId={currentWell.id} user={user} /></TabsContent>
                            </div>
                        </Tabs>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <div className="bg-slate-900 p-6 rounded-full mb-6 border border-slate-800">
                                <Waypoints className="h-16 w-16 text-[#FFC107] opacity-50" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Select a Well to Begin</h2>
                            <p className="max-w-md text-center mb-8">Choose an existing well from the sidebar or create a new one to start planning your trajectory.</p>
                            <Button onClick={() => setIsNewWellOpen(true)} className="bg-[#4CAF50] hover:bg-[#43a047] text-white">
                                <PlusCircle className="mr-2 h-5 w-5" /> Create New Well
                            </Button>
                        </div>
                    )}
                </div>

                {/* RIGHT CONTEXT PANEL */}
                <ContextPanel 
                    well={currentWell} 
                    isOpen={contextPanelOpen} 
                    onToggle={() => setContextPanelOpen(!contextPanelOpen)} 
                />
            </div>
        </div>

        {/* DIALOGS */}
        
        {/* New Well Dialog */}
        <Dialog open={isNewWellOpen} onOpenChange={setIsNewWellOpen}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Well</DialogTitle>
                    <DialogDescription className="text-slate-400">Initialize a new wellbore planning project.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="project">Project</Label>
                        <Select 
                            value={currentProject?.id || 'none'} 
                            disabled={true} 
                        >
                            <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={currentProject?.id || 'none'}>{currentProject?.name || 'Unassigned'}</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="name">Well Name</Label>
                        <Input id="name" value={newWellName} onChange={e => setNewWellName(e.target.value)} className="bg-slate-800 border-slate-700" placeholder="e.g. Well-01" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="unit">Depth Unit</Label>
                        <Select value={newWellDepthUnit} onValueChange={setNewWellDepthUnit}>
                            <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                <SelectItem value="feet">Feet (ft)</SelectItem>
                                <SelectItem value="meters">Meters (m)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsNewWellOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateWell} className="bg-[#4CAF50] text-white hover:bg-[#43a047]">Create Well</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* New Project Dialog */}
        <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                    <DialogDescription className="text-slate-400">Group multiple wells under a single project entity.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="p-name">Project Name</Label>
                        <Input id="p-name" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="bg-slate-800 border-slate-700" placeholder="e.g. North Field Development" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="p-desc">Description</Label>
                        <Input id="p-desc" value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)} className="bg-slate-800 border-slate-700" placeholder="Optional description..." />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsNewProjectOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateProject} className="bg-[#4CAF50] text-white hover:bg-[#43a047]">Create Project</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Save Version Dialog */}
        <Dialog open={isSaveVersionOpen} onOpenChange={setIsSaveVersionOpen}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Save Project Version</DialogTitle>
                    <DialogDescription className="text-slate-400">Create a snapshot of the current plan.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="v-note">Version Note</Label>
                        <Textarea 
                            id="v-note" 
                            value={versionNote} 
                            onChange={e => setVersionNote(e.target.value)} 
                            className="bg-slate-800 border-slate-700 min-h-[80px]" 
                            placeholder="e.g. Initial Plan, Post-Review Update..." 
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsSaveVersionOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveVersion} className="bg-[#4CAF50] text-white hover:bg-[#43a047]">Save Version</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </WellPlanningProvider>
  );
};

// Helper component to access context
const ContextSaveIndicator = () => {
    const { lastSaved, hasUnsavedChanges } = useWellPlanning();
    
    if (hasUnsavedChanges) {
        return (
            <span className="flex items-center text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20">
                <AlertTriangle className="w-3 h-3 mr-1" /> Unsaved Changes
            </span>
        );
    }
    
    if (lastSaved) {
        return (
            <span className="flex items-center text-xs text-slate-500">
                <Clock className="w-3 h-3 mr-1" /> Saved {format(lastSaved, 'HH:mm')}
            </span>
        );
    }
    
    return null;
};

export default WellPlanningContent;