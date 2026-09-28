import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { getRiskLevel, riskScore } from '@/data/fdp/RiskManagementModel';

const RiskResponsePlanning = ({ risks }) => {
    // EC6-1: "needs a response" is High or Critical on the one scale. This
    // used to be its own threshold of 10, so a risk scored 10 or 11 was
    // listed here as critical while the register called it Medium.
    const needsResponse = (r) => {
        const score = riskScore(r);
        if (score === null) return false;
        const { level } = getRiskLevel(score);
        return level === 'High' || level === 'Critical';
    };
    const criticalRisks = risks
        .filter(needsResponse)
        .sort((a, b) => riskScore(b) - riskScore(a));
    const unscored = risks.filter((r) => riskScore(r) === null).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-2">
                <h3 className="text-lg font-semibold text-pl-text">Response Planning for Critical Risks</h3>
                <div className="text-sm text-pl-muted">
                    Showing {criticalRisks.length} High or Critical item{criticalRisks.length === 1 ? '' : 's'}
                    {unscored > 0 ? `, and ${unscored} risk${unscored === 1 ? '' : 's'} not yet scored` : ''}
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-pl-sunken">
                            <TableRow className="border-pl-border">
                                <TableHead className="w-[20%]">Risk Scenario</TableHead>
                                <TableHead className="w-[10%]">Strategy</TableHead>
                                <TableHead className="w-[30%]">Mitigation Plan (Preventative)</TableHead>
                                <TableHead className="w-[30%]">Contingency Plan (Reactive)</TableHead>
                                <TableHead className="w-[10%]">Owner</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {criticalRisks.map((risk) => (
                                <TableRow key={risk.id} className="border-pl-border hover:bg-pl-sunken/60">
                                    <TableCell className="font-medium text-pl-text align-top">
                                        <div>{risk.name}</div>
                                        <Badge variant="danger" className="mt-1 text-[10px] font-pl-mono tabular-nums">
                                            Score: {risk.probability * risk.impact}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <Badge variant="neutral">Mitigate</Badge>
                                    </TableCell>
                                    <TableCell className="text-pl-muted text-sm align-top">
                                        {/* EC6-1: the HSE form saves `mitigation`; the register
                                            reads `mitigationStrategy`, so everything typed on that
                                            form showed as "No preventative actions defined". The
                                            integration service normalises it now, and this reads
                                            both for a plan saved before that. */}
                                        {risk.mitigationStrategy || risk.mitigation
                                            || <span className="text-pl-muted italic">No preventative actions defined</span>}
                                    </TableCell>
                                    <TableCell className="text-pl-muted text-sm align-top">
                                        {risk.contingencyPlan || <span className="text-pl-muted italic">No contingency plan defined</span>}
                                    </TableCell>
                                    <TableCell className="text-pl-text text-sm align-top">
                                        {risk.owner}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {criticalRisks.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-pl-muted py-8">
                                        No critical risks identified requiring detailed response planning.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default RiskResponsePlanning;