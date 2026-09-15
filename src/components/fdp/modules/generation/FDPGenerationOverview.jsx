import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, CheckCircle2, AlertTriangle, PieChart } from 'lucide-react';
import { calculateCompleteness, validateFDPData } from '@/utils/fdp/fdpCalculations';

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
    <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6 flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-slate-400 uppercase">{title}</p>
                <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
                <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
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
                    colorClass="bg-blue-500" 
                />
                <StatCard 
                    title="Data Quality" 
                    value={validation.isValid
                        ? (completeness.completeWithWarnings ? "Ready with warnings" : "Ready")
                        : "Needs Review"} 
                    icon={validation.isValid && !completeness.completeWithWarnings ? CheckCircle2 : AlertTriangle} 
                    colorClass={validation.isValid && !completeness.completeWithWarnings ? "bg-green-500" : "bg-yellow-500"} 
                />
                <StatCard 
                    title="Document Status" 
                    value="Draft" 
                    icon={FileText} 
                    colorClass="bg-purple-500" 
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="p-6">
                        <h4 className="text-sm font-bold text-white mb-4">Module Status</h4>
                        <div className="space-y-3">
                            {completeness.breakdown.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                    <span className="text-slate-300">{item.module}</span>
                                    {item.valid ? (
                                        <span className="flex items-center text-green-400 text-xs bg-green-400/10 px-2 py-1 rounded"><CheckCircle2 className="w-3 h-3 mr-1"/> Complete</span>
                                    ) : (
                                        <span className="flex items-center text-slate-500 text-xs bg-slate-800 px-2 py-1 rounded">Pending</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="p-6">
                        <h4 className="text-sm font-bold text-white mb-4">Validation Summary</h4>
                        {validation.errors.length === 0 && otherWarnings.length === 0 ? (
                            <div className="text-center py-8 text-green-400">
                                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>All checks passed.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {validation.errors.map((err, i) => (
                                    <div key={i} className="flex items-start gap-2 text-red-400 text-xs bg-red-950/30 p-2 rounded">
                                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {err}
                                    </div>
                                ))}
                                {otherWarnings.map((warn, i) => (
                                    <div key={i} className="flex items-start gap-2 text-yellow-400 text-xs bg-yellow-950/30 p-2 rounded">
                                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {warn}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-900 border-slate-800" data-testid="reserves-check">
                <CardContent className="p-6">
                    <h4 className="text-sm font-bold text-white mb-1">Reserves check</h4>
                    <p className="text-xs text-slate-500 mb-4">
                        Does the concept's production profile fit the plan's reserves, and do the wells
                        carried fit them. The profile is a screening shape with no reservoir behind it,
                        so this check reports and warns; it caps nothing.
                    </p>
                    {reserves?.status === 'incomplete' ? (
                        <p className="text-sm text-slate-300">
                            Not checked yet: the plan is missing {reserves.missing.join(', ')}.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="text-slate-300">
                                Profile volume
                                <span className="block text-white font-mono">
                                    {num(reserves.profileVolumeMMbbl)} MMbbl over {reserves.profileYears} years
                                </span>
                            </div>
                            <div className="text-slate-300">
                                Oil P50
                                <span className="block text-white font-mono">{num(reserves.oilP50MMbbl)} MMbbl</span>
                            </div>
                            <div className="text-slate-300">
                                Wells implied by the reserves
                                <span className="block text-white font-mono">
                                    {reserves.impliedWells} at {reserves.recoveryPerWellMMbbl} MMbbl a well
                                </span>
                            </div>
                            <div className="text-slate-300">
                                Wells carried
                                <span className="block text-white font-mono">{reserves.carriedWells}</span>
                            </div>
                        </div>
                    )}
                    {(reserves?.warnings || []).length > 0 && (
                        <div className="space-y-2 mt-4">
                            {reserves.warnings.map((w) => (
                                <div key={w.code} className="flex items-start gap-2 text-yellow-400 text-xs bg-yellow-950/30 p-2 rounded">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {w.message}
                                </div>
                            ))}
                        </div>
                    )}
                    {reserves?.recoveryPerWellSource && (
                        <p className="text-[11px] text-slate-600 mt-3">{reserves.recoveryPerWellSource}</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default FDPGenerationOverview;