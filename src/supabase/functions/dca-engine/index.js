/* global Deno */
import { corsHeaders } from '../_shared/cors.ts'

// --- Helper: Date Handling ---
function robustDateParse(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  
  // Try standard ISO format first
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) return date;

  // Try common non-standard formats (e.g., from Excel)
  // Handles 'MM/DD/YYYY', 'M/D/YYYY', etc.
  const parts = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (parts) {
    const year = parseInt(parts[3], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    date = new Date(year < 100 ? 2000 + year : year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  return null; // Return null if all parsing fails
}

function dateDiffInDays(a, b) {
  const _MS_PER_DAY = 1000 * 60 * 60 * 24;
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utc2 - utc1) / _MS_PER_DAY);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// --- Core Decline Curve Models ---
function exponentialDecline(qi, Di, t) {
  return qi * Math.exp(-Di * t);
}

function hyperbolicDecline(qi, Di, b, t) {
  return qi / Math.pow(1 + b * Di * t, 1 / b);
}

function harmonicDecline(qi, Di, t) {
  return qi / (1 + Di * t);
}

// --- Core Analysis Function ---
function analyzeDeclineCurve(config, data) {
  const notes = [];

  // 1. Data Cleaning and Preparation
  let processedData = data
    .map(d => ({ ...d, date: robustDateParse(d.time), rate: Number(d.rate) }))
    .filter(d => d.date && !isNaN(d.date.getTime()) && typeof d.rate === 'number' && !isNaN(d.rate) && d.rate > 0)
    .sort((a, b) => a.date - b.date);

  if (processedData.length < 5) {
    throw new Error("Insufficient valid data points for analysis (minimum 5 required). Check date and rate columns.");
  }

  const startDate = processedData[0].date;
  processedData = processedData.map(d => ({ ...d, t: dateDiffInDays(startDate, d.date) }));

  // 2. Apply Fit Window
  let fitData = processedData;
  if (config.fit_start_date) {
    const fitStartDate = robustDateParse(config.fit_start_date);
    if (fitStartDate) {
      fitData = fitData.filter(d => d.date >= fitStartDate);
      notes.push(`Fit window started at ${config.fit_start_date}.`);
    }
  }
  if (config.fit_end_date) {
    const fitEndDate = robustDateParse(config.fit_end_date);
    if(fitEndDate) {
      fitData = fitData.filter(d => d.date <= fitEndDate);
      notes.push(`Fit window ended at ${config.fit_end_date}.`);
    }
  }
  
  if (fitData.length < 3) {
    throw new Error("Not enough data in the selected fit window.");
  }

  // 3. Find Best Fit (Simplified Grid Search for Hyperbolic)
  const qi_initial = fitData[0].rate;
  let bestFit = {
    model: 'exponential',
    b: 0,
    Di: 0,
    qi: qi_initial,
    sse: Infinity,
  };

  // Exponential fit (linear regression on log(rate))
  const logRates = fitData.map(p => Math.log(p.rate));
  const t_avg = fitData.reduce((sum, p) => sum + p.t, 0) / fitData.length;
  const logRate_avg = logRates.reduce((sum, r) => sum + r, 0) / logRates.length;
  const numerator = fitData.reduce((sum, p, i) => sum + (p.t - t_avg) * (logRates[i] - logRate_avg), 0);
  const denominator = fitData.reduce((sum, p) => sum + Math.pow(p.t - t_avg, 2), 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = logRate_avg - slope * t_avg;
  
  const Di_exp = -slope;
  const qi_exp = Math.exp(intercept);
  const sse_exp = fitData.reduce((sum, p) => sum + Math.pow(p.rate - exponentialDecline(qi_exp, Di_exp, p.t), 2), 0);
  
  bestFit = { model: 'exponential', b: 0, Di: Di_exp, qi: qi_exp, sse: sse_exp };
  notes.push(`Exponential fit calculated with SSE: ${sse_exp.toExponential(3)}`);

  // Hyperbolic/Harmonic Grid Search
  if (config.decline_model === 'HYPERBOLIC' || config.decline_model === 'HARMONIC' || config.decline_model === 'AUTO') {
    const b_values = [];
    if (config.decline_model === 'HARMONIC') {
      b_values.push(1.0);
    } else {
      for (let b = config.b_min; b <= config.b_max; b += config.b_step) {
        b_values.push(b);
      }
    }

    for (const b of b_values) {
      const p2 = fitData[fitData.length - 1];
      if (p2.t === 0) continue;

      let Di_hyp;
      if (b > 0.01 && b < 0.99) { // Hyperbolic
        Di_hyp = (Math.pow(qi_initial / p2.rate, b) - 1) / (b * p2.t);
      } else if (b >= 0.99) { // Harmonic
        Di_hyp = (qi_initial / p2.rate - 1) / p2.t;
      } else {
        continue;
      }

      if (Di_hyp <= 0 || !isFinite(Di_hyp)) continue;

      const sse_hyp = fitData.reduce((sum, p) => sum + Math.pow(p.rate - hyperbolicDecline(qi_initial, Di_hyp, b, p.t), 2), 0);
      
      if (sse_hyp < bestFit.sse) {
        bestFit = { model: b >= 0.99 ? 'harmonic' : 'hyperbolic', b: b, Di: Di_hyp, qi: qi_initial, sse: sse_hyp };
      }
    }
    notes.push(`Grid search completed. Best SSE: ${bestFit.sse.toExponential(3)}`);
  }

  if (config.decline_model !== 'AUTO') {
    bestFit.model = config.decline_model.toLowerCase();
    notes.push(`User forced model: ${bestFit.model}`);
  } else {
    notes.push(`Auto-selected model: ${bestFit.model}`);
  }

  const { model, qi, Di, b } = bestFit;

  // 4. Generate Forecast
  const lastHistDate = processedData[processedData.length - 1].date;
  const forecastStart_t = dateDiffInDays(startDate, lastHistDate);
  const forecastDaysArray = Array.from({ length: config.forecast_days + 1 }, (_, i) => i);
  
  const forecastDates = [];
  const forecastRates = [];

  forecastDaysArray.forEach(dayOffset => {
    const t = forecastStart_t + dayOffset;
    const forecastDate = addDays(startDate, t);
    
    let rate;
    if (model === 'exponential') rate = exponentialDecline(qi, Di, t);
    else if (model === 'harmonic') rate = harmonicDecline(qi, Di, t);
    else rate = hyperbolicDecline(qi, Di, b, t);
    
    forecastDates.push(forecastDate.toISOString().split('T')[0]);
    forecastRates.push(rate > 0 ? rate : 0);
  });
  
  const historyDates = processedData.map(d => d.date.toISOString().split('T')[0]);
  const historyRates = processedData.map(d => d.rate);

  // 5. Calculate KPIs
  const total_sum = fitData.reduce((sum, p) => sum + p.rate, 0);
  const mean_rate = total_sum / fitData.length;
  const ss_tot = fitData.reduce((sum, p) => sum + Math.pow(p.rate - mean_rate, 2), 0);
  const r_squared = 1 - (bestFit.sse / ss_tot);
  const rmse = Math.sqrt(bestFit.sse / fitData.length);

  let t_econ_days = Infinity;
  const t_initial = dateDiffInDays(startDate, fitData[0].date);

  if (model === 'exponential') {
    t_econ_days = Math.log(qi / config.econ_limit_rate) / Di - t_initial;
  } else if (model === 'harmonic') {
    t_econ_days = (qi / config.econ_limit_rate - 1) / Di - t_initial;
  } else { // hyperbolic
    t_econ_days = (Math.pow(qi / config.econ_limit_rate, b) - 1) / (b * Di) - t_initial;
  }
  
  // Simplified EUR calculation (integral of the decline curve)
  let eur_at_econ_limit = 0;
  if (isFinite(t_econ_days)) {
    const T_econ = t_initial + t_econ_days;
    if (model === 'exponential') {
      eur_at_econ_limit = (qi / Di) * (Math.exp(-Di * t_initial) - Math.exp(-Di * T_econ));
    } else if (b !== 1 && model === 'hyperbolic') {
      const term1 = Math.pow(1 + b * Di * T_econ, 1 - 1/b);
      const term2 = Math.pow(1 + b * Di * t_initial, 1 - 1/b);
      eur_at_econ_limit = (qi / (Di * (1 - b))) * (term1 - term2);
    } else { // Harmonic or b=1
      eur_at_econ_limit = (qi / Di) * (Math.log(1 + Di * T_econ) - Math.log(1 + Di * t_initial));
    }
  } else {
    eur_at_econ_limit = Infinity;
  }


  return {
    config,
    fitted_params: { model, qi, Di, b },
    fit_quality: { r_squared, rmse },
    econ_limit: { t_econ_days: t_econ_days < 0 ? 0 : t_econ_days, eur_at_econ_limit },
    forecast: {
      history_dates: historyDates,
      history_rates: historyRates,
      forecast_dates: forecastDates,
      forecast_rates: forecastRates,
    },
    notes,
  };
}

// --- API Endpoint Handler ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();

    if (action === 'analyze') {
      const results = analyzeDeclineCurve(payload.config, payload.data);
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (action === 'get_sample_and_analyze') {
      const sampleConfig = {
        stream: 'OIL',
        decline_model: 'AUTO',
        b_min: 0.0,
        b_max: 1.8,
        b_step: 0.2,
        econ_limit_rate: 50,
        forecast_days: 3650,
        fit_start_date: '',
        fit_end_date: '',
        outlier_method: 'NONE',
        outlier_window_days: 30,
        smooth_window_days: 0,
        allow_segmentation: false,
      };

      const sampleData = [];
      const startDate = new Date('2020-01-01');
      for (let i = 0; i < 100; i++) {
        const date = addDays(startDate, i * 30);
        const rate = 10000 * Math.exp(-0.003 * (i * 30)) + (Math.random() - 0.5) * 1000;
        sampleData.push({
          time: date.toISOString().split('T')[0],
          rate: Math.max(0, rate),
          well: 'Sample-Well-1'
        });
      }
      
      const results = analyzeDeclineCurve(sampleConfig, sampleData);
      
      return new Response(JSON.stringify({ results, mapped_data: sampleData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_schema') {
      const schema = {
        columns: [
          { name: 'time', type: 'Date/String', description: 'The date of the production record (e.g., "YYYY-MM-DD").' },
          { name: 'rate', type: 'Number', description: 'The production rate for that day.' },
          { name: 'well', type: 'String (Optional)', description: 'The name or identifier of the well.' },
        ]
      };
      return new Response(JSON.stringify(schema), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_sample') {
      const csv_content = `time,rate,well\n` +
        Array.from({ length: 50 }, (_, i) => {
          const date = addDays(new Date('2022-01-01'), i * 7);
          const rate = 500 * Math.exp(-0.05 * i) + (Math.random() - 0.5) * 50;
          return `${date.toISOString().split('T')[0]},${rate.toFixed(2)},Well-A`;
        }).join('\n');
      
      return new Response(JSON.stringify({ csv_content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`Error in dca-engine: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});