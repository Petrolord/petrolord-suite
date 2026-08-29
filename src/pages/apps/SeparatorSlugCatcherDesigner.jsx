import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Indent as SeparatorIcon, Waves, ChevronsRightLeft, Thermometer, Droplets, Wind, Ruler } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const SeparatorVisual = ({ diameter, length, type }) => {
    if (!diameter || !length) return null;

    const d = parseFloat(diameter);
    const l = parseFloat(length);
    const aspectRatio = l / d;
    
    const containerWidth = 400;
    const containerHeight = containerWidth / (aspectRatio > 1 ? aspectRatio : 1) * 1.2;

    const vesselWidth = containerWidth;
    const vesselHeight = vesselWidth / aspectRatio;

    const isThreePhase = type.includes('3-phase');

    return (
        <div className="mt-4 p-4 bg-slate-900/50 rounded-lg flex flex-col items-center justify-center" style={{ minHeight: '250px' }}>
            <h4 className="text-lg font-semibold text-white mb-4">Vessel Schematic</h4>
            <div className="relative w-full flex items-center justify-center" style={{ height: `${vesselHeight + 40}px` }}>
                <div 
                    className="bg-slate-600 border-2 border-slate-400 rounded-full flex items-center justify-center"
                    style={{ width: `${vesselWidth}px`, height: `${vesselHeight}px` }}
                >
                    {isThreePhase && (
                        <div className="h-full w-full flex flex-col justify-end">
                            <div className="bg-cyan-400/30" style={{ height: '25%' }}></div>
                            <div className="bg-yellow-400/30" style={{ height: '25%' }}></div>
                        </div>
                    )}
                     {!isThreePhase && (
                        <div className="h-full w-full flex flex-col justify-end">
                            <div className="bg-cyan-400/30" style={{ height: '50%' }}></div>
                        </div>
                    )}
                </div>
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-4 text-center">
                    <p className="text-xs text-slate-300">L = {l.toFixed(1)} ft</p>
                    <div className="w-px h-2 bg-slate-300 mx-auto"></div>
                </div>
                 <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-10 text-center">
                    <p className="text-xs text-slate-300 -rotate-90">D = {d.toFixed(1)} ft</p>
                    <div className="h-px w-2 bg-slate-300 my-auto absolute -right-2 top-1/2"></div>
                </div>
            </div>
            <div className="text-xs text-slate-400 mt-2">{type.includes('3-phase') ? "3-Phase Horizontal Separator" : "2-Phase Horizontal Separator"}</div>
        </div>
    );
};


const SeparatorSlugCatcherDesigner = () => {
  const { toast } = useToast();
  const [inputs, setInputs] = useState({
    vesselType: '2-phase-h',
    designType: 'separator',
    gasRate: '10',
    liquidRate: '1000',
    waterCut: '50',
    pressure: '1000',
    temperature: '150',
    gasGravity: '0.65',
    oilGravity: '35',
    waterGravity: '1.05',
    retentionTime: '3',
    slugVolume: '50',
  });
  const [results, setResults] = useState(null);

  const handleInputChange = (name, value) => {
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const calculateSizing = () => {
    const { 
        vesselType, designType, gasRate, liquidRate, pressure, temperature, 
        gasGravity, oilGravity, waterGravity, retentionTime, slugVolume 
    } = inputs;
    
    const Qg_scfd = parseFloat(gasRate) * 1_000_000; // MMSCFD to SCFD
    const Ql_bpd = parseFloat(liquidRate); // BPD
    const P_psig = parseFloat(pressure); // psig
    const T_F = parseFloat(temperature); // F
    const slugVol_bbl = parseFloat(slugVolume);
    
    if ([Qg_scfd, Ql_bpd, P_psig, T_F].some(isNaN) || (designType === 'slug-catcher' && isNaN(slugVol_bbl))) {
        toast({
            variant: "destructive",
            title: "Invalid Input",
            description: "Please ensure all numerical inputs are valid numbers.",
        });
        return;
    }

    const Z = 0.85; // Compressibility factor, simplified
    const T_R = T_F + 460; // F to Rankine

    const gasDensity = (2.7 * parseFloat(gasGravity) * (P_psig + 14.7)) / (Z * T_R);
    const oilDensity = 141.5 / (131.5 + parseFloat(oilGravity)) * 62.4; // lb/ft3
    const waterDensity = parseFloat(waterGravity) * 62.4; // lb/ft3
    const liquidDensity = oilDensity * (1 - (inputs.waterCut/100)) + waterDensity * (inputs.waterCut/100);

    const K_separator = vesselType.includes('-h') ? 0.35 : 0.18; // Souders-Brown constant
    const V_terminal = K_separator * Math.sqrt((liquidDensity - gasDensity) / gasDensity);
    
    const Qg_acfs = (Qg_scfd / 86400) * (T_R / 520) * (14.7 / (P_psig + 14.7)) * Z;

    let diameter, seamToSeamLength;

    if (designType === 'separator') {
        const A_gas = Qg_acfs / V_terminal;
        const Ql_ft3_day = Ql_bpd * 5.615;
        const Vol_liquid = Ql_ft3_day * (parseFloat(retentionTime) / 1440);
        const A_liquid = Vol_liquid / 10; // Assume L/D of 3-4, approx L=10ft for initial guess
        
        // This is an iterative process, but for simplicity:
        // Assume gas capacity dictates size for horizontal separators
        // Total cross-section area required, assuming 50% liquid level
        const totalArea = A_gas / 0.5;
        diameter = Math.sqrt((4 * totalArea) / Math.PI); // ft

        // Recalculate based on liquid retention time
        const liquidCrossSectionalArea = (Math.PI * (diameter**2)) / 8; // approx area for 50% fill
        seamToSeamLength = Vol_liquid / liquidCrossSectionalArea;

    } else { // Slug Catcher
        // Size based on slug volume, typically filling ~50-70% of vessel. Assume 60%.
        const requiredVol_ft3 = slugVol_bbl * 5.615 / 0.6;
        // Assume L/D ratio of 5
        diameter = Math.pow((4 * requiredVol_ft3) / (5 * Math.PI), 1/3);
        seamToSeamLength = 5 * diameter;
    }

    // Sanity checks
    if (seamToSeamLength < 10) seamToSeamLength = 10;
    if (diameter < 2) diameter = 2;
    if (seamToSeamLength / diameter > 6) seamToSeamLength = 6 * diameter;
    if (seamToSeamLength / diameter < 1.5) seamToSeamLength = 1.5 * diameter;

    // Actual gas velocity through the gas space (50% liquid level) of the
    // vessel just sized. This previously read the PREVIOUS render's results,
    // so the first calculation always reported 0 (fixed at Facilities F0).
    const gasVelocity = Qg_acfs / ((Math.PI * (diameter / 2) ** 2) * 0.5);

    setResults({
        diameter: diameter.toFixed(2),
        seamToSeamLength: seamToSeamLength.toFixed(2),
        gasDensity: gasDensity.toFixed(3),
        liquidDensity: liquidDensity.toFixed(3),
        ldRatio: (seamToSeamLength / diameter).toFixed(2),
        gasVelocity: gasVelocity.toFixed(2),
        terminalVelocity: V_terminal.toFixed(2),
    });
     toast({
        title: "Calculation Complete",
        description: `${designType === 'separator' ? 'Separator' : 'Slug Catcher'} dimensions have been estimated.`,
    });
  };

  const renderInputFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {inputs.designType === 'separator' ? (
        <>
          <div className="space-y-2">
            <Label>Gas Flow Rate (MMSCFD)</Label>
            <Input value={inputs.gasRate} onChange={e => handleInputChange('gasRate', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Liquid Flow Rate (BPD)</Label>
            <Input value={inputs.liquidRate} onChange={e => handleInputChange('liquidRate', e.target.value)} />
          </div>
        </>
      ) : (
        <div className="space-y-2 md:col-span-2">
            <Label>Required Slug Volume (bbl)</Label>
            <Input value={inputs.slugVolume} onChange={e => handleInputChange('slugVolume', e.target.value)} />
        </div>
      )}
      {inputs.vesselType.includes('3-phase') && 
        <div className="space-y-2">
          <Label>Water Cut (%)</Label>
          <Input value={inputs.waterCut} onChange={e => handleInputChange('waterCut', e.target.value)} />
        </div>
      }
      <div className="space-y-2">
        <Label>Operating Pressure (psig)</Label>
        <Input value={inputs.pressure} onChange={e => handleInputChange('pressure', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Operating Temperature (°F)</Label>
        <Input value={inputs.temperature} onChange={e => handleInputChange('temperature', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Gas Gravity (air=1)</Label>
        <Input value={inputs.gasGravity} onChange={e => handleInputChange('gasGravity', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Oil Gravity (°API)</Label>
        <Input value={inputs.oilGravity} onChange={e => handleInputChange('oilGravity', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Water Specific Gravity</Label>
        <Input value={inputs.waterGravity} onChange={e => handleInputChange('waterGravity', e.target.value)} />
      </div>
       {inputs.designType === 'separator' && 
        <div className="space-y-2">
          <Label>Liquid Retention Time (min)</Label>
          <Input value={inputs.retentionTime} onChange={e => handleInputChange('retentionTime', e.target.value)} />
        </div>
       }
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Separator & Slug Catcher Designer - Petrolord</title>
        <meta name="description" content="Design and size 2-phase/3-phase separators and slug catchers for oil and gas facilities." />
      </Helmet>
      <div className="flex flex-col h-full bg-gradient-to-br from-slate-900 to-indigo-900/50 text-white p-4 sm:p-6 lg:p-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-3 rounded-lg">
              <SeparatorIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold">Separator & Slug Catcher Designer</h1>
          </div>
        </motion.div>

        <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-1"
          >
            <Card className="bg-slate-800/50 border-slate-700 h-full">
              <CardHeader>
                <CardTitle className="text-white">Design Inputs</CardTitle>
                <CardDescription className="text-slate-400">Specify vessel type and operating conditions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div className="space-y-2">
                  <Label>Design Type</Label>
                  <Select value={inputs.designType} onValueChange={value => { handleInputChange('designType', value); setResults(null); }}>
                    <SelectTrigger className="bg-slate-900 border-slate-600">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="separator">Conventional Separator</SelectItem>
                      <SelectItem value="slug-catcher">Vessel Slug Catcher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vessel Orientation & Phases</Label>
                  <Select value={inputs.vesselType} onValueChange={value => handleInputChange('vesselType', value)}>
                    <SelectTrigger className="bg-slate-900 border-slate-600">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2-phase-h">2-Phase Horizontal</SelectItem>
                      <SelectItem value="3-phase-h">3-Phase Horizontal</SelectItem>
                      <SelectItem value="2-phase-v" disabled>2-Phase Vertical (coming soon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {renderInputFields()}

                <Button onClick={calculateSizing} className="w-full bg-purple-600 hover:bg-purple-700 mt-4">
                  <Ruler className="w-4 h-4 mr-2" /> Calculate Sizing
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:col-span-2"
          >
            <Card className="bg-slate-800/50 border-slate-700 h-full">
              <CardHeader>
                <CardTitle className="text-white">Sizing Results</CardTitle>
                <CardDescription className="text-slate-400">Estimated vessel dimensions and performance metrics.</CardDescription>
              </CardHeader>
              <CardContent>
                {results ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                        <div className="p-4 bg-slate-900/50 rounded-lg">
                            <h3 className="text-sm font-medium text-slate-400">Vessel Diameter</h3>
                            <p className="text-4xl font-bold text-purple-300">{results.diameter} <span className="text-lg">ft</span></p>
                        </div>
                        <div className="p-4 bg-slate-900/50 rounded-lg">
                            <h3 className="text-sm font-medium text-slate-400">Seam-to-Seam Length</h3>
                            <p className="text-4xl font-bold text-purple-300">{results.seamToSeamLength} <span className="text-lg">ft</span></p>
                        </div>
                        <div className="p-4 bg-slate-900/50 rounded-lg">
                            <h3 className="text-sm font-medium text-slate-400">L/D Ratio</h3>
                            <p className="text-4xl font-bold text-purple-300">{results.ldRatio}</p>
                        </div>
                    </div>
                    
                    <SeparatorVisual diameter={results.diameter} length={results.seamToSeamLength} type={inputs.vesselType} />

                    <div className="p-4 bg-slate-900/50 rounded-lg space-y-2">
                        <h4 className="font-semibold text-white">Engineering Details</h4>
                        <div className="flex justify-between items-center text-sm">
                            <p className="text-slate-300">Max. Allowable Gas Velocity:</p>
                            <p className="font-mono text-cyan-300">{results.terminalVelocity} ft/s</p>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <p className="text-slate-300">Calculated Gas Density:</p>
                            <p className="font-mono text-cyan-300">{results.gasDensity} lb/ft³</p>
                        </div>
                         <div className="flex justify-between items-center text-sm">
                            <p className="text-slate-300">Calculated Liquid Density:</p>
                            <p className="font-mono text-cyan-300">{results.liquidDensity} lb/ft³</p>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500 text-center pt-4">
                        <p>Disclaimer: These are preliminary sizing estimates for conceptual studies. Final design requires detailed engineering and simulation.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-10">
                    <Waves className="w-16 h-16 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Results will appear here</h3>
                    <p>Enter your design inputs and click "Calculate Sizing" to see the estimated vessel dimensions.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default SeparatorSlugCatcherDesigner;