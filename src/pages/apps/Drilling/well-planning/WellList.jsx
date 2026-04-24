import React from 'react';
import { useNavigate } from 'react-router-dom';
import { wellsData } from '../../../../data/wellPlanningData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function WellList() {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Well Planning Dashboard</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {wellsData.map(well => (
          <Card 
            key={well.id} 
            className="cursor-pointer hover:bg-secondary/30 transition-colors border-border"
            onClick={() => navigate(`/dashboard/apps/Drilling/well-planning/${well.id}`)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-primary">{well.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Type:</span> {well.type}</p>
                <p><span className="font-medium text-foreground">Status:</span> {well.status}</p>
                <p><span className="font-medium text-foreground">Target Depth:</span> {well.depth.toLocaleString()} ft</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}