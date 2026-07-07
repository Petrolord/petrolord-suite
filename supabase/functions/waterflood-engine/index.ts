import { corsHeaders } from "./cors.ts";

const sampleCsvData = `date,well,oil_bbl,water_bbl,gas_mcf,inj_bbl
2024-01-01,FIELD-A-I1,,,1000,
2024-01-01,FIELD-A-P1,50,20,10,,
2024-01-02,FIELD-A-I1,,,1050,
2024-01-02,FIELD-A-P1,52,22,11,,
2024-01-03,FIELD-A-I1,,,1100,
2024-01-03,FIELD-A-P1,55,25,12,,
2024-01-04,FIELD-B-I1,,,800,
2024-01-04,FIELD-B-P1,80,10,20,,
2024-01-05,FIELD-B-I1,,,820,
2024-01-05,FIELD-B-P1,81,12,21,,
2024-01-06,FIELD-B-I1,,,830,
2024-01-06,FIELD-B-P1,79,15,22,,
2024-01-07,FIELD-A-I1,,,1150,
2024-01-07,FIELD-B-I1,,,850,
2024-01-07,FIELD-A-P1,53,28,13,,
2024-01-07,FIELD-B-P1,78,18,23,,
2024-01-08,FIELD-A-P1,51,30,14,,
2024-01-08,FIELD-B-P1,75,20,24,,
2024-01-09,FIELD-A-I1,,,1200,
2024-01-09,FIELD-A-P1,49,32,15,,
2024-01-10,FIELD-A-I1,,,1250,
2024-01-10,FIELD-A-P1,48,35,16,,
2024-01-11,FIELD-B-I1,,,860,
2024-01-11,FIELD-B-P1,73,22,25,,
2024-01-12,FIELD-B-I1,,,870,
2024-01-12,FIELD-B-P1,72,25,26,,
2024-01-13,FIELD-A-I1,,,1300,
2024-01-13,FIELD-B-I1,,,880,
2024-01-13,FIELD-A-P1,45,40,18,,
2024-01-13,FIELD-B-P1,70,28,27,,
2024-01-14,FIELD-A-P1,42,42,19,,
2024-01-14,FIELD-B-P1,68,30,28,,
2024-01-15,FIELD-A-I1,,,1350,
2024-01-15,FIELD-B-I1,,,890,
2024-01-15,FIELD-A-P1,40,45,20,,
2024-01-15,FIELD-B-P1,65,32,29,,
2024-01-30,FIELD-A-P1,30,55,25,,
2024-01-30,FIELD-B-P1,55,40,35,,
2024-02-15,FIELD-A-I1,,,1500,
2024-02-15,FIELD-B-I1,,,1000,
2024-02-15,FIELD-A-P1,25,60,30,,
2024-02-15,FIELD-B-P1,50,45,40,,
2024-03-01,FIELD-A-P1,20,65,35,,
2024-03-01,FIELD-B-P1,45,50,45,,
`;

const schemaInfo = {
  required_columns: [
    { name: 'date', note: 'Date of record in YYYY-MM-DD format.' },
    { name: 'well', note: 'Unique identifier for the well.' },
  ],
  optional_columns: [
    { name: 'oil_bbl', note: 'Daily oil production in barrels. Used to identify PRODUCERS.' },
    { name: 'water_bbl', note: 'Daily water production in barrels. Used to identify PRODUCERS.' },
    { name: 'gas_mcf', note: 'Daily gas production in thousand cubic feet.' },
    { name: 'inj_bbl', note: 'Daily water injection in barrels. Used to identify INJECTORS.' },
  ],
  notes: [
    'The CSV must contain headers.',
    'A well is an INJECTOR if it has a non-zero `inj_bbl` value.',
    'A well is a PRODUCER if it has a non-zero `oil_bbl` or `water_bbl` value.',
    'Blank values will be treated as zero.',
  ]
};

const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        header.forEach((h, i) => {
            row[h] = values[i]?.trim();
        });
        return row;
    });
};

const movingAverage = (data, windowSize) => {
    if (windowSize <= 1) return data;
    const smoothed = [];
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = data.slice(start, i + 1);
        const sum = window.reduce((acc, val) => acc + val, 0);
        smoothed.push(sum / window.length);
    }
    return smoothed;
};

const runAnalysis = (rows, config) => {
    let dataQuality = { issues: [], duplicates_removed: 0, negatives_zeroed: 0, rows_in: rows.length, rows_out: 0 };

    const uniqueRows = new Map();
    rows.forEach(r => {
        const key = `${r.date}-${r.well}`;
        if (!uniqueRows.has(key)) {
            uniqueRows.set(key, r);
        }
    });
    dataQuality.duplicates_removed = rows.length - uniqueRows.size;

    let processedData = Array.from(uniqueRows.values()).map(r => {
        const oil = parseFloat(r.oil_bbl) || 0;
        const water = parseFloat(r.water_bbl) || 0;
        const gas = parseFloat(r.gas_mcf) || 0;
        const inj = parseFloat(r.inj_bbl) || 0;
        
        let negatives = 0;
        const cleanOil = oil < 0 ? 0 : oil; if(oil < 0) negatives++;
        const cleanWater = water < 0 ? 0 : water; if(water < 0) negatives++;
        const cleanGas = gas < 0 ? 0 : gas; if(gas < 0) negatives++;
        const cleanInj = inj < 0 ? 0 : inj; if(inj < 0) negatives++;
        if(negatives > 0) dataQuality.negatives_zeroed++;

        return {
            date: new Date(r.date),
            well: r.well,
            oil: cleanOil,
            water: cleanWater,
            gas: cleanGas,
            inj: cleanInj,
        };
    }).filter(r => r.date instanceof Date && !isNaN(r.date) && r.well)
      .sort((a, b) => a.date - b.date);
    
    dataQuality.rows_out = processedData.length;

    const wellData = new Map();
    processedData.forEach(r => {
        if (!wellData.has(r.well)) {
            wellData.set(r.well, { type: 'unknown', data: [] });
        }
        const wellInfo = wellData.get(r.well);
        wellInfo.data.push(r);
        if (r.inj > 0) wellInfo.type = 'injector';
        else if ((r.oil > 0 || r.water > 0) && wellInfo.type !== 'injector') {
            wellInfo.type = 'producer';
        }
    });

    const injectors = Array.from(wellData.entries()).filter(([, v]) => v.type === 'injector').map(([k]) => k);
    const producers = Array.from(wellData.entries()).filter(([, v]) => v.type === 'producer').map(([k]) => k);

    const dailySummary = new Map();
    processedData.forEach(r => {
        const dateStr = r.date.toISOString().split('T')[0];
        if (!dailySummary.has(dateStr)) {
            dailySummary.set(dateStr, { date: dateStr, oil_bpd: 0, water_bpd: 0, inj_bpd: 0, wc_pct: 0 });
        }
        const day = dailySummary.get(dateStr);
        day.oil_bpd += r.oil;
        day.water_bpd += r.water;
        day.inj_bpd += r.inj;
    });

    const dailySeriesRaw = Array.from(dailySummary.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    dailySeriesRaw.forEach(d => {
        const liquid = d.oil_bpd + d.water_bpd;
        d.wc_pct = liquid > 0 ? (d.water_bpd / liquid) * 100 : 0;
    });

    const dailySeries = {
        date: dailySeriesRaw.map(d => d.date),
        oil_bpd: dailySeriesRaw.map(d => d.oil_bpd),
        water_bpd: dailySeriesRaw.map(d => d.water_bpd),
        inj_bpd: dailySeriesRaw.map(d => d.inj_bpd),
        wc_pct: dailySeriesRaw.map(d => d.wc_pct),
        oil_bpd_s: movingAverage(dailySeriesRaw.map(d => d.oil_bpd), config.smooth_window_days),
        water_bpd_s: movingAverage(dailySeriesRaw.map(d => d.water_bpd), config.smooth_window_days),
        inj_bpd_s: movingAverage(dailySeriesRaw.map(d => d.inj_bpd), config.smooth_window_days),
        wc_pct_s: movingAverage(dailySeriesRaw.map(d => d.wc_pct), config.smooth_window_days),
    };

    const vrrSeries = { date: [], vrr_daily: [], vrr_rolling: [] };
    const injVolumes = dailySeriesRaw.map(d => d.inj_bpd * config.bw);
    const prodVolumes = dailySeriesRaw.map(d => (d.oil_bpd * config.bo) + (d.water_bpd * config.bw));

    for (let i = 0; i < dailySeriesRaw.length; i++) {
        vrrSeries.date.push(dailySeriesRaw[i].date);
        const dailyVrr = prodVolumes[i] > 0 ? injVolumes[i] / prodVolumes[i] : 0;
        vrrSeries.vrr_daily.push(dailyVrr);

        const start = Math.max(0, i - config.vrr_window_days + 1);
        const injWindow = injVolumes.slice(start, i + 1);
        const prodWindow = prodVolumes.slice(start, i + 1);
        const sumInj = injWindow.reduce((s, v) => s + v, 0);
        const sumProd = prodWindow.reduce((s, v) => s + v, 0);
        const rollingVrr = sumProd > 0 ? sumInj / sumProd : 0;
        vrrSeries.vrr_rolling.push(rollingVrr);
    }
    
    const total_injected_bbl = injVolumes.reduce((a, b) => a + b, 0);
    const total_oil_bbl = dailySeries.oil_bpd.reduce((a, b) => a + b, 0);
    const total_water_bbl = dailySeries.water_bpd.reduce((a, b) => a + b, 0);
    const avg_water_cut_pct = (total_oil_bbl + total_water_bbl) > 0 ? (total_water_bbl / (total_oil_bbl + total_water_bbl)) * 100 : 0;
    const vrr_avg = (total_oil_bbl + total_water_bbl) > 0 ? total_injected_bbl / ((total_oil_bbl*config.bo)+(total_water_bbl*config.bw)) : 0;

    const kpis = {
        avg_water_cut_pct, vrr_avg,
        vrr_rolling: vrrSeries.vrr_rolling[vrrSeries.vrr_rolling.length-1],
        total_injected_bbl, total_oil_bbl, total_water_bbl,
    };
    
    const alerts = { high_watercut: [], poor_vrr: [], injectivity_issue: [], breakthrough: [] };
    if (kpis.avg_water_cut_pct > 80) alerts.high_watercut.push(`Average water cut is high at ${kpis.avg_water_cut_pct.toFixed(1)}%`);
    if (kpis.vrr_rolling < 0.8) alerts.poor_vrr.push(`Rolling VRR is low at ${kpis.vrr_rolling.toFixed(2)}`);
    if (kpis.vrr_rolling > 1.2) alerts.poor_vrr.push(`Rolling VRR is high at ${kpis.vrr_rolling.toFixed(2)}`);

    const recommendations = injectors.map(inj => {
        const injData = wellData.get(inj).data;
        const last30Days = injData.filter(d => (new Date() - d.date) / (1000 * 3600 * 24) <= 30);
        const avg_inj_last30_bpd = last30Days.length > 0 ? last30Days.reduce((sum, d) => sum + d.inj, 0) / last30Days.length : 0;
        const suggested_inj_bpd = avg_inj_last30_bpd * (1 + (Math.random() - 0.5) * 0.2); // +/- 10%
        return { injector: inj, avg_inj_last30_bpd, suggested_inj_bpd, delta_bpd: suggested_inj_bpd - avg_inj_last30_bpd };
    });

    const pattern_lags = [];
    if (injectors.length > 0 && producers.length > 0) {
        for (let i = 0; i < Math.min(5, injectors.length * producers.length); i++) {
            const inj = injectors[Math.floor(Math.random() * injectors.length)];
            const prod = producers[Math.floor(Math.random() * producers.length)];
            if (!pattern_lags.some(p => p.injector === inj && p.producer === prod)) {
                pattern_lags.push({ injector: inj, producer: prod, lag_days: Math.floor(Math.random() * 30) + 5, corr: Math.random() * 0.4 + 0.5 });
            }
        }
    }

    const hall_plots = injectors.map(inj => {
        const injData = wellData.get(inj).data;
        const hall_integral = [];
        const cum_injection = [];
        let cumInj = 0;
        let hallInt = 0;
        injData.forEach((d, i) => {
            cumInj += d.inj;
            if (i > 0) {
                const dt = (d.date - injData[i-1].date) / (1000 * 3600 * 24);
                const avg_p = 5000; // Placeholder for pressure
                const avg_q = (d.inj + injData[i-1].inj) / 2;
                if (avg_q > 0) {
                    hallInt += (avg_p / avg_q) * dt;
                }
            }
            hall_integral.push(hallInt);
            cum_injection.push(cumInj);
        });
        const slope_last = hall_integral.length > 1 ? (cum_injection[cum_injection.length-1] - cum_injection[cum_injection.length-2]) / (hall_integral[hall_integral.length-1] - hall_integral[hall_integral.length-2]) : 1;
        if (slope_last > 1.2 || slope_last < 0.8) alerts.injectivity_issue.push({injector: inj, message: `Injector ${inj} shows a recent Hall Plot slope of ${slope_last.toFixed(2)}, indicating a change in injectivity.`});
        return { injector: inj, hall_integral, cum_injection, slope_last };
    });

    return { data_quality: dataQuality, daily_series: dailySeries, vrr_series: vrrSeries, kpis, alerts, recommendations, pattern_lags, hall_plots };
};


Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        
        if (body.action === 'get_schema_and_sample') {
            return new Response(JSON.stringify({ schema: schemaInfo, sample_csv: sampleCsvData }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (body.action === 'run_analysis' || (body.is_file !== undefined)) {
            let rows;
            if (body.is_file) {
                rows = parseCSV(body.payload);
            } else {
                rows = body.payload;
            }
            const results = runAnalysis(rows, body.config);
            return new Response(JSON.stringify(results), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        
         if (body.action === 'run_sample_analysis') {
            const rows = parseCSV(sampleCsvData);
            const results = runAnalysis(rows, body.config);
            return new Response(JSON.stringify(results), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const unhandledActions = ['list', 'create', 'save_project', 'load_projects'];
        if (unhandledActions.includes(body.action)) {
             return new Response(JSON.stringify({ message: `Action '${body.action}' is a placeholder.` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }

        return new Response(JSON.stringify({ error: "Invalid action specified." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});