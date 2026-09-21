import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2 } from 'lucide-react';
import { calculateRiskScore, getRiskLevel } from '@/data/fdp/HSEModel';

const HSERiskRegister = ({ risks, onEdit, onDelete }) => {
    if (!risks || risks.length === 0) {
        return <div className="text-center py-8 text-slate-500">No risks identified yet.</div>;
    }

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-800/50">
                            <TableRow className="border-slate-800">
                                <TableHead className="text-slate-300">Hazard / Risk</TableHead>
                                <TableHead className="text-slate-300">Type</TableHead>
                                <TableHead className="text-center text-slate-300">Prob.</TableHead>
                                <TableHead className="text-center text-slate-300">Imp.</TableHead>
                                <TableHead className="text-center text-slate-300">Score</TableHead>
                                <TableHead className="text-slate-300">Mitigation</TableHead>
                                <TableHead className="text-right text-slate-300 w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {risks.map((risk) => {
                                // EC6-1: the register and this tab band the same score the
                                // same way now, and an unassessed hazard is not a low one.
                                const score = calculateRiskScore(risk);
                                const level = getRiskLevel(score);
                                const badgeColor = level === 'Critical' ? 'bg-red-950 text-red-100 border-red-700'
                                    : level === 'High' ? 'bg-red-900 text-red-200 border-red-800'
                                        : level === 'Medium' ? 'bg-yellow-900 text-yellow-200 border-yellow-800'
                                            : level === 'Unscored' ? 'bg-slate-800 text-slate-300 border-slate-700'
                                                : 'bg-green-900 text-green-200 border-green-800';

                                return (
                                    <TableRow key={risk.id} className="border-slate-800 hover:bg-slate-800/30">
                                        <TableCell className="font-medium text-white">
                                            <div>{risk.name}</div>
                                            <div className="text-xs text-slate-500">{risk.status}</div>
                                        </TableCell>
                                        <TableCell className="text-slate-400">{risk.type}</TableCell>
                                        <TableCell className="text-center text-slate-300">{risk.probability}</TableCell>
                                        <TableCell className="text-center text-slate-300">{risk.impact}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className={`${badgeColor} font-mono`}>
                                                {score === null ? 'n/a' : score}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-400 text-sm max-w-[250px] truncate">
                                            {risk.mitigation}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-white" onClick={() => onEdit(risk)}>
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-400" onClick={() => onDelete(risk.id)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default HSERiskRegister;