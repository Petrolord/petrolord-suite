import Papa from 'papaparse';

const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf', '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5'];

// --- File Parsing ---
const parseLAS = (fileContent) => {
  const lines = fileContent.split(/\r\n|\n/);
  let curves = [];
  let data = [];
  let inDataSection = false;
  let depthCol = '';

  let curveSectionContent = '';
  let inCurveSection = false;

  for (const line of lines) {
    if (line.trim().toUpperCase().startsWith('~C')) {
      inCurveSection = true;
      continue;
    }
    if (line.trim().startsWith('~')) {
      inCurveSection = false;
    }
    if (inCurveSection) {
      curveSectionContent += line + '\n';
    }
  }

  if (curveSectionContent) {
    const curveLines = curveSectionContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    curves = curveLines.map(l => l.split('.')[0].trim().split(/\s+/)[0]);
    depthCol = curves[0];
  }

  for (const line of lines) {
    if (line.trim().toUpperCase().startsWith('~A')) {
      inDataSection = true;
      continue;
    }
    if (inDataSection) {
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      const values = line.trim().split(/\s+/).map(v => {
        const num = parseFloat(v);
        return isNaN(num) || num === -999.25 ? null : num;
      });
      data.push(values);
    }
  }

  const dataObjects = data.map(row => {
    const obj = {};
    curves.forEach((curve, i) => {
      obj[curve] = row[i];
    });
    return obj;
  });

  return { curves, data: dataObjects, depthCol };
};

const parseCSV = (fileContent) => {
  const result = Papa.parse(fileContent, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const curves = result.meta.fields;
  const depthCol = curves[0];
  const data = result.data.map(row => {
    for (const key in row) {
      if (row[key] === '' || row[key] === null || row[key] === -999.25) {
        row[key] = null;
      }
    }
    return row;
  });
  return { curves, data, depthCol };
};

export const processLogFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        let parsed;
        if (file.name.toLowerCase().endsWith('.las')) {
          parsed = parseLAS(content);
        } else if (file.name.toLowerCase().endsWith('.csv')) {
          parsed = parseCSV(content);
        } else {
          reject(new Error('Unsupported file type. Please use .las or .csv'));
        }
        
        const depthValues = parsed.data.map(row => row[parsed.depthCol]).filter(d => d != null && !isNaN(d));
        const mdMin = depthValues.length > 0 ? Math.min(...depthValues) : 0;
        const mdMax = depthValues.length > 0 ? Math.max(...depthValues) : 0;

        resolve({
          logData: parsed.data,
          curves: parsed.curves,
          depthCurve: parsed.depthCol,
          mdMin,
          mdMax,
        });

      } catch (e) {
        reject(new Error('Failed to parse file: ' + e.message));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};

// --- ML & Data Processing ---
const getAnalysisData = (logData, analysisCurves, depthCurve, filter) => {
    let filteredData = logData.filter(row => row[depthCurve] >= filter.md_min && row[depthCurve] <= filter.md_max);
    
    const analysisPoints = [];
    const originalIndices = [];

    filteredData.forEach((row, index) => {
        const point = analysisCurves.map(curve => row[curve]);
        if (!point.some(v => v === null || v === undefined)) {
            analysisPoints.push(point);
            originalIndices.push(index);
        }
    });

    if (analysisPoints.length === 0) {
        throw new Error("No valid data points in the selected depth range and with the selected curves.");
    }
    
    return { analysisPoints, originalIndices, filteredData };
}

const normalizeData = (data, analysisCurves, normalization) => {
    if (normalization === 'min-max') {
        const mins = analysisCurves.map((_, i) => Math.min(...data.map(row => row[i])));
        const maxs = analysisCurves.map((_, i) => Math.max(...data.map(row => row[i])));
        return data.map(row => row.map((val, i) => (maxs[i] - mins[i] === 0) ? 0 : (val - mins[i]) / (maxs[i] - mins[i])));
    } else if (normalization === 'z-score') {
        const means = analysisCurves.map((_, i) => data.reduce((sum, row) => sum + row[i], 0) / data.length);
        const stdDevs = analysisCurves.map((_, i) => Math.sqrt(data.reduce((sum, row) => sum + Math.pow(row[i] - means[i], 2), 0) / data.length));
        return data.map(row => row.map((val, i) => (stdDevs[i] === 0) ? 0 : (val - means[i]) / stdDevs[i]));
    }
    return data;
}

const euclideanDistance = (a, b) => Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));

const runKMeans = (data, k, max_iter = 100) => {
    if (data.length < k) return { assignments: new Array(data.length).fill(0), sse: 0 };
    
    let centroids = data.slice(0, k).map(d => [...d]);
    let assignments = new Array(data.length);
    
    for (let iter = 0; iter < max_iter; iter++) {
        let changed = false;
        for (let i = 0; i < data.length; i++) {
            let minDist = Infinity;
            let bestCentroid = -1;
            for (let j = 0; j < k; j++) {
                const dist = euclideanDistance(data[i], centroids[j]);
                if (dist < minDist) {
                    minDist = dist;
                    bestCentroid = j;
                }
            }
            if (assignments[i] !== bestCentroid) {
                assignments[i] = bestCentroid;
                changed = true;
            }
        }
        if (!changed) break;

        const newCentroids = Array.from({ length: k }, () => new Array(data[0].length).fill(0));
        const counts = new Array(k).fill(0);
        for (let i = 0; i < data.length; i++) {
            const c = assignments[i];
            newCentroids[c] = newCentroids[c].map((val, dim) => val + data[i][dim]);
            counts[c]++;
        }

        for (let j = 0; j < k; j++) {
            if (counts[j] > 0) newCentroids[j] = newCentroids[j].map(val => val / counts[j]);
            else newCentroids[j] = data[Math.floor(Math.random() * data.length)];
        }
        centroids = newCentroids;
    }
    
    const sse = data.reduce((sum, point, i) => {
        const centroid = centroids[assignments[i]];
        return sum + point.reduce((distSum, val, dim) => distSum + Math.pow(val - centroid[dim], 2), 0);
    }, 0);

    return { assignments, sse };
};

const runHierarchical = (data, k) => {
    if (data.length <= k) return { assignments: data.map((_, i) => i) };

    let clusters = data.map((point, index) => ({ points: [point], indices: [index] }));

    while (clusters.length > k) {
        let min_dist = Infinity;
        let merge_idx1 = -1, merge_idx2 = -1;

        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                let dist_sum = 0;
                for (const p1 of clusters[i].points) {
                    for (const p2 of clusters[j].points) {
                        dist_sum += euclideanDistance(p1, p2);
                    }
                }
                const avg_dist = dist_sum / (clusters[i].points.length * clusters[j].points.length);
                if (avg_dist < min_dist) {
                    min_dist = avg_dist;
                    merge_idx1 = i;
                    merge_idx2 = j;
                }
            }
        }
        
        const merged_cluster = {
            points: [...clusters[merge_idx1].points, ...clusters[merge_idx2].points],
            indices: [...clusters[merge_idx1].indices, ...clusters[merge_idx2].indices]
        };
        clusters.splice(merge_idx2, 1);
        clusters.splice(merge_idx1, 1);
        clusters.push(merged_cluster);
    }

    const assignments = new Array(data.length);
    clusters.forEach((cluster, cluster_id) => {
        cluster.indices.forEach(point_idx => {
            assignments[point_idx] = cluster_id;
        });
    });
    return { assignments };
};

const runSOM = (data, k) => {
    const n_features = data[0].length;
    const map_size = Math.ceil(Math.sqrt(k));
    const iterations = 100;
    const learning_rate_initial = 0.5;
    const radius_initial = map_size / 2;

    let som_map = Array.from({ length: map_size * map_size }, () => Array.from({ length: n_features }, Math.random));

    for (let iter = 0; iter < iterations; iter++) {
        const learning_rate = learning_rate_initial * (1 - iter / iterations);
        const radius = radius_initial * (1 - iter / iterations);

        const sample = data[Math.floor(Math.random() * data.length)];

        let bmu_idx = -1;
        let min_dist = Infinity;
        som_map.forEach((node, idx) => {
            const dist = euclideanDistance(sample, node);
            if (dist < min_dist) {
                min_dist = dist;
                bmu_idx = idx;
            }
        });
        const bmu_x = bmu_idx % map_size;
        const bmu_y = Math.floor(bmu_idx / map_size);

        som_map.forEach((node, idx) => {
            const node_x = idx % map_size;
            const node_y = Math.floor(idx / map_size);
            const dist_to_bmu = Math.sqrt((bmu_x - node_x)**2 + (bmu_y - node_y)**2);

            if (dist_to_bmu < radius) {
                const influence = Math.exp(-(dist_to_bmu**2) / (2 * radius**2));
                for (let i = 0; i < n_features; i++) {
                    node[i] += influence * learning_rate * (sample[i] - node[i]);
                }
            }
        });
    }

    const assignments = data.map(sample => {
        let bmu_idx = -1, min_dist = Infinity;
        som_map.forEach((node, idx) => {
            const dist = euclideanDistance(sample, node);
            if (dist < min_dist) {
                min_dist = dist;
                bmu_idx = idx;
            }
        });
        return bmu_idx % k; 
    });

    return { assignments };
};


// --- Result Generation ---
const generate3dPlot = (analysisData, analysisCurves, assignments) => ({
    data: [{
        x: analysisData.map(p => p[0]),
        y: analysisData.map(p => p[1]),
        z: analysisCurves.length > 2 ? analysisData.map(p => p[2]) : null,
        mode: 'markers', type: 'scatter3d',
        marker: { color: assignments.map(a => COLORS[a % COLORS.length]), size: 3, opacity: 0.8 }
    }],
    layout: {
        title: '3D Facies Crossplot',
        scene: {
            xaxis: { title: analysisCurves[0] },
            yaxis: { title: analysisCurves[1] },
            zaxis: { title: analysisCurves.length > 2 ? analysisCurves[2] : '' },
        }
    }
});

const generateLogPlot = (logDataWithFacies, depthCurve, analysisCurves, faciesCurveName) => ({
    data: [
        {
            x: logDataWithFacies.map(r => r[faciesCurveName]),
            y: logDataWithFacies.map(r => r[depthCurve]),
            xaxis: 'x1', yaxis: 'y1', type: 'scatter', mode: 'lines', name: 'Facies',
            line: { color: '#e377c2', shape: 'hv' }, fill: 'tozerox', fillcolor: 'rgba(227, 119, 194, 0.2)',
        },
        ...analysisCurves.slice(0, 2).map((curve, i) => ({
            x: logDataWithFacies.map(r => r[curve]),
            y: logDataWithFacies.map(r => r[depthCurve]),
            xaxis: `x${i + 2}`, yaxis: 'y1', type: 'scatter', mode: 'lines', name: curve,
        }))
    ],
    layout: {
        title: 'Facies Log Plot',
        yaxis: { autorange: 'reversed', title: depthCurve },
        xaxis: { domain: [0, 0.2], title: 'Facies' },
        xaxis2: { domain: [0.25, 0.6], title: analysisCurves[0] },
        xaxis3: { domain: [0.65, 1], title: analysisCurves.length > 1 ? analysisCurves[1] : '' },
        grid: { rows: 1, columns: 3, pattern: 'independent' },
        showlegend: false,
    }
});

const generateFaciesSummary = (analysisData, analysisCurves, assignments, k) => {
    return Array.from({ length: k }, (_, i) => {
        const pointsInCluster = analysisData.filter((_, j) => assignments[j] === i);
        if (pointsInCluster.length === 0) return null;
        const centroid = analysisCurves.reduce((obj, curve, c_idx) => {
            obj[curve] = pointsInCluster.reduce((sum, p) => sum + p[c_idx], 0) / pointsInCluster.length;
            return obj;
        }, {});
        return {
            facies: i, count: pointsInCluster.length, percentage: (pointsInCluster.length / analysisData.length) * 100,
            centroid, color: COLORS[i % COLORS.length],
        };
    }).filter(Boolean);
};

// --- Main Analysis Functions ---
export const runFaciesAnalysis = (state) => {
    const { logData, analysisCurves, filter, params, depthCurve } = state;
    const { analysisPoints, originalIndices, filteredData } = getAnalysisData(logData, analysisCurves, depthCurve, filter);
    const normalizedData = normalizeData(analysisPoints, analysisCurves, params.normalization);

    const { k, algorithm } = params.unsupervised;
    let assignments;
    if (algorithm === 'kmeans') {
        assignments = runKMeans(normalizedData, k).assignments;
    } else if (algorithm === 'hierarchical') {
        assignments = runHierarchical(normalizedData, k).assignments;
    } else if (algorithm === 'som') {
        assignments = runSOM(normalizedData, k).assignments;
    } else {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    let logDataWithFacies = [...filteredData];
    assignments.forEach((assignment, i) => {
        logDataWithFacies[originalIndices[i]].FACIES = assignment;
    });
    
    const finalK = new Set(assignments).size;

    return {
        type: 'unsupervised',
        plot3d: generate3dPlot(analysisPoints, analysisCurves, assignments),
        logPlot: generateLogPlot(logDataWithFacies, depthCurve, analysisCurves, 'FACIES'),
        faciesSummary: generateFaciesSummary(analysisPoints, analysisCurves, assignments, finalK),
        logDataWithFacies
    };
};

export const runOptimalKAnalysis = (state) => {
    const { logData, analysisCurves, filter, params, depthCurve } = state;
    const { analysisPoints } = getAnalysisData(logData, analysisCurves, depthCurve, filter);
    const normalizedData = normalizeData(analysisPoints, analysisCurves, params.normalization);
    
    const sseValues = [];
    const kValues = Array.from({length: 9}, (_, i) => i + 2); // K from 2 to 10
    
    kValues.forEach(k => {
        const { sse } = runKMeans(normalizedData, k);
        sseValues.push(sse);
    });

    return {
        type: 'optimal-k',
        elbowPlot: {
            data: [{ x: kValues, y: sseValues, type: 'scatter', mode: 'lines+markers' }],
            layout: { title: 'Elbow Method for Optimal K', xaxis: {title: 'Number of Clusters (K)'}, yaxis: {title: 'Sum of Squared Errors (SSE)'}}
        }
    };
};

export const runSupervisedFaciesAnalysis = async (state) => {
    const { logData, analysisCurves, filter, params, depthCurve } = state;
    const { trainingData, depthCol: trainDepth, faciesCol: trainFacies } = params.supervised;
    
    // 1. Prepare training data
    const trainingPoints = trainingData
        .map(row => ({
            depth: row[trainDepth],
            facies: row[trainFacies],
            features: analysisCurves.map(c => row[c])
        }))
        .filter(p => p.depth != null && p.facies != null && !p.features.some(f => f == null));

    if (trainingPoints.length === 0) throw new Error("No valid training points found in the provided file.");

    const uniqueFacies = [...new Set(trainingPoints.map(p => p.facies))];
    const faciesMap = Object.fromEntries(uniqueFacies.map((f, i) => [f, i]));
    const reverseFaciesMap = Object.fromEntries(uniqueFacies.map((f, i) => [i, f]));
    const k = uniqueFacies.length;

    const normTrainingFeatures = normalizeData(trainingPoints.map(p => p.features), analysisCurves, params.normalization);

    // 2. Prepare prediction data
    const { analysisPoints, originalIndices, filteredData } = getAnalysisData(logData, analysisCurves, depthCurve, filter);
    const normPredictionFeatures = normalizeData(analysisPoints, analysisCurves, params.normalization);

    // 3. Predict (using simple nearest neighbor as a proxy for Random Forest)
    const predictions = normPredictionFeatures.map(predPoint => {
        let min_dist = Infinity;
        let best_facies = -1;
        normTrainingFeatures.forEach((trainPoint, i) => {
            const dist = euclideanDistance(trainPoint, predPoint);
            if (dist < min_dist) {
                min_dist = dist;
                best_facies = faciesMap[trainingPoints[i].facies];
            }
        });
        return best_facies;
    });

    // 4. Merge results
    let logDataWithFacies = [...filteredData];
    predictions.forEach((pred, i) => {
        logDataWithFacies[originalIndices[i]].FACIES_PRED = pred;
    });

    // 5. Validation (Confusion Matrix)
    const validationPoints = analysisPoints.map((p, i) => ({ features: p, originalRow: filteredData[originalIndices[i]] }))
        .filter(p => p.originalRow[trainFacies] != null);
    const trueLabels = validationPoints.map(p => faciesMap[p.originalRow[trainFacies]]);
    
    const predLabelsForValidation = normalizeData(validationPoints.map(p => p.features), analysisCurves, params.normalization)
        .map(predPoint => {
            let min_dist = Infinity;
            let best_facies = -1;
            normTrainingFeatures.forEach((trainPoint, i) => {
                const dist = euclideanDistance(trainPoint, predPoint);
                if (dist < min_dist) {
                    min_dist = dist;
                    best_facies = faciesMap[trainingPoints[i].facies];
                }
            });
            return best_facies;
        });

    const matrix = Array(k).fill(0).map(() => Array(k).fill(0));
    let correct = 0;
    trueLabels.forEach((trueLabel, i) => {
        const predLabel = predLabelsForValidation[i];
        if (trueLabel !== undefined && predLabel !== -1) {
            matrix[trueLabel][predLabel]++;
            if (trueLabel === predLabel) correct++;
        }
    });

    const confusionMatrix = {
        data: [{ z: matrix, x: uniqueFacies, y: uniqueFacies, type: 'heatmap', colorscale: 'Blues' }],
        layout: { title: 'Confusion Matrix', xaxis: {title: 'Predicted'}, yaxis: {title: 'Actual'}},
        accuracy: trueLabels.length > 0 ? correct / trueLabels.length : 0,
    };
    
    // 6. Generate final results
    return {
        type: 'supervised',
        logPlot: generateLogPlot(logDataWithFacies, depthCurve, analysisCurves, 'FACIES_PRED'),
        faciesSummary: generateFaciesSummary(analysisPoints, analysisCurves, predictions.map(p => p), k).map(f => ({...f, facies: reverseFaciesMap[f.facies] || f.facies})),
        logDataWithFacies,
        confusionMatrix,
    };
};

// --- Download Utility ---
export const downloadFaciesLog = (logData, depthCurve, curves, faciesCurve, originalFileName) => {
    let lasContent = `~Version Information
VERS. 2.0: CWLS log ASCII Standard - VERSION 2.0
WRAP. NO: One line per depth step
~Well Information
#MNEM.UNIT       DATA             DESCRIPTION
#----.----   ----------------   --------------------------------------------------
WELL.        WELL-1             : WELL
COMP.        Petrolord          : COMPANY
DATE.        ${new Date().toISOString().slice(0, 10)}      : DATE
~Curve Information
#MNEM.UNIT      API CODE          DESCRIPTION
#----.----   ----------------   --------------------------------------------------
${depthCurve.padEnd(4)}.M                      : 1  ${depthCurve}
${faciesCurve.padEnd(4)}.                     : 2  ${faciesCurve}
${curves.map((c, i) => `${c.padEnd(4)}.                     : ${i + 3}  ${c}`).join('\n')}
~Parameter Information
#MNEM.UNIT       VALUE            DESCRIPTION
#----.----   ----------------   --------------------------------------------------
NULL.        -999.2500          : NULL VALUE
~A ${depthCurve} ${faciesCurve} ${curves.join(' ')}
`;

    logData.forEach(row => {
        const depth = row[depthCurve]?.toFixed(4) ?? -999.25;
        const facies = row[faciesCurve] ?? -999.25;
        const curveValues = curves.map(c => row[c]?.toFixed(4) ?? -999.25).join(' ');
        lasContent += ` ${depth} ${facies} ${curveValues}\n`;
    });

    const blob = new Blob([lasContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${originalFileName.replace(/\.[^/.]+$/, "")}_facies.las`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};