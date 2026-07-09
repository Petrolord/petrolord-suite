import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Share2, Download, FolderOpen, Info, Users } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ProjectService } from '../../services/ProjectService';
import { useToast } from '@/components/ui/use-toast';

// Honest collaboration surface. Live multi-user editing needs a project-sharing
// backend that isn't deployed, so instead of fabricating team members this offers
// the collaboration that genuinely works today: exporting/importing the full
// project (inputs, surfaces, results, and audit history) as a handoff file.
const TeamCollaboration = () => {
    const { state, exportWorkspace, loadProjects } = useReservoirCalc();
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => { if (user && (state.projects || []).length === 0) loadProjects(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    const email = user?.email || 'Not signed in';
    const initials = (user?.email || '?').slice(0, 2).toUpperCase();
    const projects = state.projects || [];

    const shareWorkspace = () => {
        exportWorkspace();
        toast({ title: 'Workspace exported', description: 'Send the .json file to a colleague — they open it via Projects → Import.' });
    };

    return (
        <div className="h-full flex flex-col gap-4 overflow-y-auto">
            <h2 className="text-xl font-bold text-white flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" /> Collaboration &amp; Handoff</h2>

            {/* Identity */}
            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-4 flex items-center gap-3">
                    <Avatar><AvatarFallback className="bg-blue-900 text-blue-200">{initials}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{email}</div>
                        <div className="text-xs text-slate-500">{user ? 'Signed in' : 'Sign in to save & share projects'}</div>
                    </div>
                    {user && <Badge variant="outline" className="text-[10px] border-emerald-800 text-emerald-400">Active</Badge>}
                </CardContent>
            </Card>

            {/* Share current workspace */}
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2"><CardTitle className="text-white text-sm flex items-center gap-2"><Share2 className="w-4 h-4 text-purple-400" /> Share this workspace</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-xs text-slate-400">
                        Export the current model as a self-contained file — it carries the inputs, imported surfaces, AOIs,
                        deterministic &amp; Monte Carlo results, and the full audit trail. A colleague imports it from the
                        <span className="text-slate-300"> Projects</span> panel to continue exactly where you left off.
                    </p>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-2" onClick={shareWorkspace}>
                        <Download className="w-4 h-4" /> Export workspace file
                    </Button>
                </CardContent>
            </Card>

            {/* Saved projects */}
            <Card className="bg-slate-900 border-slate-800 flex-1">
                <CardHeader className="pb-2"><CardTitle className="text-white text-sm flex items-center gap-2"><FolderOpen className="w-4 h-4 text-amber-400" /> Your projects ({projects.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {projects.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 italic">No saved projects yet — save one to share it.</div>
                    ) : projects.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 px-4 py-2 border-t border-slate-800 text-xs">
                            <div className="flex-1 min-w-0">
                                <div className="text-slate-200 truncate">{p.name}</div>
                                <div className="text-slate-500 font-mono">v{p.version} · {new Date(p.updated_at || p.created_at).toLocaleDateString()}</div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-blue-400 hover:text-blue-300 gap-1" onClick={() => ProjectService.exportToJSON(p)}>
                                <Download className="w-3.5 h-3.5" /> Export
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-500" />
                <span>Live multi-user editing and in-app sharing aren&apos;t enabled yet — they require a project-sharing service. Until then, exporting/importing project files is the supported way to collaborate, and it transfers the complete model.</span>
            </div>
        </div>
    );
};

export default TeamCollaboration;
