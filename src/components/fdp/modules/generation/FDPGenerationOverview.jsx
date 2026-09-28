import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, CheckCircle2, AlertTriangle, PieChart } from 'lucide-react';
import { calculateCompleteness, validateFDPData } from '@/utils/fdp/fdpCalculations';

// Design system rollout 6B: the icon takes a status role only where the
// tile reports a status (data quality); the other icons are neutral.
const ICON_TONE = {
    success: 'bg-pl-success-bg text-pl-success-text',
    warning: 'bg-pl-warning-bg text-pl-warning-text',
    neutral: 'bg-pl-sunken text-pl-muted',
};

const StatCard = ({ title, value, icon: Icon, tone = 'neutral' }) => (
    <Card>
        <CardContent className="p-6 flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-pl-muted uppercase">{title}</p>
                <h3 className="text-2xl font-bold text-pl-text mt-1">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${ICON_TONE[tone]}`}>
                <Icon className="w-6 h-6" />
            </div>
        </CardContent>
    </Card>
);

/**
 * EC6-1 (engines #191). `calculateCompleteness` now carries the reserves
 * check and `completeWithWarnings`, so a plan that fills in every section
 * cannot read as clean while its production profile or its well count
 * disagree with its own reserves. The check is non-blocking and caps
 * nothing: it reports, and this panel shows what it found.
 */
const FDPGenerationOverview = ({ state }) => {
    const completeness = calculateCompleteness(state);
    const validation = validateFDPData(state);
    const reserves = completeness.reservesCheck;
    const reservesMessages = new Set((reserves?.warnings || []).map((w) => w.message));
    // The reserves warnings are shown in their own card, so the validation
    // list does not repeat them.
    const otherWarnings = validation.warnings.filter((w) => !reservesMessages.has(w));
    const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '--');

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard 
                    title="Completeness" 
                    value={`${completeness.score}%`} 
                    icon={PieChart} 
                />
                <StatCard 
                    title="Data Quality" 
                    value={validation.isValid
                        ? (completeness.completeWithWarnings ? "Ready with warnings" : "Ready")
                        : "Needs Review"} 
                    icon={validation.isValid && !completeness.completeWithWarnings ? CheckCircle2 : AlertTriangle} 
                    tone={validation.isValid && !completeness.completeWithWarnings ? "success" : "warning"} 
                />
                <StatCard 
                    title="Document Status" 
                    value="Draft" 
                    icon={FileText} 
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardContent className="p-6">
                        <h4 className="text-sm font-bold text-pl-text mb-4">Module Status</h4>
                        <div className="space-y-3">
                            {completeness.breakdown.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                    <span className="text-pl-text">{item.module}</span>
                                    {item.valid ? (
                                        <span className="flex items-center text-pl-success-text text-xs bg-pl-success-bg px-2 py-1 rounded"><CheckCircle2 className="w-3 h-3 mr-1"/> Complete</span>
                                    ) : (
                                        <span className="flex items-center text-pl-muted text-xs bg-pl-sunken px-2 py-1 rounded">Pending</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <h4 className="text-sm font-bold text-pl-text mb-4">Validation Summary</h4>
                        {validation.errors.length === 0 && otherWarnings.length === 0 ? (
                            <div className="text-center py-8 text-pl-success-text">
                                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>All checks passed.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {validation.errors.map((err, i) => (
                                    <div key={i} className="flex items-start gap-2 text-pl-danger-text text-xs bg-pl-danger-bg p-2 rounded">
                                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {err}
                                    </div>
                                ))}
                                {otherWarnings.map((warn, i) => (
                                    <div key={i} className="flex items-start gap-2 text-pl-warning-text text-xs bg-pl-warning-bg p-2 rounded">
                                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {warn}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card data-testid="reserves-check">
                <CardContent className="p-6">
                    <h4 className="text-sm font-bold text-pl-text mb-1">Reserves check</h4>
                    <p className="text-xs text-pl-muted mb-4">
                        Does the concept's production profile fit the plan's reserves, and do the wells
                        carried fit them. The profile is a screening shape with no reservoir behind it,
                        so this check reports and warns; it caps nothing.
                    </p>
                    {reserves?.status === 'incomplete' ? (
                        <p className="text-sm text-pl-text">
                            Not checked yet: the plan is missing {reserves.missing.join(', ')}.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="text-pl-muted">
                                Profile volume
                                <span className="block text-pl-text font-pl-mono tabular-nums">
                                    {num(reserves.profileVolumeMMbbl)} MMbbl over {reserves.profileYears} years
                                </span>
                            </div>
                            <div className="text-pl-muted">
                                Oil P50
                                <span className="block text-pl-text font-pl-mono tabular-nums">{num(reserves.oilP50MMbbl)} MMbbl</span>
                            </div>
                            <div className="text-pl-muted">
                                Wells implied by the reserves
                                <span className="block text-pl-text font-pl-mono tabular-nums">
                                    {reserves.impliedWells} at {reserves.recoveryPerWellMMbbl} MMbbl a well
                                </span>
                            </div>
                            <div className="text-pl-muted">
                                Wells carried
                                <span className="block text-pl-text font-pl-mono tabular-nums">{reserves.carriedWells}</span>
                            </div>
                        </div>
                    )}
                    {(reserves?.warnings || []).length > 0 && (
                        <div className="space-y-2 mt-4">
                            {reserves.warnings.map((w) => (
                                <div key={w.code} className="flex items-start gap-2 text-pl-warning-text text-xs bg-pl-warning-bg p-2 rounded">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {w.message}
                                </div>
                            ))}
                        </div>
                    )}
                    {reserves?.recoveryPerWellSource && (
                        <p className="text-[11px] text-pl-muted mt-3">{reserves.recoveryPerWellSource}</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default FDPGenerationOverview;