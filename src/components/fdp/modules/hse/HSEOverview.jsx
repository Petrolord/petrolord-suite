import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { calculateRiskMatrix, calculateComplianceScore } from '@/utils/fdp/hseCalculations';

// Design system rollout 6B: the icon takes a status role only where the
// tile reports a status; the other icons are neutral.
const ICON_TONE = {
    danger: 'bg-pl-danger-bg text-pl-danger-text',
    neutral: 'bg-pl-sunken text-pl-muted',
};

const StatCard = ({ title, value, subtitle, icon: Icon, tone = 'neutral' }) => (
    <Card>
        <CardContent className="p-6">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-pl-muted uppercase tracking-wider">{title}</p>
                    <h3 className="text-3xl font-bold text-pl-text mt-2">{value}</h3>
                    {subtitle && <p className="text-xs text-pl-muted mt-1">{subtitle}</p>}
                </div>
                <div className={`p-3 rounded-lg ${ICON_TONE[tone]}`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
        </CardContent>
    </Card>
);

const HSEOverview = ({ data }) => {
    const { hazards = [], kpis = [], safetySystem, compliance = [] } = data;
    const matrix = calculateRiskMatrix(hazards);
    const checklist = Array.isArray(compliance) ? compliance : [];
    const complianceScore = calculateComplianceScore(checklist);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* EC6-1: the register's own bands. This tile banded on 15 and 8
                with no Critical band at all, so a hazard scored 12 was Medium
                here and High on the register. */}
            <StatCard 
                title="High Risks" 
                value={matrix.critical + matrix.high} 
                subtitle={`${matrix.critical} critical, ${matrix.total} identified${matrix.unscored ? `, ${matrix.unscored} unscored` : ''}`}
                icon={AlertTriangle}
                tone={matrix.critical + matrix.high > 0 ? 'danger' : 'neutral'}
            />
            <StatCard 
                title="System Status" 
                value={safetySystem ? "Active" : "Pending"} 
                subtitle={safetySystem || "No standard selected"}
                icon={ShieldAlert}
            />
            <StatCard 
                title="KPIs Tracked" 
                value={kpis.length} 
                subtitle="Performance metrics"
                icon={Activity}
            />
            {/* EC6-0: this tile read 94% on every plan, an empty one included,
                under the caption "Est. based on inputs". It counts the checklist
                the plan actually carries, and says so when there is none. */}
            <StatCard 
                title="Compliance checklist" 
                value={checklist.length ? `${complianceScore}%` : 'None yet'} 
                subtitle={checklist.length
                    ? `${checklist.filter((c) => c.status === 'Compliant').length} of ${checklist.length} items compliant`
                    : 'Add compliance items to score this'}
                icon={CheckCircle2}
            />
        </div>
    );
};

export default HSEOverview;