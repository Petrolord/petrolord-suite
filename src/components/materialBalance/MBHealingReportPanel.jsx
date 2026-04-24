import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Info, Activity } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const MBHealingReportPanel = ({ report }) => {
  if (!report) return null;

  const { confidenceScore, fixes, anomalies, syntheticDay0Added } = report;

  const getScoreColor = (score) => {
    if (score >= 90) return "text-green-400";
    if (score >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <Card className="bg-slate-900 border-slate-800 mb-4 animate-in fade-in slide-in-from-bottom-2">
      <CardHeader className="p-3 border-b border-slate-800 bg-slate-900/50 flex flex-row justify-between items-center">
        <CardTitle className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" /> Data Healing Report
        </CardTitle>
        <div className="flex items-center gap-3">
            {syntheticDay0Added && (
                <Badge variant="outline" className="border-blue-800 text-blue-300 text-[9px] bg-blue-950/50">
                    Synthetic Day 0 Applied
                </Badge>
            )}
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Confidence</span>
                <span className={`text-sm font-mono font-bold ${getScoreColor(confidenceScore)}`}>{confidenceScore}%</span>
            </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            {/* Fixes Log */}
            <div className="p-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 text-green-500" /> Automated Fixes ({fixes.length})
                </h4>
                <ScrollArea className="h-[120px] w-full rounded border border-slate-800 bg-slate-950/50 p-2">
                    {fixes.length === 0 ? (
                        <div className="text-xs text-slate-500 text-center mt-8">No fixes required. Data is pristine.</div>
                    ) : (
                        <div className="space-y-2">
                            {fixes.map((fix, idx) => (
                                <div key={idx} className="flex flex-col gap-1 text-[10px] pb-2 border-b border-slate-800/50 last:border-0">
                                    <div className="flex justify-between text-slate-300">
                                        <span className="font-semibold">{fix.desc}</span>
                                        <Badge variant="outline" className={`text-[8px] h-4 px-1 ${fix.severity === 'high' ? 'border-red-800 text-red-400' : 'border-slate-700 text-slate-400'}`}>
                                            {fix.severity}
                                        </Badge>
                                    </div>
                                    <div className="flex gap-2 text-slate-500 font-mono bg-slate-900 p-1 rounded">
                                        <span className="line-through decoration-red-500/50">{fix.before}</span>
                                        <span>→</span>
                                        <span className="text-green-400/80">{fix.after}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Anomalies Log */}
            <div className="p-3">
                 <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-yellow-500" /> Detected Anomalies ({anomalies.length})
                </h4>
                <ScrollArea className="h-[120px] w-full rounded border border-slate-800 bg-slate-950/50 p-2">
                    {anomalies.length === 0 ? (
                        <div className="text-xs text-slate-500 text-center mt-8">No physical anomalies detected.</div>
                    ) : (
                        <div className="space-y-2">
                            {anomalies.map((anom, idx) => (
                                <div key={idx} className="flex gap-2 text-[10px] p-1.5 bg-yellow-950/20 border border-yellow-900/30 rounded text-yellow-200/80 items-start">
                                    <Info className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500/70" />
                                    <span>{anom.desc} (Day {anom.day})</span>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MBHealingReportPanel;