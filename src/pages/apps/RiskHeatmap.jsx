import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Filter, FileText, AlertTriangle, 
  TrendingUp, ShieldAlert, CheckCircle2, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';

// --- MOCK DATA ---
const MOCK_RISKS = [
  { id: 'RSK-001', title: 'Supply Chain Disruption', category: 'Operational', owner: 'John Doe', status: 'Open', probability: 4, impact: 4, history: [], mitigation: 'Identify secondary suppliers.' },
  { id: 'RSK-002', title: 'Cybersecurity Breach', category: 'IT', owner: 'Jane Smith', status: 'Open', probability: 3, impact: 5, history: [], mitigation: 'Implement advanced threat protection.' },
  { id: 'RSK-003', title: 'Regulatory Change', category: 'Compliance', owner: 'Alice Johnson', status: 'Mitigated', probability: 5, impact: 3, history: [], mitigation: 'Continuous monitoring of regulations.' },
  { id: 'RSK-004', title: 'Equipment Failure', category: 'Operational', owner: 'Bob Brown', status: 'Open', probability: 2, impact: 4, history: [], mitigation: 'Predictive maintenance schedule.' },
  { id: 'RSK-005', title: 'Market Volatility', category: 'Financial', owner: 'Charlie Davis', status: 'Open', probability: 4, impact: 3, history: [], mitigation: 'Hedging strategies.' },
  { id: 'RSK-006', title: 'Safety Incident', category: 'HSE', owner: 'Diana Evans', status: 'Closed', probability: 1, impact: 5, history: [], mitigation: 'Strict safety protocols.' },
  { id: 'RSK-007', title: 'Data Loss', category: 'IT', owner: 'Jane Smith', status: 'Open', probability: 2, impact: 3, history: [], mitigation: 'Automated daily backups.' },
  { id: 'RSK-008', title: 'Key Personnel Turnover', category: 'HR', owner: 'Eve Foster', status: 'Open', probability: 3, impact: 3, history: [], mitigation: 'Retention programs and succession planning.' },
  { id: 'RSK-009', title: 'Environmental Spill', category: 'HSE', owner: 'Diana Evans', status: 'Open', probability: 1, impact: 4, history: [], mitigation: 'Secondary containment systems.' },
  { id: 'RSK-010', title: 'Supplier Bankruptcy', category: 'Operational', owner: 'John Doe', status: 'Open', probability: 2, impact: 5, history: [], mitigation: 'Financial health monitoring of critical suppliers.' },
];

const TREND_DATA = [
  { month: 'Jan', high: 4, medium: 8, low: 15 },
  { month: 'Feb', high: 5, medium: 7, low: 16 },
  { month: 'Mar', high: 3, medium: 9, low: 14 },
  { month: 'Apr', high: 3, medium: 8, low: 17 },
  { month: 'May', high: 2, medium: 10, low: 15 },
  { month: 'Jun', high: 2, medium: 6, low: 18 },
];

const CATEGORIES = ['All', 'Operational', 'IT', 'Compliance', 'Financial', 'HSE', 'HR'];
const STATUSES = ['All', 'Open', 'Mitigated', 'Closed'];

export default function RiskHeatmap() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);

  // Filter risks
  const filteredRisks = useMemo(() => {
    return MOCK_RISKS.filter(r => {
      const matchCat = filterCategory === 'All' || r.category === filterCategory;
      const matchStat = filterStatus === 'All' || r.status === filterStatus;
      return matchCat && matchStat;
    });
  }, [filterCategory, filterStatus]);

  // Aggregate risks into matrix cells
  const getMatrixData = () => {
    const matrix = Array(5).fill(0).map(() => Array(5).fill(0));
    filteredRisks.forEach(r => {
      // Impact (y) is 1-5, Probability (x) is 1-5
      // Array indices: row = 5 - impact, col = prob - 1
      if (r.impact >= 1 && r.impact <= 5 && r.probability >= 1 && r.probability <= 5) {
        matrix[5 - r.impact][r.probability - 1]++;
      }
    });
    return matrix;
  };

  const matrixData = getMatrixData();

  const getCellColor = (prob, impact) => {
    const score = prob * impact;
    if (score >= 15) return 'bg-red-500 hover:bg-red-600 text-white';
    if (score >= 8) return 'bg-amber-400 hover:bg-amber-500 text-amber-950';
    if (score >= 4) return 'bg-yellow-300 hover:bg-yellow-400 text-yellow-950';
    return 'bg-green-500 hover:bg-green-600 text-white';
  };

  const handleExport = (type) => {
    toast({
      title: "Export Started",
      description: `🚧 This feature isn't implemented yet—but don't worry! You can request ${type} export in your next prompt! 🚀`,
    });
  };

  const handleCellClick = (prob, impact) => {
    const risksInCell = filteredRisks.filter(r => r.probability === prob && r.impact === impact);
    if (risksInCell.length > 0) {
      setSelectedCell({ prob, impact, risks: risksInCell });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="flex-none bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/assurance')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                Risk Heatmap
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Visualize and analyze organizational risk exposure
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => handleExport('CSV')}>
              <FileText className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={() => handleExport('PDF')}>
              <Download className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          
          {/* Left Column: Controls & Matrix */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filter Risks
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Category</label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="bg-white dark:bg-slate-950 dark:text-slate-100">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="bg-white dark:bg-slate-950 dark:text-slate-100">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Matrix */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Assessment Matrix</CardTitle>
                <CardDescription>Click on a cell to view specific risks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex">
                  {/* Y-Axis Label */}
                  <div className="flex flex-col justify-center items-center mr-4">
                    <span className="text-sm font-semibold text-slate-500 -rotate-90 whitespace-nowrap tracking-widest uppercase">
                      Impact
                    </span>
                  </div>
                  
                  <div className="flex-1 flex flex-col">
                    {/* Matrix Grid */}
                    <div className="grid grid-rows-5 gap-1 mb-2">
                      {[5, 4, 3, 2, 1].map((impact, rowIndex) => (
                        <div key={`row-${impact}`} className="flex items-center gap-1">
                          <div className="w-6 text-xs text-right text-slate-500 pr-2">{impact}</div>
                          <div className="grid grid-cols-5 gap-1 flex-1">
                            {[1, 2, 3, 4, 5].map((prob, colIndex) => {
                              const count = matrixData[rowIndex][colIndex];
                              return (
                                <button
                                  key={`cell-${prob}-${impact}`}
                                  onClick={() => handleCellClick(prob, impact)}
                                  disabled={count === 0}
                                  className={`
                                    h-16 rounded-md flex items-center justify-center text-lg font-bold transition-all
                                    ${getCellColor(prob, impact)}
                                    ${count === 0 ? 'opacity-30 cursor-not-allowed' : 'shadow-sm ring-1 ring-inset ring-black/10'}
                                  `}
                                >
                                  {count > 0 ? count : ''}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* X-Axis Labels */}
                    <div className="flex ml-7">
                      <div className="grid grid-cols-5 gap-1 flex-1 text-center text-xs text-slate-500">
                        <div>1</div><div>2</div><div>3</div><div>4</div><div>5</div>
                      </div>
                    </div>
                    <div className="text-center mt-2">
                      <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
                        Probability
                      </span>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-6 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-500"></div><span className="text-sm text-slate-600">Low</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-300"></div><span className="text-sm text-slate-600">Moderate</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-amber-400"></div><span className="text-sm text-slate-600">High</span></div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-500"></div><span className="text-sm text-slate-600">Critical</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Analytics & List */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Risk Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={TREND_DATA} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="month" tick={{fontSize: 12}} />
                      <YAxis tick={{fontSize: 12}} />
                      <RechartsTooltip />
                      <Legend wrapperStyle={{fontSize: '12px'}}/>
                      <Line type="monotone" dataKey="high" name="High Risk" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="medium" name="Medium Risk" stroke="#f59e0b" strokeWidth={2} />
                      <Line type="monotone" dataKey="low" name="Low Risk" stroke="#22c55e" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-slate-500" />
                  Top Risks
                </CardTitle>
                <CardDescription>Highest scored risks currently open</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredRisks
                    .filter(r => r.status === 'Open')
                    .sort((a, b) => (b.probability * b.impact) - (a.probability * a.impact))
                    .slice(0, 5)
                    .map(risk => (
                      <div 
                        key={risk.id} 
                        className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedRisk(risk)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate pr-2">{risk.title}</h4>
                          <Badge variant="outline" className={`
                            ${risk.probability * risk.impact >= 15 ? 'bg-red-50 text-red-700 border-red-200' : 
                              risk.probability * risk.impact >= 8 ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                              'bg-green-50 text-green-700 border-green-200'}
                          `}>
                            {risk.probability * risk.impact}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center text-xs text-slate-500">
                          <span>{risk.id} • {risk.category}</span>
                          <span>{risk.owner}</span>
                        </div>
                      </div>
                  ))}
                  {filteredRisks.length === 0 && (
                    <div className="text-center py-6 text-slate-500 text-sm">
                      No risks found for current filters.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {/* Cell Drill-down Dialog */}
      <Dialog open={!!selectedCell} onOpenChange={() => setSelectedCell(null)}>
        <DialogContent className="sm:max-w-[600px] bg-white dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle>
              Risks at Probability {selectedCell?.prob}, Impact {selectedCell?.impact}
            </DialogTitle>
            <DialogDescription>
              {selectedCell?.risks.length} risk(s) identified in this zone.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2 mt-4">
            {selectedCell?.risks.map(risk => (
              <div key={risk.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">{risk.title}</h4>
                    <p className="text-xs text-slate-500">{risk.id} • {risk.category}</p>
                  </div>
                  <Badge variant={risk.status === 'Open' ? 'default' : 'secondary'}>{risk.status}</Badge>
                </div>
                <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                  <strong>Mitigation:</strong> {risk.mitigation}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => {
                    setSelectedCell(null);
                    setSelectedRisk(risk);
                  }}>
                    View Full Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Risk Details Dialog */}
      <Dialog open={!!selectedRisk} onOpenChange={() => setSelectedRisk(null)}>
        <DialogContent className="sm:max-w-[600px] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          {selectedRisk && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <Badge variant="outline" className="mb-2">{selectedRisk.id}</Badge>
                  <Badge variant={selectedRisk.status === 'Open' ? 'destructive' : 'secondary'}>
                    {selectedRisk.status}
                  </Badge>
                </div>
                <DialogTitle className="text-xl">{selectedRisk.title}</DialogTitle>
                <DialogDescription>
                  Managed by {selectedRisk.owner}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 my-4">
                <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-md text-center">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Probability</div>
                  <div className="text-2xl font-bold">{selectedRisk.probability}/5</div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-md text-center">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Impact</div>
                  <div className="text-2xl font-bold">{selectedRisk.impact}/5</div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-semibold mb-1 flex items-center gap-2">
                    <Info className="h-4 w-4" /> Category
                  </h5>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{selectedRisk.category}</p>
                </div>
                <div>
                  <h5 className="text-sm font-semibold mb-1 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Mitigation Plan
                  </h5>
                  <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-800">
                    {selectedRisk.mitigation}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setSelectedRisk(null)}>Close</Button>
                <Button onClick={() => toast({ title: "Action Scheduled", description: "🚧 Edit functionality is under construction. 🚀" })}>
                  Edit Risk
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}