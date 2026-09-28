import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { getRiskLevel, riskScore } from '@/data/fdp/RiskManagementModel';

// Design system rollout 6B: the score takes the status role of its band.
// The band itself still comes from getRiskLevel; only its colour is local.
const LEVEL_TEXT = {
    Critical: 'text-pl-danger-text',
    High: 'text-pl-danger-text',
    Medium: 'text-pl-warning-text',
    Low: 'text-pl-success-text',
    Unscored: 'text-pl-muted',
};

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
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" />
                    <Input 
                        placeholder="Search risks..." 
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-48">
                    <Select value={filterSource} onValueChange={setFilterSource}>
                        <SelectTrigger>
                            <div className="flex items-center text-pl-muted">
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

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-pl-sunken">
                                <TableRow className="border-pl-border">
                                    <TableHead>Risk Name</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead className="text-center">Score</TableHead>
                                    <TableHead>Mitigation Strategy</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRisks.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-pl-muted py-8">
                                            No risks found matching criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRisks.map((risk) => {
                                        // EC6-1: an unscored risk shows as unscored. This
                                        // multiplied without coercion, so a risk missing a
                                        // factor printed NaN and banded as Low.
                                        const score = riskScore(risk);
                                        const { level } = score === null
                                            ? { level: 'Unscored' }
                                            : getRiskLevel(score);
                                        const text = LEVEL_TEXT[level] || 'text-pl-text';

                                        return (
                                            <TableRow key={risk.id} className="border-pl-border hover:bg-pl-sunken/60">
                                                <TableCell className="font-medium text-pl-text max-w-[200px] truncate" title={risk.name}>
                                                    {risk.name}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="neutral">
                                                        {risk.source}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-pl-muted">{risk.category}</TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className={`text-sm font-bold font-pl-mono tabular-nums ${text}`}>{score === null ? 'n/a' : score}</span>
                                                        <span className="text-[10px] text-pl-muted uppercase">{level}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-pl-muted text-sm max-w-[250px] truncate" title={risk.mitigationStrategy || risk.mitigation}>
                                                    {/* EC6-1: the form saves `mitigation` and this read
                                                        `mitigationStrategy`, so every mitigation typed
                                                        into the app showed as "-". */}
                                                    {risk.mitigationStrategy || risk.mitigation || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`px-2 py-1 rounded-full text-xs border ${
                                                        risk.status === 'Closed' ? 'bg-pl-sunken text-pl-muted border-pl-border' :
                                                        risk.status === 'Mitigated' ? 'bg-pl-success-bg text-pl-success-text border-pl-success/40' :
                                                        'bg-pl-info-bg text-pl-info-text border-pl-info/40'
                                                    }`}>
                                                        {risk.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        {risk.source === 'Risk Register' ? (
                                                            <>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" onClick={() => onEdit(risk)}>
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" onClick={() => onDelete(risk.id)}>
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Button variant="ghost" size="sm" className="text-xs h-7 text-pl-muted hover:text-pl-primary-text">
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