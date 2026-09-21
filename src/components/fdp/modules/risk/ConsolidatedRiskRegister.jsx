import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { getRiskLevel, riskScore } from '@/data/fdp/RiskManagementModel';

const ConsolidatedRiskRegister = ({ risks, onEdit, onDelete }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSource, setFilterSource] = useState('All');

    const filteredRisks = risks.filter(risk => {
        const matchesSearch = risk.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              risk.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSource = filterSource === 'All' || risk.source === filterSource;
        return matchesSearch && matchesSource;
    });

    const sources = ['All', ...new Set(risks.map(r => r.source))];

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Search risks..." 
                        className="pl-8 bg-slate-900 border-slate-800"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-48">
                    <Select value={filterSource} onValueChange={setFilterSource}>
                        <SelectTrigger className="bg-slate-900 border-slate-800">
                            <div className="flex items-center text-slate-400">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Filter Source" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-800/50">
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-300">Risk Name</TableHead>
                                    <TableHead className="text-slate-300">Source</TableHead>
                                    <TableHead className="text-slate-300">Category</TableHead>
                                    <TableHead className="text-center text-slate-300">Score</TableHead>
                                    <TableHead className="text-slate-300">Mitigation Strategy</TableHead>
                                    <TableHead className="text-slate-300">Status</TableHead>
                                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRisks.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                                            No risks found matching criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRisks.map((risk) => {
                                        // EC6-1: an unscored risk shows as unscored. This
                                        // multiplied without coercion, so a risk missing a
                                        // factor printed NaN and banded as Low.
                                        const score = riskScore(risk);
                                        const { level, text } = score === null
                                            ? { level: 'Unscored', text: 'text-slate-400' }
                                            : getRiskLevel(score);

                                        return (
                                            <TableRow key={risk.id} className="border-slate-800 hover:bg-slate-800/30">
                                                <TableCell className="font-medium text-white max-w-[200px] truncate" title={risk.name}>
                                                    {risk.name}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="bg-slate-800 text-slate-400 border-slate-700">
                                                        {risk.source}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-slate-400">{risk.category}</TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className={`text-sm font-bold ${text}`}>{score === null ? 'n/a' : score}</span>
                                                        <span className="text-[10px] text-slate-500 uppercase">{level}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-slate-400 text-sm max-w-[250px] truncate" title={risk.mitigationStrategy || risk.mitigation}>
                                                    {/* EC6-1: the form saves `mitigation` and this read
                                                        `mitigationStrategy`, so every mitigation typed
                                                        into the app showed as "-". */}
                                                    {risk.mitigationStrategy || risk.mitigation || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`px-2 py-1 rounded-full text-xs border ${
                                                        risk.status === 'Closed' ? 'bg-slate-800 text-slate-500 border-slate-700' :
                                                        risk.status === 'Mitigated' ? 'bg-green-900/30 text-green-400 border-green-900' :
                                                        'bg-blue-900/30 text-blue-400 border-blue-900'
                                                    }`}>
                                                        {risk.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        {risk.source === 'Risk Register' ? (
                                                            <>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-white" onClick={() => onEdit(risk)}>
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-400" onClick={() => onDelete(risk.id)}>
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Button variant="ghost" size="sm" className="text-xs h-7 text-slate-500 hover:text-blue-400">
                                                                <ExternalLink className="w-3 h-3 mr-1" /> View
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ConsolidatedRiskRegister;