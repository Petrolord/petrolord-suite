
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrainCircuit, LineChart, Activity, Layers, Play } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { prepareDataForML, trainModel, evaluateModel, predict, calculateCorrelationMatrix } from '@/utils/petrophysicsML';

const AnalyticsPanel = ({ petroState }) => {
    const { wells, activeWellId } = petroState;
    const { toast } = useToast();
    const activeWell = wells.find(w => w.id === activeWellId);

    const [modelConfig, setModelConfig] = useState({
        target: 'PHIE',
        features: ['GR', 'RHOB', 'NPHI', 'DT'],
        modelType: 'linear',
        trainSplit: 80,
        regularization: 0.1
    });

    const [results, setResults] = useState(null);
    const [isTraining, setIsTraining] = useState(false);

    // -- Handlers --

    const toggleFeature = (feature) => {
        setModelConfig(prev => {
            const newFeatures = prev.features.includes(feature)
                ? prev.features.filter(f => f !== feature)
                : [...prev.features, feature];
            return { ...prev, features: newFeatures };
        });
    };

    const handleRunAnalysis = async () => {
        if (!activeWell) return;
        setIsTraining(true);
        try {
            // 1. Prepare Data
            const { X, y, meta } = prepareDataForML([activeWell], modelConfig.features, modelConfig.target);
            
            if (X.length < 10) throw new Error("Not enough valid data points. Check your curves and null values.");

            // 2. Train/Test Split
            const splitIdx = Math.floor(X.length * (modelConfig.trainSplit / 100));
            const X_train = X.slice(0, splitIdx);
            const y_train = y.slice(0, splitIdx);
            const X_test = X.slice(splitIdx);
            const y_test = y.slice(splitIdx);
            const meta_test = meta.slice(splitIdx);

            // 3. Train Model
            const model = await trainModel(X_train, y_train, modelConfig.modelType, { lambda: modelConfig.regularization });

            // 4. Predict
            const y_pred_train = predict(model, X_train);
            const y_pred_test = predict(model, X_test);

            // 5. Evaluate
            const trainMetrics = evaluateModel(y_train, y_pred_train);
            const testMetrics = evaluateModel(y_test, y_pred_test);

            // 6. Correlation Matrix (on all data)
            const corr = calculateCorrelationMatrix(X, modelConfig.features);

            setResults({
                trainMetrics,
                testMetrics,
                predictions: y_pred_test,
                actuals: y_test,
                meta: meta_test,
                featureImportance: model.coefficients.slice(1), // Ignore bias
                correlationData: corr
            });

            toast({ title: "Analysis Complete", description: `R² Score: ${testMetrics.r2.toFixed(3)}` });

        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Training Failed", description: error.message });
        } finally {
            setIsTraining(false);
        }
    };

    // -- Render Helpers --

    const renderMetrics = (metrics, title) => (
        <div className="bg-slate-900 p-3 rounded border border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">{title}</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                    <div className="text-xs text-slate-500">R²</div>
                    <div className="text-lg font-mono text-white">{metrics.r2.toFixed(3)}</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500">RMSE</div>
                    <div className="text-lg font-mono text-white">{metrics.rmse.toFixed(3)}</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500">MAE</div>
                    <div className="text-lg font-mono text-white">{metrics.mae.toFixed(3)}</div>
                </div>
            </div>
        </div>
    );

    const featureOptions = ['GR', 'RHOB', 'NPHI', 'DT', 'RES_DEEP', 'RES_MED', 'SP', 'CALI'];

    return (
        <div className="h-full p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
            {/* Sidebar: Config */}
            <Card className="lg:col-span-3 h-full bg-slate-950 border-slate-800 flex flex-col overflow-y-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                        <BrainCircuit className="w-5 h-5 text-purple-400" /> ML Studio
                    </CardTitle>
                    <CardDescription className="text-slate-400">Predict petrophysical properties</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 flex-1">
                    <div className="space-y-2">
                        <Label className="text-slate-200">Target Variable (Y)</Label>
                        <Select value={modelConfig.target} onValueChange={v => setModelConfig({...modelConfig, target: v})}>
                            <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PHIE">Porosity (PHIE)</SelectItem>
                                <SelectItem value="SW">Saturation (SW)</SelectItem>
                                <SelectItem value="PERM">Permeability (K)</SelectItem>
                                <SelectItem value="VSH">Shale Volume (VSH)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-200">Input Features (X)</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {featureOptions.map(f => (
                                <div key={f} className="flex items-center space-x-2">
                                    <Checkbox id={`feat-${f}`} checked={modelConfig.features.includes(f)} onCheckedChange={() => toggleFeature(f)} />
                                    <label htmlFor={`feat-${f}`} className="text-xs text-slate-300 cursor-pointer">{f}</label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-200">Algorithm</Label>
                        <Select value={modelConfig.modelType} onValueChange={v => setModelConfig({...modelConfig, modelType: v})}>
                            <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="linear">Linear Regression</SelectItem>
                                <SelectItem value="ridge">Ridge Regression (L2)</SelectItem>
                                <SelectItem value="random_forest">Random Forest (Sim)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <Label className="text-slate-200">Train/Test Split</Label>
                            <span className="text-xs text-slate-400">{modelConfig.trainSplit}% / {100-modelConfig.trainSplit}%</span>
                        </div>
                        <input 
                            type="range" min="50" max="90" step="5" 
                            value={modelConfig.trainSplit} 
                            onChange={(e) => setModelConfig({...modelConfig, trainSplit: parseInt(e.target.value)})}
                            className="w-full accent-purple-500"
                        />
                    </div>

                    <Button onClick={handleRunAnalysis} disabled={isTraining || !activeWell} className="w-full bg-purple-600 hover:bg-purple-500 mt-4">
                        {isTraining ? 'Training...' : <><Play className="w-4 h-4 mr-2"/> Train Model</>}
                    </Button>
                </CardContent>
            </Card>

            {/* Main Content */}
            <div className="lg:col-span-9 h-full flex flex-col gap-4 min-h-0">
                {results ? (
                    <Tabs defaultValue="performance" className="flex-1 flex flex-col min-h-0">
                        <TabsList className="bg-slate-900 border-slate-800 w-full justify-start">
                            <TabsTrigger value="performance" className="flex gap-2"><Activity className="w-4 h-4"/> Performance</TabsTrigger>
                            <TabsTrigger value="predictions" className="flex gap-2"><LineChart className="w-4 h-4"/> Predictions</TabsTrigger>
                            <TabsTrigger value="correlations" className="flex gap-2"><Layers className="w-4 h-4"/> Feature Analysis</TabsTrigger>
                        </TabsList>

                        <TabsContent value="performance" className="flex-1 min-h-0 space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                {renderMetrics(results.trainMetrics, "Training Set Metrics")}
                                {renderMetrics(results.testMetrics, "Test Set Metrics (Validation)")}
                            </div>
                            <Card className="flex-1 bg-slate-900 border-slate-800 min-h-0">
                                <CardHeader className="py-2"><CardTitle className="text-sm text-slate-300">Actual vs Predicted</CardTitle></CardHeader>
                                <CardContent className="h-[400px]">
                                    <div className="flex items-center justify-center w-full h-full text-slate-500">Chart removed</div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="predictions" className="flex-1 min-h-0 pt-4">
                            <Card className="h-full bg-slate-900 border-slate-800 flex flex-col">
                                <CardHeader className="py-2"><CardTitle className="text-sm text-slate-300">Prediction Log Plot</CardTitle></CardHeader>
                                <CardContent className="flex-1 min-h-0">
                                    <div className="flex items-center justify-center w-full h-full text-slate-500">Chart removed</div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="correlations" className="flex-1 min-h-0 pt-4 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Card className="bg-slate-900 border-slate-800">
                                    <CardHeader className="py-2"><CardTitle className="text-sm text-slate-300">Feature Importance</CardTitle></CardHeader>
                                    <CardContent className="h-[300px]">
                                        <div className="flex items-center justify-center w-full h-full text-slate-500">Chart removed</div>
                                    </CardContent>
                                </Card>

                                {results.correlationData && (
                                    <Card className="bg-slate-900 border-slate-800">
                                        <CardHeader className="py-2"><CardTitle className="text-sm text-slate-300">Correlation Matrix</CardTitle></CardHeader>
                                        <CardContent className="h-[300px]">
                                            <div className="flex items-center justify-center w-full h-full text-slate-500">Chart removed</div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-800 rounded-lg bg-slate-900/30">
                        <div className="text-center max-w-md p-6">
                            <BrainCircuit className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-slate-300">Advanced Analytics Engine</h3>
                            <p className="text-slate-500 mt-2 mb-6">
                                Select a target property and input features to train a predictive model. 
                                Use this to fill missing log sections or predict properties (like Permeability) from basic logs.
                            </p>
                            <Button variant="outline" onClick={handleRunAnalysis} disabled={!activeWell} className="border-slate-700 text-slate-300">
                                Start Experiment
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AnalyticsPanel;
