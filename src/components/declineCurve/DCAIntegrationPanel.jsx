import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, ArrowRightCircle, Database, Zap } from 'lucide-react';
import { sendForecastToNPVBuilder, sendForecastToFDPAccelerator } from '@/utils/declineCurve/dcaIntegration';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';

const IntegrationCard = ({ title, icon: Icon, onSync, lastSync }) => {
  const [status, setStatus] = useState('idle'); // idle, syncing, success, error

  const handleSync = async () => {
    setStatus('syncing');
    try {
      await onSync();
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
    }
  };

  return (
    <Card className="overflow-hidden shadow-none">
      <CardContent className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pl-sunken rounded-full text-pl-muted">
            <Icon size={16} />
          </div>
          <div>
            <div className="text-xs font-medium text-pl-text">{title}</div>
            <div className="text-[10px] text-pl-muted">
              {lastSync ? `Synced: ${new Date(lastSync).toLocaleTimeString()}` : 'Not synced'}
            </div>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`h-7 w-7 p-0 ${status === 'success' ? 'text-pl-success-text' : 'text-pl-muted hover:text-pl-text'}`}
          onClick={handleSync}
          aria-label={`Send forecast to ${title}`}
          disabled={status === 'syncing'}
        >
          {status === 'syncing' ? <RefreshCw className="animate-spin" size={14} /> : 
           status === 'success' ? <CheckCircle2 size={16} /> : <ArrowRightCircle size={16} />}
        </Button>
      </CardContent>
    </Card>
  );
};

const DCAIntegrationPanel = () => {
  const { currentWell } = useDeclineCurve();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-pl-muted mb-2">
        <Zap size={14} />
        <span className="text-xs font-medium uppercase tracking-wider">Integrations</span>
      </div>

      <div className="space-y-2">
        <IntegrationCard 
          title="NPV & Economics" 
          icon={Database} 
          onSync={() => sendForecastToNPVBuilder(currentWell?.id, {})}
        />
        <IntegrationCard 
          title="FDP Accelerator" 
          icon={Zap} 
          onSync={() => sendForecastToFDPAccelerator(currentWell?.id, {})}
        />
      </div>
    </div>
  );
};

export default DCAIntegrationPanel;