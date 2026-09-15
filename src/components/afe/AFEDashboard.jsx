import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart, Area, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Activity, AlertCircle, PieChart as PieIcon, CalendarClock, BarChart2 } from 'lucide-react';
import {
  AfeInputError, calculateMetrics, generateSCurveData, itemForecast,
} from '@/utils/costControlCalculations';

// EC5-0 (owner decision 2026-09-14). The engine reads the clock only as the
// default of its asOf argument; the dashboard passes today explicitly, as a
// local calendar date, so "on the start day" means the user's start day.
export const todayIsoDate = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const NEUTRAL_TILE = 'text-slate-400 bg-slate-400';

const hasWindow = (afe) => Boolean(afe?.start_date && afe?.end_date)
  && !Number.isNaN(Date.parse(afe.start_date)) && !Number.isNaN(Date.parse(afe.end_date));

// The SPI tile. An AFE without dates falls back to time progress 1 in the
// engine, which is a documented fallback and not a measurement, so SPI is
// labelled unavailable there. SPI null (no planned value yet, before or on
// the start day) reads "Not started" with no verdict and no colour.
// EC5-3 (engines #185): SPI is also null with no budget at all, and the
// engine says which case it is in `spiStatus`; that reads N/A with the reason.
export const spiTile = (afe, metrics) => {
  if (!hasWindow(afe)) {
    return { value: 'Unavailable', subtext: 'Add start and end dates to measure schedule', colorClass: NEUTRAL_TILE };
  }
  if (metrics.spi == null) {
    if (metrics.spiStatus === 'no-budget') {
      return { value: 'N/A', subtext: 'No budget to measure schedule against', colorClass: NEUTRAL_TILE };
    }
    return { value: 'Not started', subtext: 'No planned value before the start date', colorClass: NEUTRAL_TILE };
  }
  return {
    value: metrics.spi.toFixed(2),
    subtext: metrics.spi >= 1 ? 'Ahead of Schedule' : 'Behind Schedule',
    colorClass: metrics.spi >= 1 ? 'text-green-400 bg-green-400' : 'text-red-400 bg-red-400',
  };
};

// The CPI tile (EC5 CPI item, engines #185). CPI is null when nothing has
// been spent, with `cpiStatus` 'no-spend'; it used to read 1.00 "Under
// Budget" whatever had been earned.
export const cpiTile = (metrics) => {
  if (metrics.cpi == null || !Number.isFinite(metrics.cpi)) {
    return {
      value: 'N/A',
      subtext: metrics.cpiStatus === 'no-spend' ? 'Nothing spent yet, so no cost efficiency' : 'Cost efficiency not available',
      colorClass: NEUTRAL_TILE,
    };
  }
  return {
    value: metrics.cpi.toFixed(2),
    subtext: metrics.cpi >= 1 ? 'Under Budget' : 'Over Budget',
    colorClass: metrics.cpi >= 1 ? 'text-green-400 bg-green-400' : 'text-red-400 bg-red-400',
  };
};

/** The EAC trend against budget in percent, or null with no budget to divide by. */
export const eacTrendPct = (metrics) => (metrics.totalBudget > 0
  ? ((metrics.totalForecast - metrics.totalBudget) / metrics.totalBudget * 100).toFixed(1)
  : null);

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const KPICard = ({ title, value, subtext, icon: Icon, colorClass, trend }) => (
  <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
    <CardContent className="p-5">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
          <h3 className="text-xl font-bold text-white mt-1">{value}</h3>
        </div>
        <div className={`p-2 rounded-lg bg-opacity-10 ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">{subtext}</span>
        {trend && (
            <span className={`text-xs font-bold ${trend > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {trend > 0 ? '+' : ''}{trend}%
            </span>
        )}
      </div>
    </CardContent>
  </Card>
);

const AFEDashboard = ({ afe, costItems, invoices }) => {
  const currencyFormatter = (value) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: afe?.currency || 'USD', notation: 'compact' }).format(value);

  const asOf = todayIsoDate();
  const { metrics, sCurveData, inputError } = useMemo(() => {
    try {
      return {
        metrics: calculateMetrics(afe, costItems, invoices, asOf),
        sCurveData: generateSCurveData(afe, costItems, invoices, asOf),
        inputError: null,
      };
    } catch (err) {
      if (err instanceof AfeInputError || err?.name === 'AfeInputError') {
        return { metrics: null, sCurveData: [], inputError: err.message };
      }
      throw err;
    }
  }, [afe, costItems, invoices, asOf]);

  // Chart Data: Budget vs Actual by Category
  const categoryData = useMemo(() => {
    const cats = {};
    costItems.forEach(item => {
      const cat = item.category || 'General';
      if (!cats[cat]) cats[cat] = { name: cat, Budget: 0, Actual: 0, Forecast: 0 };
      cats[cat].Budget += Number(item.budget) || 0;
      cats[cat].Actual += Number(item.actual) || 0;
      cats[cat].Forecast += itemForecast(item);
    });
    return Object.entries(cats).map(([name, data]) => ({ name, ...data }));
  }, [costItems]);

  // Top 5 Variances
  const topVariances = useMemo(() => {
    return [...costItems]
      .map(item => ({
        ...item,
        // Budget less the one EAC rule (itemForecast), as on every AFE screen.
        varianceVal: (Number(item.budget)||0) - itemForecast(item)
      }))
      .sort((a, b) => Math.abs(b.varianceVal) - Math.abs(a.varianceVal))
      .slice(0, 5);
  }, [costItems]);

  if (inputError) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
        <span>The dashboard cannot be calculated: {inputError}</span>
      </div>
    );
  }

  const spi = spiTile(afe, metrics);
  const cpi = cpiTile(metrics);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* EC6-1: an invoice with no date used to be placed on the S-curve at
          the first of January 1970, so it counted in every bucket and
          inflated the actual spend from day one of the AFE. Those invoices
          are off the curve now, and the dashboard asks for their dates
          rather than quietly leaving the money out. */}
      {metrics.undatedInvoices > 0 ? (
        <div role="status" className="flex items-start gap-2 rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
          <span>
            {metrics.undatedInvoices} invoice{metrics.undatedInvoices === 1 ? ' has' : 's have'} no
            date, so {metrics.undatedInvoices === 1 ? 'it is' : 'they are'} not on the S-curve.
            Date {metrics.undatedInvoices === 1 ? 'it' : 'them'} on the Invoices tab to see the
            spend in the right month.
          </span>
        </div>
      ) : null}

      {/* Row 1: Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard 
          title="Control Budget" 
          value={currencyFormatter(metrics.totalBudget)} 
          subtext="Original + Approved Changes"
          icon={DollarSign}
          colorClass="text-blue-400 bg-blue-400"
        />
        <KPICard 
          title="Commitments" 
          value={currencyFormatter(metrics.totalCommitments)} 
          subtext="Open POs + Contracts"
          icon={Activity}
          colorClass="text-amber-400 bg-amber-400"
        />
        <KPICard 
          title="Actual Cost (VOWD)" 
          value={currencyFormatter(metrics.totalActuals)} 
          subtext={`${metrics.percentSpent.toFixed(1)}% of Budget`}
          icon={BarChart2}
          colorClass="text-purple-400 bg-purple-400"
        />
        <KPICard 
          title="EAC (Forecast)" 
          value={currencyFormatter(metrics.totalForecast)} 
          subtext={`Variance: ${currencyFormatter(metrics.variance)}`}
          icon={TrendingUp}
          colorClass="text-cyan-400 bg-cyan-400"
          trend={eacTrendPct(metrics)}
        />
        <KPICard
          title="CPI (Cost Efficiency)"
          value={cpi.value}
          subtext={cpi.subtext}
          icon={PieIcon}
          colorClass={cpi.colorClass}
        />
        <KPICard 
          title="SPI (Schedule Efficiency)" 
          value={spi.value}
          subtext={spi.subtext}
          icon={CalendarClock}
          colorClass={spi.colorClass}
        />
      </div>

      {/* Row 2: Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* S-Curve */}
        <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
            <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-200 flex justify-between">
                    <span>Cumulative Spend (S-Curve)</span>
                    <span className="text-slate-500 text-xs font-normal">Planned vs Actual vs Forecast</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={sCurveData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#94a3b8" tickFormatter={(val) => `$${val/1000}k`} style={{ fontSize: '12px' }} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                            formatter={(value) => currencyFormatter(value)}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        <Area type="monotone" dataKey="Planned" stroke="#3b82f6" fill="url(#colorPlanned)" strokeWidth={2} />
                        <Line type="monotone" dataKey="Actual" stroke="#a855f7" strokeWidth={3} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="Forecast" stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={2} />
                        <defs>
                            <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                    </ComposedChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* Cost Breakdown Pie */}
        <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-200">Cost Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            fill="#8884d8"
                            paddingAngle={5}
                            dataKey="Actual"
                        >
                            {categoryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => currencyFormatter(value)} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
      </div>

      {/* Row 3: Breakdown & Variances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Category Bar Chart */}
         <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-200">Budget vs Actual by Category</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                        <XAxis type="number" stroke="#94a3b8" tickFormatter={(val) => `$${val/1000}k`} style={{ fontSize: '10px' }} />
                        <YAxis dataKey="name" type="category" stroke="#94a3b8" width={100} style={{ fontSize: '11px' }} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff' }} 
                            formatter={(value) => currencyFormatter(value)}
                        />
                        <Legend />
                        <Bar dataKey="Budget" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={10} />
                        <Bar dataKey="Actual" fill="#a855f7" radius={[0, 4, 4, 0]} barSize={10} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* Top Variances List */}
        <Card className="bg-slate-900 border-slate-800 flex flex-col">
            <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-200">Top 5 Cost Variances</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
                <div className="space-y-4">
                    {topVariances.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between border-b border-slate-800 pb-2 last:border-0">
                            <div className="flex-1">
                                <p className="text-sm font-medium text-white truncate">{item.description || item.code}</p>
                                <p className="text-xs text-slate-500">{item.category} • {item.vendor || 'No Vendor'}</p>
                            </div>
                            <div className="text-right">
                                <p className={`text-sm font-mono font-bold ${item.varianceVal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {item.varianceVal > 0 ? '+' : ''}{currencyFormatter(item.varianceVal)}
                                </p>
                                <p className="text-xs text-slate-500">Var</p>
                            </div>
                        </div>
                    ))}
                    {topVariances.length === 0 && <div className="text-center text-slate-500 py-10">No significant variances.</div>}
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AFEDashboard;