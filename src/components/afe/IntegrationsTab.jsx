// AFE integrations tab.
//
// EC5-0 (owner decision 2026-09-14). This tab used to show invented live
// links: a linked PM Pro project with a recent sync time, a schedule slip
// trigger, technical apps marked Active and a rig streaming daily costs. None
// of it was connected to anything. Nothing is connected for an AFE today, so
// the tab says that plainly and offers no fake connection.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Link2 } from 'lucide-react';

const IntegrationsTab = ({ afe }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardContent className="p-8 flex flex-col items-center text-center gap-3">
      <div className="p-3 bg-slate-800 rounded-lg">
        <Link2 className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-lg font-bold text-white">No integrations are connected</h3>
      <p className="text-sm text-slate-400 max-w-xl">
        No integrations are connected for AFE {afe?.afe_number || 'this AFE'}. Nothing here syncs with
        schedules, technical apps or drilling reports. Enter cost items, invoices and budget changes in
        their own tabs.
      </p>
    </CardContent>
  </Card>
);

export default IntegrationsTab;
