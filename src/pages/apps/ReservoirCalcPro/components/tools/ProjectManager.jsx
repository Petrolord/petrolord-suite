import React, { useEffect, useState } from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { ProjectService } from '../../services/ProjectService';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    FolderOpen, Save, Trash2, Copy, FilePlus, Loader2, Calendar, 
    Search, Download, Upload, Clock, CheckCircle2, RefreshCw
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const ProjectManager = ({ onClose }) => {
    const { state, loadProjects, loadProject, createNewProject } = useReservoirCalc();
    const { user } = useAuth();
    const { toast } = useToast();

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState('updated_desc');
    const [selectedProject, setSelectedProject] = useState(null);
    const [view, setView] = useState('list'); // 'list' or 'details'

    // Initial Load
    useEffect(() => {
        loadProjects().then((r) => {
            if (r?.error) {
                toast({ variant: 'destructive', title: 'Could not load projects', description: r.error, duration: 8000 });
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Filtering & Sorting
    const filteredProjects = (state.projects || [])
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            const dateA = new Date(a.updated_at);
            const dateB = new Date(b.updated_at);
            if (sortOrder === 'updated_desc') return dateB - dateA;
            if (sortOrder === 'updated_asc') return dateA - dateB;
            if (sortOrder === 'name_asc') return a.name.localeCompare(b.name);
            return 0;
        });

    // Handlers
    const handleSelectProject = (project) => {
        setSelectedProject(project);
        setView('details');
    };

    const handleLoad = () => {
        if (selectedProject) {
            loadProject(selectedProject);
            toast({ title: "Project Loaded", description: `${selectedProject.name} is now active.` });
            if (onClose) onClose();
        }
    };

    const handleDelete = async () => {
        if (!selectedProject) return;
        if (window.confirm(`Are you sure you want to delete "${selectedProject.name}"? This action cannot be undone.`)) {
            try {
                await ProjectService.deleteProject(selectedProject.id);
                await loadProjects();
                setSelectedProject(null);
                setView('list');
                toast({ title: "Project Deleted", description: "The project has been removed." });
            } catch (e) {
                toast({ variant: "destructive", title: "Delete Failed", description: e.message });
            }
        }
    };

    const handleExport = () => {
        if (selectedProject) {
            ProjectService.exportToJSON(selectedProject);
            toast({ title: "Export Started", description: "Your project JSON is downloading." });
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await ProjectService.importFromJSON(file, user?.id);
            await loadProjects();
            toast({ title: "Import Successful", description: "Project added to your list." });
        } catch (err) {
            toast({ variant: "destructive", title: "Import Failed", description: err.message });
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-blue-400" />
                    <h2 className="font-bold text-white">Project Manager</h2>
                </div>
                <div className="flex gap-2">
                    <label>
                        <Input type="file" className="hidden" accept=".json" onChange={handleImport} />
                        <Button variant="outline" size="sm" className="gap-2 cursor-pointer h-8 text-xs">
                            <Upload className="w-3 h-3"/> Import
                        </Button>
                    </label>
                    <Button 
                        size="sm" 
                        className="gap-2 h-8 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                            if (window.confirm("Start a new project? Unsaved changes will be lost.")) {
                                createNewProject();
                                if (onClose) onClose();
                            }
                        }}
                    >
                        <FilePlus className="w-3 h-3"/> New
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT SIDEBAR: LIST */}
                <div className={`w-full md:w-1/3 border-r border-slate-800 flex flex-col ${view === 'details' ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/50">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-500" />
                            <Input 
                                placeholder="Search projects..." 
                                className="pl-8 h-9 bg-slate-950 border-slate-700 text-sm"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select value={sortOrder} onValueChange={setSortOrder}>
                            <SelectTrigger className="h-8 text-xs bg-slate-950 border-slate-700">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="updated_desc">Newest First</SelectItem>
                                <SelectItem value="updated_asc">Oldest First</SelectItem>
                                <SelectItem value="name_asc">Name A-Z</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {filteredProjects.length === 0 && (
                                <div className="text-center p-4 text-slate-500 text-sm">
                                    No projects found.
                                </div>
                            )}
                            {filteredProjects.map(p => (
                                <div 
                                    key={p.id}
                                    onClick={() => handleSelectProject(p)}
                                    className={`p-3 rounded-md cursor-pointer transition-colors text-left ${
                                        selectedProject?.id === p.id 
                                        ? 'bg-blue-900/20 border border-blue-500/30' 
                                        : 'hover:bg-slate-900 border border-transparent'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-medium text-sm text-slate-200 truncate pr-2">{p.name}</span>
                                        <Badge variant="secondary" className="text-[10px] h-4 px-1">v{p.version}</Badge>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-slate-500">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(p.updated_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* RIGHT CONTENT: DETAILS */}
                <div className={`flex-1 bg-slate-950 flex flex-col ${view === 'list' ? 'hidden md:flex' : 'flex'}`}>
                    {selectedProject ? (
                        <div className="flex-1 flex flex-col h-full">
                             {/* Mobile Back Button */}
                            <div className="md:hidden p-2 border-b border-slate-800">
                                <Button variant="ghost" size="sm" onClick={() => setView('list')}>← Back to List</Button>
                            </div>

                            <div className="p-6 flex-1 overflow-y-auto">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h1 className="text-2xl font-bold text-white mb-2">{selectedProject.name}</h1>
                                        <div className="flex gap-3 text-sm text-slate-400">
                                            <span className="flex items-center gap-1"><Clock className="w-4 h-4"/> Modified: {new Date(selectedProject.updated_at).toLocaleString()}</span>
                                            <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/> Created: {new Date(selectedProject.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <Badge className="bg-blue-600">Version {selectedProject.version}</Badge>
                                </div>

                                <div className="grid gap-6">
                                    <Card className="bg-slate-900 border-slate-800">
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm uppercase text-slate-500">Description</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-slate-300 text-sm leading-relaxed">
                                                {selectedProject.description || "No description provided."}
                                            </p>
                                        </CardContent>
                                    </Card>

                                    <div className="grid grid-cols-2 gap-4">
                                        <Card className="bg-slate-900 border-slate-800">
                                            <CardContent className="p-4">
                                                <div className="text-xs text-slate-500 uppercase mb-1">Fluid Type</div>
                                                <div className="font-medium capitalize">{selectedProject.inputs?.deterministic?.fluidType || 'Not set'}</div>
                                            </CardContent>
                                        </Card>
                                        <Card className="bg-slate-900 border-slate-800">
                                            <CardContent className="p-4">
                                                <div className="text-xs text-slate-500 uppercase mb-1">Assets</div>
                                                <div className="font-medium">
                                                    {selectedProject.inputs?.surfaces?.length || 0} Surfaces, {selectedProject.inputs?.polygons?.length || 0} Polygons
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-between items-center">
                                <div className="flex gap-2">
                                    <Button variant="destructive" size="sm" onClick={handleDelete}>
                                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleExport}>
                                        <Download className="w-4 h-4 mr-2" /> Export JSON
                                    </Button>
                                </div>
                                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleLoad}>
                                    Load Project
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                            <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4">
                                <FolderOpen className="w-8 h-8 opacity-50" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-300">No Project Selected</h3>
                            <p className="text-sm max-w-xs mx-auto mt-2">Select a project from the list to view details, load, or manage it.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectManager;