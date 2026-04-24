import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { wellsData } from '../../../../data/wellPlanningData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, MapPin, Target, Activity, Calendar, FileType2 } from 'lucide-react';

export default function WellDetails() {
  const { wellId } = useParams();
  const navigate = useNavigate();
  
  const well = wellsData.find(w => w.id === wellId);

  if (!well) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" onClick={() => navigate('/dashboard/apps/Drilling/well-planning')}>
          <ChevronLeft className="w-4 h-4 mr-2" /> Back to Well List
        </Button>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-8 text-center text-destructive font-medium">
            Well not found. The well ID "{wellId}" does not exist.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <Button variant="outline" onClick={() => navigate('/dashboard/apps/Drilling/well-planning')} className="mb-4">
        <ChevronLeft className="w-4 h-4 mr-2" /> Back to Well List
      </Button>
      
      <Card className="border-border shadow-sm">
        <CardHeader className="bg-card border-b border-border pb-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl text-primary flex items-center gap-2">
                {well.name}
              </CardTitle>
              <p className="text-muted-foreground mt-2 text-sm flex items-center gap-1">
                <MapPin className="w-4 h-4" /> {well.location}
              </p>
            </div>
            <div className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground font-medium text-sm">
              {well.status}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 bg-background">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-md text-primary mt-0.5">
                  <FileType2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Well Type</p>
                  <p className="text-foreground text-lg">{well.type}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-md text-primary mt-0.5">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Target Depth</p>
                  <p className="text-foreground text-lg">{well.depth.toLocaleString()} ft</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-md text-primary mt-0.5">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Target Reservoir</p>
                  <p className="text-foreground text-lg">{well.target}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-md text-primary mt-0.5">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Spud Date</p>
                  <p className="text-foreground text-lg">{well.spudDate}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}