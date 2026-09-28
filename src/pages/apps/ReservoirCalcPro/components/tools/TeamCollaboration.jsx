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
            <h2 className="text-xl font-bold text-pl-text flex items-center gap-2"><Users className="w-5 h-5 text-pl-muted" /> Collaboration &amp; Handoff</h2>

            {/* Identity */}
            <Card>
                <CardContent className="p-4 flex items-center gap-3">
                    <Avatar><AvatarFallback className="bg-pl-sunken text-pl-text">{initials}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-pl-text truncate">{email}</div>
                        <div className="text-xs text-pl-muted">{user ? 'Signed in' : 'Sign in to save & share projects'}</div>
                    </div>
                    {user && <Badge variant="success" className="text-[10px]">Active</Badge>}
                </CardContent>
            </Card>

            {/* Share current workspace */}
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-pl-text text-sm flex items-center gap-2"><Share2 className="w-4 h-4 text-pl-muted" /> Share this workspace</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-xs text-pl-muted">
                        Export the current model as a self-contained file — it carries the inputs, imported surfaces, AOIs,
                        deterministic &amp; Monte Carlo results, and the full audit trail. A colleague imports it from the
                        <span className="text-pl-text"> Projects</span> panel to continue exactly where you left off.
                    </p>
                    <Button size="sm" className="gap-2" onClick={shareWorkspace}>
                        <Download className="w-4 h-4" /> Export workspace file
                    </Button>
                </CardContent>
            </Card>

            {/* Saved projects */}
            <Card className="flex-1">
                <CardHeader className="pb-2"><CardTitle className="text-pl-text text-sm flex items-center gap-2"><FolderOpen className="w-4 h-4 text-pl-muted" /> Your projects ({projects.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {projects.length === 0 ? (
                        <div className="p-4 text-center text-xs text-pl-muted italic">No saved projects yet. Save one to share it.</div>
                    ) : projects.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 px-4 py-2 border-t border-pl-border text-xs">
                            <div className="flex-1 min-w-0">
                                <div className="text-pl-text truncate">{p.name}</div>
                                <div className="text-pl-muted font-mono">v{p.version} · {new Date(p.updated_at || p.created_at).toLocaleDateString()}</div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-pl-primary-text hover:text-pl-primary-text-hover gap-1" onClick={() => ProjectService.exportToJSON(p)}>
                                <Download className="w-3.5 h-3.5" /> Export
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="flex items-start gap-2 text-[11px] text-pl-muted bg-pl-surface border border-pl-border rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-pl-muted" />
                <span>Live multi-user editing and in-app sharing aren&apos;t enabled yet: they require a project-sharing service. Until then, exporting/importing project files is the supported way to collaborate, and it transfers the complete model.</span>
            </div>
        </div>
    );
};

export default TeamCollaboration;
