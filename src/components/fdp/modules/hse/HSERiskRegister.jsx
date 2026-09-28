import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2 } from 'lucide-react';
import { calculateRiskScore, getRiskLevel } from '@/data/fdp/HSEModel';

const HSERiskRegister = ({ risks, onEdit, onDelete }) => {
    if (!risks || risks.length === 0) {
        return <div className="text-center py-8 text-pl-muted">No risks identified yet.</div>;
    }

    return (
        <Card>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-pl-sunken">
                            <TableRow className="border-pl-border">
                                <TableHead>Hazard / Risk</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-center">Prob.</TableHead>
                                <TableHead className="text-center">Imp.</TableHead>
                                <TableHead className="text-center">Score</TableHead>
                                <TableHead>Mitigation</TableHead>
                                <TableHead className="text-right w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {risks.map((risk) => {
                                // EC6-1: the register and this tab band the same score the
                                // same way now, and an unassessed hazard is not a low one.
                                const score = calculateRiskScore(risk);
                                const level = getRiskLevel(score);
                                const badgeColor = level === 'Critical' ? 'bg-pl-danger text-pl-danger-fg border-pl-danger'
                                    : level === 'High' ? 'bg-pl-danger-bg text-pl-danger-text border-pl-danger/40'
                                        : level === 'Medium' ? 'bg-pl-warning-bg text-pl-warning-text border-pl-warning/40'
                                            : level === 'Unscored' ? 'bg-pl-sunken text-pl-muted border-pl-border'
                                                : 'bg-pl-success-bg text-pl-success-text border-pl-success/40';

                                return (
                                    <TableRow key={risk.id} className="border-pl-border hover:bg-pl-sunken/60">
                                        <TableCell className="font-medium text-pl-text">
                                            <div>{risk.name}</div>
                                            <div className="text-xs text-pl-muted">{risk.status}</div>
                                        </TableCell>
                                        <TableCell className="text-pl-muted">{risk.type}</TableCell>
                                        <TableCell className="text-center font-pl-mono tabular-nums text-pl-text">{risk.probability}</TableCell>
                                        <TableCell className="text-center font-pl-mono tabular-nums text-pl-text">{risk.impact}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className={`${badgeColor} font-pl-mono tabular-nums`}>
                                                {score === null ? 'n/a' : score}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-pl-muted text-sm max-w-[250px] truncate">
                                            {risk.mitigation}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-text" onClick={() => onEdit(risk)}>
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" onClick={() => onDelete(risk.id)}>
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