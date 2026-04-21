import React, { useState } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trash2, Plus, Zap, Move, BarChart3 } from 'lucide-react';
import { detectSegmentBreakpoints, createSegmentDefinitions, SEGMENT_MODELS } from '@/utils/dcaSegmentDetection';
import { useToast } from '@/components/ui/use-toast';

const DCASegmentsPanel = () => {
  const { 
    currentWell, 
    wells, 
    selectedStream,
    segments = [],
    setSegments,
    multiSegmentMode = false,
    setMultiSegmentMode,
    runSegmentFitting
  } = useDeclineCurve();
  const { toast } = useToast();
  const [isDetecting, setIsDetecting] = useState(false);

  if (!currentWell) return null;

  const wellData = wells[currentWell.id];
  const productionData = wellData?.productionData?.[selectedStream] || [];

  const handleAutoDetect = async () => {
    if (!productionData || productionData.length < 90) {
      toast({
        title: "Insufficient Data",
        description: "Need at least 90 data points for multi-segment analysis.",
        variant: "destructive"
      });
      return;
    }

    setIsDetecting(true);
    try {
      // Simulate processing time for better UX
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const breakpoints = detectSegmentBreakpoints(productionData, {
        minSegmentLength: 30,
        smoothingWindow: 8,
        slopeChangeThreshold: 0.25,
        maxSegments: 4
      });

      if (breakpoints.length === 0) {
        toast({
          title: "No Segments Detected",
          description: "Production shows consistent single-segment decline behavior.",
        });
        return;
      }

      const segmentDefinitions = createSegmentDefinitions(breakpoints, productionData);
      setSegments(segmentDefinitions);
      setMultiSegmentMode(true);
      
      toast({
        title: "Segments Detected",
        description: `Found ${segmentDefinitions.length} distinct flow regimes.`,
      });
      
      // Auto-fit the segments
      if (runSegmentFitting) {
        runSegmentFitting(segmentDefinitions);
      }
    } catch (error) {
      console.error('Segment detection error:', error);
      toast({
        title: "Detection Failed",
        description: "Error analyzing production data for segments.",
        variant: "destructive"
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAddSegment = () => {
    if (!segments || segments.length === 0) {
      handleAutoDetect();
      return;
    }

    // Add a segment in the middle of the last segment
    const lastSegment = segments[segments.length - 1];
    const midTime = (lastSegment.startTime + lastSegment.endTime) / 2;
    const midDate = new Date(lastSegment.startDate.getTime() + (midTime - lastSegment.startTime) * 24 * 60 * 60 * 1000);
    
    const newSegments = [...segments];
    const newSegmentId = segments.length + 1;
    
    // Split the last segment
    newSegments[newSegments.length - 1] = {
      ...lastSegment,
      endTime: midTime,
      endDate: midDate
    };
    
    // Add new segment
    newSegments.push({
      id: `segment_${newSegmentId}`,
      name: `Segment ${newSegmentId}`,
      startTime: midTime,
      endTime: lastSegment.endTime,
      startDate: midDate,
      endDate: lastSegment.endDate,
      model: 'exponential',
      parameters: {},
      color: getSegmentColor(newSegmentId - 1)
    });
    
    setSegments(newSegments);
  };

  const handleRemoveSegment = (segmentId) => {
    if (segments.length <= 2) {
      setMultiSegmentMode(false);
      setSegments([]);
      return;
    }
    
    const filteredSegments = segments.filter(s => s.id !== segmentId);
    // Re-connect the segments
    for (let i = 1; i < filteredSegments.length; i++) {
      filteredSegments[i].startTime = filteredSegments[i - 1].endTime;
      filteredSegments[i].startDate = filteredSegments[i - 1].endDate;
    }
    
    setSegments(filteredSegments);
  };

  const handleModelChange = (segmentId, newModel) => {
    const updatedSegments = segments.map(s => 
      s.id === segmentId ? { ...s, model: newModel } : s
    );
    setSegments(updatedSegments);
  };

  const toggleSingleSegmentMode = (enabled) => {
    setMultiSegmentMode(!enabled);
    if (enabled) {
      setSegments([]);
    }
  };

  const getSegmentColor = (index) => {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
    return colors[index % colors.length];
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          Decline Segments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Single/Multi-segment toggle */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400">Single segment mode</div>
          <Switch 
            checked={!multiSegmentMode}
            onCheckedChange={toggleSingleSegmentMode}
            className="data-[state=checked]:bg-slate-600"
          />
        </div>
        
        {multiSegmentMode ? (
          <>
            {/* Auto-detect button */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={handleAutoDetect}
                disabled={isDetecting}
              >
                {isDetecting ? (
                  <div className="animate-spin w-3 h-3 border border-slate-400 border-t-transparent rounded-full mr-2" />
                ) : (
                  <Zap className="w-3 h-3 mr-2" />
                )}
                Auto-detect
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={handleAddSegment}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            {/* Segments list */}
            {segments && segments.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 mb-2">
                  {segments.length} segments detected
                </div>
                {segments.map((segment, index) => (
                  <div key={segment.id} className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: segment.color }}
                        />
                        <span className="text-xs font-medium text-slate-300">{segment.name}</span>
                      </div>
                      {segments.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-5 w-5 p-0 text-slate-500 hover:text-red-400"
                          onClick={() => handleRemoveSegment(segment.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="text-xs text-slate-500 mb-2">
                      {segment.startDate?.toLocaleDateString()} - {segment.endDate?.toLocaleDateString()}
                    </div>
                    
                    <Select 
                      value={segment.model} 
                      onValueChange={(value) => handleModelChange(segment.id, value)}
                    >
                      <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        {Object.entries(SEGMENT_MODELS).map(([key, model]) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                Click auto-detect to analyze flow regimes
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-xs text-slate-500">
            <div className="bg-slate-800 p-3 rounded-lg">
              Standard single-segment Arps decline analysis
            </div>
          </div>
        )}
        
        {multiSegmentMode && segments && segments.length > 0 && (
          <>
            <Separator className="bg-slate-800" />
            <div className="text-xs text-slate-400">
              <div className="flex items-center gap-1 mb-1">
                <Move className="w-3 h-3" />
                <span>Drag segment boundaries in chart to adjust</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DCASegmentsPanel;