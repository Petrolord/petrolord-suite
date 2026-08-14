import Papa from 'papaparse';

export const parseCSV = (fileContent) => {
  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields,
          rows: results.data,
          errors: results.errors
        });
      },
      error: (error) => reject(error)
    });
  });
};

// Stream-specific rate columns are resolved before the generic `rate`
// alias, and each header is claimed at most once, so a CSV carrying
// oil + gas + water columns maps to three independent streams instead of
// whichever column happened to match the old single `rate` alias first.
const COLUMN_ALIASES = {
  date: ['date', 'time', 'timestamp', 'prod_date', 'period'],
  well: ['well_name', 'wellname', 'well', 'api', 'uwi'],
  oilRate: ['oil_rate', 'oil rate', 'qo', 'bopd', 'oil'],
  gasRate: ['gas_rate', 'gas rate', 'qg', 'mscf', 'gas'],
  waterRate: ['water_rate', 'water rate', 'qw', 'bwpd', 'water'],
  // cum resolves AFTER the stream rates: its short np/gp/wp aliases are
  // substrings of common rate headers ('wp' is inside 'bwpd'), and resolving
  // cum first silently claimed the water column as a cumulative.
  cum: ['cum', 'cumulative', 'np', 'gp', 'wp'],
  rate: ['rate', 'volume'] // generic single-stream column, resolved last
};

export const detectColumns = (headers) => {
  const mapping = {
    date: null,
    rate: null,
    oilRate: null,
    gasRate: null,
    waterRate: null,
    cum: null,
    well: null
  };
  const claimed = new Set();

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const match = headers.find(
        h => !claimed.has(h) && h.toLowerCase().includes(alias)
      );
      if (match) {
        mapping[key] = match;
        claimed.add(match);
        break; // Found a match for this key
      }
    }
  }
  return mapping;
};

const toRate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
};

export const mapColumns = (data, mapping) => {
  return data.map(row => {
    const oilRate = mapping.oilRate ? toRate(row[mapping.oilRate]) : null;
    const gasRate = mapping.gasRate ? toRate(row[mapping.gasRate]) : null;
    const waterRate = mapping.waterRate ? toRate(row[mapping.waterRate]) : null;
    const genericRate = mapping.rate ? toRate(row[mapping.rate]) : null;
    return {
      date: row[mapping.date],
      // Primary rate: oil when present, else the generic column, else the
      // single stream the file carries (keeps gas-only or water-only CSVs
      // importable exactly as before).
      rate: oilRate ?? genericRate ?? gasRate ?? waterRate,
      oilRate,
      gasRate,
      waterRate,
      cum: mapping.cum ? Number(row[mapping.cum]) : null,
      well: mapping.well ? row[mapping.well] : 'Unknown Well',
      original: row
    };
  }).filter(row => row.date != null); // Basic filter
};

/**
 * Rate accessor for a production stream. Gas and water NEVER fall back to
 * the oil/primary column: a missing stream returns null so callers can say
 * "no gas data" instead of silently fitting oil (the bug this replaced).
 */
export const getStreamRate = (point, stream) => {
  if (stream === 'gas') return point.gasRate ?? null;
  if (stream === 'water') return point.waterRate ?? null;
  return point.oilRate ?? point.rate ?? null;
};

export const validateData = (data) => {
  const errors = [];
  const warnings = [];
  let validCount = 0;

  data.forEach((row, index) => {
    if (!row.date) {
      errors.push(`Row ${index + 1}: Missing date`);
    } else if (isNaN(new Date(row.date).getTime())) {
      errors.push(`Row ${index + 1}: Invalid date format`);
    }

    const rates = [row.rate, row.oilRate, row.gasRate, row.waterRate]
      .filter(r => r !== null && r !== undefined);
    if (rates.length === 0 || rates.some(r => isNaN(r))) {
      errors.push(`Row ${index + 1}: Invalid rate`);
    } else if (rates.some(r => r < 0)) {
      warnings.push(`Row ${index + 1}: Negative rate`);
    } else {
      validCount++;
    }
  });

  return { valid: validCount > 0, validCount, errors, warnings };
};