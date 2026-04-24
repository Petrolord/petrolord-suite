import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Settings, Target, TrendingDown, Percent } from 'lucide-react';

const DCAForecastSettings = () => {
  const { 
    currentWell,
    forecastSettings = {
      period: 30, // years
      economicLimit: 10, // bbl/d for oil
      confidenceInterval: true,
      monteCarlo: {
        enabled: false,
        iterations: 1000,
        priceUncertainty: 0.2,
        costUncertainty: 0.15
      },
      discountRate: 0.10
    },
    updateForecastSettings,
    multiSegmentMode = false,
    segments = [],
    selectedStream = 'oil'
  } = useDeclineCurve();

  if (!currentWell) {
    return (
      <div className="p-4 text-center text-slate-500">
        <Settings className="w-8 h-8 mx-auto mb-2" />
        Select a well to configure forecast settings
      </div>
    );
  }

  const handleSettingChange = (key, value) => {
    if (updateForecastSettings) {
      updateForecastSettings({
        ...forecastSettings,
        [key]: value
      });
    }
  };

  const handleMonteCarloChange = (key, value) => {
    if (updateForecastSettings) {
      updateForecastSettings({
        ...forecastSettings,
        monteCarlo: {
          ...forecastSettings.monteCarlo,
          [key]: value
        }
      });
    }
  };

  const getStreamUnits = () => {
    switch(selectedStream) {
      case 'gas': return 'Mscf/d';
      case 'water': return 'bbl/d';
      default: return 'bbl/d';
    }
  };

  const getEconomicLimitDefault = () => {
    switch(selectedStream) {
      case 'gas': return 50; // Mscf/d
      case 'water': return 5; // bbl/d
      default: return 10; // bbl/d
    }
  };

  return (
    <div className="space-y-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-blue-400" />
          Forecast Settings
        </h3>
        {multiSegmentMode && (
          <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
            Multi-Segment Mode
          </Badge>
        )}
      </div>

      {/* Basic Forecast Parameters */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            Forecast Period
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="forecast-period" className="text-xs text-slate-400">
                Forecast Period (years)
              </Label>
              <Input
                id="forecast-period"
                type="number"
                value={forecastSettings.period}
                onChange={(e) => handleSettingChange('period', parseInt(e.target.value) || 30)}
                className="bg-slate-900 border-slate-700 text-slate-200 text-sm h-8"
                min="1"
                max="100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="economic-limit" className="text-xs text-slate-400">
                Economic Limit ({getStreamUnits()})
              </Label>
              <Input
                id="economic-limit"
                type="number"
                value={forecastSettings.economicLimit}
                onChange={(e) => handleSettingChange('economicLimit', parseFloat(e.target.value) || getEconomicLimitDefault())}
                className="bg-slate-900 border-slate-700 text-slate-200 text-sm h-8"
                min="0"
                step="0.1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount-rate" className="text-xs text-slate-400">
              Discount Rate: {(forecastSettings.discountRate * 100).toFixed(1)}%
            </Label>
            <Slider
              value={[forecastSettings.discountRate * 100]}
              onValueChange={([value]) => handleSettingChange('discountRate', value / 100)}
              max={25}
              min={0}
              step={0.5}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Confidence Intervals */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-300">Confidence Intervals</div>
              <div className="text-xs text-slate-500 mt-1">
                Show P10/P50/P90 forecast bands
              </div>
            </div>
            <Switch 
              checked={forecastSettings.confidenceInterval}
              onCheckedChange={(checked) => handleSettingChange('confidenceInterval', checked)}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>
        </CardContent>
      </Card>

      <Separator className="bg-slate-800" />

      {/* Monte Carlo Settings */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Percent className="w-4 h-4 text-purple-400" />
            Monte Carlo Simulation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-300">Enable Probabilistic Analysis</div>
              <div className="text-xs text-slate-500 mt-1">
                {multiSegmentMode ? 'Per-segment parameter uncertainty' : 'Model parameter uncertainty'}
              </div>
            </div>
            <Switch 
              checked={forecastSettings.monteCarlo.enabled}
              onCheckedChange={(checked) => handleMonteCarloChange('enabled', checked)}
              className="data-[state=checked]:bg-purple-600"
            />
          </div>

          {forecastSettings.monteCarlo.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="mc-iterations" className="text-xs text-slate-400">
                  Iterations: {multiSegmentMode && segments.length >= 5 ? 500 : forecastSettings.monteCarlo.iterations}
                </Label>
                <Slider
                  value={[multiSegmentMode && segments.length >= 5 ? 500 : forecastSettings.monteCarlo.iterations]}
                  onValueChange={([value]) => handleMonteCarloChange('iterations', value)}
                  max={multiSegmentMode && segments.length >= 5 ? 500 : 2000}
                  min={100}
                  step={100}
                  className="w-full"
                  disabled={multiSegmentMode && segments.length >= 5}
                />
                {multiSegmentMode && segments.length >= 5 && (
                  <div className="text-xs text-yellow-400">
                    Capped at 500 iterations for performance with 5+ segments
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    Price Uncertainty: ±{(forecastSettings.monteCarlo.priceUncertainty * 100).toFixed(0)}%
                  </Label>
                  <Slider
                    value={[forecastSettings.monteCarlo.priceUncertainty * 100]}
                    onValueChange={([value]) => handleMonteCarloChange('priceUncertainty', value / 100)}
                    max={50}
                    min={5}
                    step={5}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    Cost Uncertainty: ±{(forecastSettings.monteCarlo.costUncertainty * 100).toFixed(0)}%
                  </Label>
                  <Slider
                    value={[forecastSettings.monteCarlo.costUncertainty * 100]}
                    onValueChange={([value]) => handleMonteCarloChange('costUncertainty', value / 100)}
                    max={50}
                    min={5}
                    step={5}
                    className="w-full"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Multi-segment Info */}
      {multiSegmentMode && segments.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-slate-300 mb-2">Multi-Segment Configuration</div>
            <div className="space-y-2">
              {segments.map((segment, index) => (
                <div key={segment.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="text-slate-400">{segment.name}</span>
                  </div>
                  <span className="text-slate-500">{segment.model}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Each segment contributes independent parameter uncertainty to Monte Carlo
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Note */}
      <div className="text-xs text-slate-500 text-center">
        {multiSegmentMode ? 
          'Multi-segment fitting optimized for <500ms performance' : 
          'Single-segment analysis with Phase 1/2 compatibility'}
      </div>
    </div>
  );
};

export default DCAForecastSettings;