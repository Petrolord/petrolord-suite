import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, AlertCircle, CircleSlash } from 'lucide-react';
import { useMaterialBalance } from '@/hooks/useMaterialBalance';
import MBHealingReportPanel from './MBHealingReportPanel';
import { healMaterialBalanceData } from '@/utils/materialBalance/healMaterialBalanceData';

const StatusIndicator = ({ label, status, count }) => {
  let Icon = CircleSlash;
  let color = "text-slate-500";
  let bgColor = "bg-slate-500/10";
  let borderColor = "border-slate-800/50";

  if (status === 'Complete' || status === 'Available') {
    Icon = CheckCircle;
    color = "text-green-400";
    bgColor = "bg-green-500/10";
    borderColor = "border-green-500/20";
  } else if (status === 'Missing' || status === 'None') {
    Icon = AlertTriangle;
    color = "text-red-400";
    bgColor = "bg-red-500/10";
    borderColor = "border-red-500/20";
  } else if (status === 'Partial') {
    Icon = AlertCircle;
    color = "text-yellow-400";
    bgColor = "bg-yellow-500/10";
    borderColor = "border-yellow-500/20";
  }

  return (
    <div className={`flex items-center justify-between p-2.5 rounded border ${borderColor} ${bgColor} transition-colors duration-300`}>
      <div className="flex items-center gap-2.5">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-medium text-slate-200">{label}</span>
      </div>
      <div className="text-right">
        <div className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{status}</div>
        {count !== undefined && <div className="text-[9px] text-slate-400">{count} records</div>}
      </div>
    </div>
  );
};

const DataQualityPanel = () => {
  const { dataStatus, productionHistory, pressureData, pvtData, contactObservations } = useMaterialBalance();
  const [healingReport, setHealingReport] = useState(null);

  // Run healing logic purely to get the report for display here
  useEffect(() => {
    if (productionHistory?.dates?.length > 0 || pressureData?.dates?.length > 0) {
        const { healingReport: hr } = healMaterialBalanceData(productionHistory, pressureData);
        setHealingReport(hr);
    }
  }, [productionHistory, pressureData]);

  return (
    <div className="space-y-4">
      {/* Healing Report Prominently Displayed above quality checks */}
      <MBHealingReportPanel report={healingReport} />

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="p-3 border-b border-slate-800 bg-slate-900/50">
          <CardTitle className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
            Raw Data Inventory Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2.5">
          <StatusIndicator 
            label="Production" 
            status={dataStatus.production} 
            count={productionHistory?.dates?.length || 0} 
          />
          <StatusIndicator 
            label="Pressure" 
            status={dataStatus.pressure} 
            count={pressureData?.dates?.length || 0} 
          />
          <StatusIndicator 
            label="PVT" 
            status={dataStatus.pvt} 
            count={pvtData?.pressure?.length || 0} 
          />
          <StatusIndicator 
            label="Contacts" 
            status={dataStatus.contacts} 
            count={contactObservations?.dates?.length || 0} 
          />
          
          {dataStatus.pvt === 'Missing' && (
            <div className="mt-4 p-2 bg-blue-900/20 border border-blue-500/30 rounded text-[10px] text-blue-300 flex items-start gap-2">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>Tip: Import PVT data to enable advanced material balance calculations (F, Eo, Eg). Data Healing is actively managing gaps in your current datasets.</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataQualityPanel;