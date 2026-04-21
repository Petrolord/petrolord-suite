import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertCircle, CheckCircle, TrendingUp, Target } from 'lucide-react';
import { calculateR2, calculateRMSE, calculateResiduals, getVerdictInfo, calculateArpsConfidenceIntervals } from '@/utils/dcaDiagnostics';

const DCAFitDiagnostics = () => {
  const { wells, currentWellId, currentWell, selectedStream, streamState } = useDeclineCurve();
  
  const fitResults = streamState[selectedStream]?.fitResults;
  const productionData = currentWell?.productionData || wells?.[currentWellId]?.productionData || [];
  
  if (!fitResults || !productionData.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm p-4 bg-slate-900/50 rounded border border-dashed border-slate-800">
        <div className="text-center space-y-2">
          <AlertCircle size={24} className="mx-auto text-slate-600" />
          <p>No Fit Results Available</p>
          <p className="text-xs text-slate-600">Run fit analysis to display diagnostics</p>
        </div>
      </div>
    );
  }

  // Extract fit data for calculations
  const { actualData, predictedData, parameters } = fitResults;
  const { qi, Di, b } = parameters || {};
  
  // Calculate diagnostics
  const r2 = calculateR2(actualData, predictedData);
  const rmse = calculateRMSE(actualData, predictedData);
  const residuals = calculateResiduals(actualData, predictedData);
  const verdictInfo = getVerdictInfo(r2);
  const confidenceIntervals = calculateArpsConfidenceIntervals(parameters, actualData, predictedData);
  
  // R² color coding
  const getR2Color = (r2Value) => {
    if (r2Value >= 0.95) return 'text-green-500';
    if (r2Value >= 0.85) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  const getR2BadgeColor = (r2Value) => {
    if (r2Value >= 0.95) return 'bg-green-900/50 text-green-400 border-green-900';
    if (r2Value >= 0.85) return 'bg-yellow-900/50 text-yellow-400 border-yellow-900';
    return 'bg-red-900/50 text-red-400 border-red-900';
  };
  
  // Format units based on stream
  const getUnits = () => {
    switch(selectedStream) {
      case 'gas': return 'Mcf/d';
      case 'water': return 'bbl/d';
      default: return 'bbl/d';
    }
  };
  
  // Detect outliers (beyond ±2σ)
  const residualMean = residuals.reduce((sum, r) => sum + r.residual, 0) / residuals.length;
  const residualStd = Math.sqrt(residuals.reduce((sum, r) => sum + Math.pow(r.residual - residualMean, 2), 0) / residuals.length);
  const outlierThreshold = 2 * residualStd;
  
  const residualsWithOutliers = residuals.map(point => ({
    ...point,
    isOutlier: Math.abs(point.residual) > outlierThreshold
  }));

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Verdict Card */}
      <Card className="bg-slate-900 border-slate-800 shrink-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {verdictInfo.icon === 'check' ? (
              <CheckCircle className={verdictInfo.color} size={20} />
            ) : (
              <AlertCircle className={verdictInfo.color} size={20} />
            )}
            <div>
              <div className={`font-semibold ${verdictInfo.color}`}>{verdictInfo.title}</div>
              <div className="text-xs text-slate-400">{verdictInfo.description}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">R² (Coeff. Det.)</div>
                <div className={`text-lg font-bold ${getR2Color(r2)}`}>
                  {(r2 * 100).toFixed(1)}%
                </div>
              </div>
              <Badge className={getR2BadgeColor(r2)}>
                {r2 >= 0.95 ? 'Excellent' : r2 >= 0.85 ? 'Good' : 'Poor'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">RMSE</div>
              <div className="text-lg font-bold text-slate-200">
                {rmse.toFixed(1)}
              </div>
              <div className="text-xs text-slate-400">{getUnits()}</div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Arps Parameters */}
      <Card className="bg-slate-900 border-slate-800 shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target size={16} className="text-blue-400" />
            Arps Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-slate-500 mb-1">qi (Initial Rate)</div>
              <div className="font-mono text-slate-200">{qi?.toFixed(1) || 'N/A'} {getUnits()}</div>
              {confidenceIntervals.qi && (
                <div className="text-slate-400 text-[10px]">±{confidenceIntervals.qi.toFixed(1)}</div>
              )}
            </div>
            <div>
              <div className="text-slate-500 mb-1">Di (Initial Decline)</div>
              <div className="font-mono text-slate-200">{Di ? (Di * 100).toFixed(2) : 'N/A'}%/yr</div>
              {confidenceIntervals.Di && (
                <div className="text-slate-400 text-[10px]">±{(confidenceIntervals.Di * 100).toFixed(2)}%</div>
              )}
            </div>
            <div>
              <div className="text-slate-500 mb-1">b (Exponent)</div>
              <div className="font-mono text-slate-200">{b?.toFixed(3) || 'N/A'}</div>
              {confidenceIntervals.b && (
                <div className="text-slate-400 text-[10px]">±{confidenceIntervals.b.toFixed(3)}</div>
              )}
            </div>
          </div>
          {confidenceIntervals.hasIntervals && (
            <div className="text-[10px] text-slate-500 mt-2 text-center">95% Confidence Intervals</div>
          )}
        </CardContent>
      </Card>
      
      {/* Residuals Plot */}
      <Card className="bg-slate-900 border-slate-800 flex-1 min-h-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-purple-400" />
            Normalized Residuals
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-full flex flex-col">
          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={residualsWithOutliers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="time" 
                  stroke="#9CA3AF" 
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#9CA3AF" 
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                  labelFormatter={(value) => `Time: ${value}`}
                  formatter={(value, name) => [
                    `${value.toFixed(3)}`, 
                    name === 'residual' ? 'Residual' : name
                  ]}
                />
                <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="2 2" />
                <ReferenceLine y={outlierThreshold} stroke="#EF4444" strokeDasharray="1 1" strokeOpacity={0.5} />
                <ReferenceLine y={-outlierThreshold} stroke="#EF4444" strokeDasharray="1 1" strokeOpacity={0.5} />
                <Line 
                  type="monotone" 
                  dataKey="residual" 
                  stroke={(entry) => entry?.isOutlier ? '#EF4444' : '#8B5CF6'}
                  strokeWidth={1}
                  dot={(props) => {
                    const { payload } = props;
                    return (
                      <circle 
                        {...props} 
                        fill={payload?.isOutlier ? '#EF4444' : '#8B5CF6'}
                        r={payload?.isOutlier ? 3 : 1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 4, fill: '#8B5CF6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-slate-500 text-center mt-2">
            Red points: outliers beyond ±2σ ({residualsWithOutliers.filter(r => r.isOutlier).length} detected)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DCAFitDiagnostics;