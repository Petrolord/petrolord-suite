import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, UserPlus, Plus } from 'lucide-react';

const ProjectManagementTaskCreator = () => {
  return (
    <Card className="bg-slate-900 border-slate-800 h-full">
      <CardHeader className="pb-3 border-b border-slate-800">
        <div className="flex justify-between items-center">
            <CardTitle className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-orange-400" /> Auto-QC Tasks
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Plus className="w-4 h-4 text-slate-400" />
            </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
         <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Suggested Tasks</h4>
            <div className="space-y-2">
                <div className="p-2 bg-slate-950 border border-slate-800 rounded flex items-start gap-3">
                    <div className="mt-0.5">
                        <Badge variant="outline" className="text-[10px] border-red-900 text-red-400 bg-red-900/10">High</Badge>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-slate-300 font-medium">Review V0 outlier in Well-12</p>
                        <p className="text-[10px] text-slate-500 mt-1">Residual {'>'} 10m detected.</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-white">
                        <UserPlus className="w-3 h-3" />
                    </Button>
                </div>

                <div className="p-2 bg-slate-950 border border-slate-800 rounded flex items-start gap-3">
                    <div className="mt-0.5">
                        <Badge variant="outline" className="text-[10px] border-yellow-900 text-yellow-400 bg-yellow-900/10">Med</Badge>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-slate-300 font-medium">Validate Top Reservoir Depth</p>
                        <p className="text-[10px] text-slate-500 mt-1">New well tops available.</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-white">
                        <UserPlus className="w-3 h-3" />
                    </Button>
                </div>
            </div>
         </div>

         <div className="pt-2 border-t border-slate-800">
            <Button className="w-full bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 h-8 text-xs">
                Create All Tasks
            </Button>
         </div>
      </CardContent>
    </Card>
  );
};

export default ProjectManagementTaskCreator;