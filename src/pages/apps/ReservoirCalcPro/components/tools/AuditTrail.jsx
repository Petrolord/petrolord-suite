import React from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, Download, Trash2 } from 'lucide-react';

// Real audit trail — reads the event log recorded by the context as the user works
// (runs, saves, loads, surface imports, AOIs, map generation). Travels with the
// project, so a colleague who imports the project file inherits the full history.
const AuditTrail = () => {
    const { state, clearAudit } = useReservoirCalc();
    const { user } = useAuth();
    const logs = state.auditTrail || [];
    const who = user?.email || 'You';

    const exportCsv = () => {
        const rows = [['Timestamp', 'Action', 'Details', 'User']];
        logs.forEach((l) => rows.push([new Date(l.timestamp).toISOString(), l.action, l.details || '', who]));
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'reservoircalc_audit.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-orange-400" /> Audit Trail
                    <span className="text-xs font-normal text-slate-500">({logs.length})</span>
                </h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs border-slate-700" onClick={exportCsv} disabled={!logs.length}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs border-slate-700 text-red-400 hover:text-red-300" onClick={clearAudit} disabled={!logs.length}>
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear
                    </Button>
                </div>
            </div>

            <Card className="bg-slate-900 border-slate-800 flex-1 overflow-hidden flex flex-col">
                <CardContent className="flex-1 overflow-auto p-0">
                    <Table>
                        <TableHeader className="bg-slate-950 sticky top-0 z-10">
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="text-slate-300">Timestamp</TableHead>
                                <TableHead className="text-slate-300">Action</TableHead>
                                <TableHead className="text-slate-300">Details</TableHead>
                                <TableHead className="text-slate-300">User</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-slate-500 py-10">
                                        No activity yet — run a calculation, import a surface, or save the project.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log, i) => (
                                    <TableRow key={log.id || i} className="border-slate-800 hover:bg-slate-800/50">
                                        <TableCell className="text-slate-400 font-mono text-xs whitespace-nowrap">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-white font-medium whitespace-nowrap">{log.action}</TableCell>
                                        <TableCell className="text-slate-300">{log.details}</TableCell>
                                        <TableCell className="text-slate-400 truncate max-w-[160px]">{who}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default AuditTrail;
