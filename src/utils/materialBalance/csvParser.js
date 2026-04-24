import Papa from 'papaparse';

/**
 * CSV Parser utilities for Material Balance Pro
 * Robust detection and parsing of engineering data files.
 */

const HEADER_ALIASES = {
  production: {
    date: ['date', 'time', 'timestamp', 'dt', 'period'],
    np: ['np (stb)', 'np', 'cumulative oil', 'cum oil', 'oil cum', 'oil prod cum', 'cumulative_oil'],
    gp: ['gp (scf)', 'gp', 'cumulative gas', 'cum gas', 'gas cum', 'gas prod cum', 'cumulative_gas'],
    wp: ['wp (stb)', 'wp', 'cumulative water', 'cum water', 'water cum', 'water prod cum', 'cumulative_water'],
    wc: ['wc', 'water cut', 'wct', 'bsw', 'water_cut'],
    rp: ['rp', 'gor', 'gas oil ratio', 'avg gor'],
    comments: ['comment', 'comments', 'remark', 'remarks', 'note', 'notes']
  },
  pressure: {
    date: ['date', 'time', 'timestamp', 'dt'],
    pr: ['pr (psia)', 'pr', 'reservoir pressure', 'sbhp', 'p_res', 'pres', 'p_avg'],
    pwf: ['pwf (psia)', 'pwf', 'flowing pressure', 'fbhp', 'p_flow'],
    testType: ['test type', 'test', 'type', 'method', 'source']
  },
  pvt: {
    pressure: ['pressure (psia)', 'pressure', 'p', 'pres', 'pressure_psia'],
    bo: ['bo (rb/stb)', 'bo', 'oil fvf', 'oil formation volume factor', 'formation volume factor oil'],
    bg: ['bg (rb/scf)', 'bg', 'gas fvf', 'gas formation volume factor', 'formation volume factor gas'],
    rs: ['rs (scf/stb)', 'rs', 'solution gas', 'gas oil ratio', 'gor', 'solution gor'],
    rv: ['rv (stb/scf)', 'rv', 'vapor oil ratio', 'condensate gas ratio', 'cgr'],
    mu_o: ['µo (cp)', 'uo (cp)', 'mu_o', 'oil viscosity', 'visc oil', 'viscosity oil', 'muo'],
    mu_g: ['µg (cp)', 'ug (cp)', 'mu_g', 'gas viscosity', 'visc gas', 'viscosity gas', 'mug']
  },
  contacts: {
    date: ['date', 'time', 'timestamp'],
    goc: ['goc depth (ft)', 'goc', 'gas oil contact', 'gas-oil contact', 'goc depth'],
    owc: ['owc depth (ft)', 'owc', 'oil water contact', 'oil-water contact', 'owc depth'],
    method: ['method', 'source', 'tool', 'logging tool']
  }
};

const findColumn = (headers, possibleNames) => {
  if (!headers || !possibleNames) return null;
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/\s+/g, ' '));
  
  for (const name of possibleNames) {
    const n = name.toLowerCase().trim().replace(/\s+/g, ' ');
    const idx = normalizedHeaders.indexOf(n);
    if (idx !== -1) return headers[idx];
  }

  const sortedAliases = [...possibleNames].sort((a, b) => b.length - a.length);
  for (const name of sortedAliases) {
    const n = name.toLowerCase().trim();
    if (n.length < 2) continue; 
    const idx = normalizedHeaders.findIndex(h => h.includes(n));
    if (idx !== -1) return headers[idx];
  }
  return null;
};

export const detectFileType = (csvData) => {
  if (!csvData || csvData.length === 0) return 'unknown';
  const headers = Object.keys(csvData[0]);
  
  const scores = { production: 0, pressure: 0, pvt: 0, contacts: 0 };

  if (findColumn(headers, HEADER_ALIASES.production.date)) scores.production += 2;
  if (findColumn(headers, HEADER_ALIASES.production.np)) scores.production += 3;
  if (findColumn(headers, HEADER_ALIASES.production.gp)) scores.production += 2;
  if (findColumn(headers, HEADER_ALIASES.production.wp)) scores.production += 1;

  if (findColumn(headers, HEADER_ALIASES.pressure.date)) scores.pressure += 2;
  if (findColumn(headers, HEADER_ALIASES.pressure.pr)) scores.pressure += 3;
  if (findColumn(headers, HEADER_ALIASES.pressure.pwf)) scores.pressure += 2;

  if (findColumn(headers, HEADER_ALIASES.pvt.pressure)) scores.pvt += 3;
  if (findColumn(headers, HEADER_ALIASES.pvt.bo)) scores.pvt += 2;
  if (findColumn(headers, HEADER_ALIASES.pvt.rs)) scores.pvt += 2;
  if (findColumn(headers, ['date', 'time'])) scores.pvt -= 5; 

  if (findColumn(headers, HEADER_ALIASES.contacts.date)) scores.contacts += 2;
  if (findColumn(headers, HEADER_ALIASES.contacts.goc)) scores.contacts += 3;
  if (findColumn(headers, HEADER_ALIASES.contacts.owc)) scores.contacts += 3;

  let bestType = 'unknown';
  let maxScore = 3;

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestType = type;
    }
  }
  return bestType;
};

const cleanNumber = (val, fieldName = 'unknown') => {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (val === null || val === undefined) return 0;
  
  const cleaned = String(val).replace(/,/g, '').trim();
  if (cleaned === '') return 0;
  
  const num = Number(cleaned);
  if (isNaN(num) || !isFinite(num)) {
    console.warn(`[CSV Parser] Invalid numeric value "${val}" in field "${fieldName}". Coerced to 0.`);
    return 0;
  }
  return num;
};

const parseDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

export const parseProductionHistory = async (file) => {
  console.log("[CSV Parser] Starting Production History parsing...");
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const raw = results.data;
        if (!raw || raw.length === 0) return reject(new Error("File is empty or could not be parsed."));

        const headers = Object.keys(raw[0]);
        const cols = {
          date: findColumn(headers, HEADER_ALIASES.production.date),
          np: findColumn(headers, HEADER_ALIASES.production.np),
          gp: findColumn(headers, HEADER_ALIASES.production.gp),
          wp: findColumn(headers, HEADER_ALIASES.production.wp),
          wc: findColumn(headers, HEADER_ALIASES.production.wc),
          rp: findColumn(headers, HEADER_ALIASES.production.rp)
        };

        if (!cols.date) return reject(new Error("Missing required column: Date"));
        if (!cols.np && !cols.gp) return reject(new Error("Missing required columns: Np or Gp"));

        const parsed = { dates: [], Np: [], Gp: [], Wp: [], Wc: [], Rp: [] };
        
        raw.forEach((row, idx) => {
          const d = parseDate(row[cols.date]);
          if (d) {
            parsed.dates.push(d);
            parsed.Np.push(cleanNumber(row[cols.np], 'Np'));
            parsed.Gp.push(cleanNumber(row[cols.gp], 'Gp'));
            parsed.Wp.push(cleanNumber(row[cols.wp], 'Wp'));
            parsed.Wc.push(cleanNumber(row[cols.wc], 'Wc'));
            parsed.Rp.push(cleanNumber(row[cols.rp], 'Rp'));
          } else {
            console.warn(`[CSV Parser] Skipped row ${idx} due to invalid date: ${row[cols.date]}`);
          }
        });
        
        console.log(`[CSV Parser] Production parsed successfully. Rows: ${parsed.dates.length}`);
        resolve(parsed);
      },
      error: reject
    });
  });
};

export const parsePressureData = async (file) => {
  console.log("[CSV Parser] Starting Pressure Data parsing...");
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const raw = results.data;
        if (!raw || raw.length === 0) return reject(new Error("File is empty."));

        const headers = Object.keys(raw[0]);
        const cols = {
          date: findColumn(headers, HEADER_ALIASES.pressure.date),
          pr: findColumn(headers, HEADER_ALIASES.pressure.pr),
          pwf: findColumn(headers, HEADER_ALIASES.pressure.pwf)
        };

        if (!cols.date) return reject(new Error("Missing required column: Date"));
        if (!cols.pr) return reject(new Error("Missing required column: Reservoir Pressure (Pr)"));

        const parsed = { dates: [], Pr: [], Pwf: [] };
        raw.forEach((row, idx) => {
          const d = parseDate(row[cols.date]);
          if (d) {
            parsed.dates.push(d);
            parsed.Pr.push(cleanNumber(row[cols.pr], 'Pr'));
            parsed.Pwf.push(cleanNumber(row[cols.pwf], 'Pwf'));
          } else {
            console.warn(`[CSV Parser] Skipped pressure row ${idx} due to invalid date.`);
          }
        });
        console.log(`[CSV Parser] Pressure parsed successfully. Rows: ${parsed.dates.length}`);
        resolve(parsed);
      },
      error: reject
    });
  });
};

export const parsePVTData = async (file) => {
  console.log("[CSV Parser] Starting PVT Data parsing...");
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const raw = results.data;
        if (!raw || raw.length === 0) return reject(new Error("File is empty."));

        const headers = Object.keys(raw[0]);
        const cols = {
          pressure: findColumn(headers, HEADER_ALIASES.pvt.pressure),
          bo: findColumn(headers, HEADER_ALIASES.pvt.bo),
          bg: findColumn(headers, HEADER_ALIASES.pvt.bg),
          rs: findColumn(headers, HEADER_ALIASES.pvt.rs)
        };

        if (!cols.pressure) return reject(new Error("Missing required column: Pressure"));

        const parsed = { pressure: [], Bo: [], Bg: [], Rs: [] };
        raw.forEach((row, idx) => {
          const p = cleanNumber(row[cols.pressure], 'PVT Pressure');
          if (isFinite(p) && row[cols.pressure] !== undefined && row[cols.pressure] !== '') {
            parsed.pressure.push(p);
            parsed.Bo.push(cleanNumber(row[cols.bo], 'Bo'));
            parsed.Bg.push(cleanNumber(row[cols.bg], 'Bg'));
            parsed.Rs.push(cleanNumber(row[cols.rs], 'Rs'));
          } else {
            console.warn(`[CSV Parser] Skipped PVT row ${idx} due to invalid pressure.`);
          }
        });
        console.log(`[CSV Parser] PVT parsed successfully. Rows: ${parsed.pressure.length}`);
        resolve(parsed);
      },
      error: reject
    });
  });
};

export const parseContactObservations = async (file) => {
  console.log("[CSV Parser] Starting Contact Observations parsing...");
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const raw = results.data;
        if (!raw || raw.length === 0) return reject(new Error("File is empty."));

        const headers = Object.keys(raw[0]);
        const cols = {
          date: findColumn(headers, HEADER_ALIASES.contacts.date),
          goc: findColumn(headers, HEADER_ALIASES.contacts.goc),
          owc: findColumn(headers, HEADER_ALIASES.contacts.owc),
          method: findColumn(headers, HEADER_ALIASES.contacts.method)
        };

        if (!cols.date) return reject(new Error("Missing required column: Date"));

        const parsed = { dates: [], measuredGOC: [], measuredOWC: [], method: [] };
        raw.forEach((row, idx) => {
          const d = parseDate(row[cols.date]);
          if (d) {
            parsed.dates.push(d);
            parsed.measuredGOC.push(cleanNumber(row[cols.goc], 'GOC'));
            parsed.measuredOWC.push(cleanNumber(row[cols.owc], 'OWC'));
            parsed.method.push(row[cols.method] || 'Unknown');
          } else {
            console.warn(`[CSV Parser] Skipped contacts row ${idx} due to invalid date.`);
          }
        });
        console.log(`[CSV Parser] Contacts parsed successfully. Rows: ${parsed.dates.length}`);
        resolve(parsed);
      },
      error: reject
    });
  });
};