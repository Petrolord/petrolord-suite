import Papa from 'papaparse';

export class SurfaceParser {
    static async parse(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const content = e.target.result;
                    let points = [];
                    let formatDetected = 'Unknown';
                    
                    // 1. Attempt to detect format from content
                    if (this.isEsriAsciiGrid(content)) {
                        formatDetected = 'ESRI ASCII Grid';
                        points = this.parseEsriAscii(content);
                    } else if (this.isZMap(content)) {
                        formatDetected = 'ZMap+ Grid';
                        // Fallback to delimited parsing for ZMap for now if complex structure
                        // Typically ZMap has headers starting with '!' or similar.
                        points = this.parseDelimited(content); 
                    } else if (extension === 'json' || extension === 'geojson') {
                        formatDetected = 'JSON/GeoJSON';
                        points = this.parseJson(content);
                    } else {
                        // Default to Robust Delimited Parser (CSV, DAT, XYZ, CPS-3 Body)
                        formatDetected = `Delimited (${extension.toUpperCase()})`;
                        points = this.parseDelimited(content);
                    }

                    if (!points || points.length === 0) {
                        throw new Error("No valid data points found. Please check file format.");
                    }

                    console.log(`Surface Parsed: ${file.name} [${formatDetected}], ${points.length} points.`);

                    // 2. Normalization & Validation
                    // Ensure all points have numeric x, y, z
                    // Handle missing values (e.g. -9999, nulls)
                    const cleanPoints = points.filter(p => {
                        return (
                            typeof p.x === 'number' && !isNaN(p.x) &&
                            typeof p.y === 'number' && !isNaN(p.y) &&
                            typeof p.z === 'number' && !isNaN(p.z) &&
                            p.z > -9000 && p.z < 90000 // Filter out common null values like -9999.25 or 1e30
                        );
                    });

                    if (cleanPoints.length === 0) {
                         throw new Error("All points were invalid or null values.");
                    }

                    const stats = this.calculateStats(cleanPoints);
                    const crs = this.detectCrs(content, extension);

                    resolve({
                        name: file.name,
                        format: formatDetected,
                        importedAt: new Date().toISOString(),
                        points: cleanPoints,
                        ...(crs ? { crs } : {}),
                        ...stats
                    });

                } catch (error) {
                    console.error("Surface Parsing Error:", error);
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error("File reading failed"));
            reader.readAsText(file);
        });
    }

    // --- Format Detectors ---

    static isEsriAsciiGrid(content) {
        // Check for common headers like NCOLS, NROWS, XLLCORNER
        const start = content.slice(0, 200).toUpperCase();
        return start.includes('NCOLS') && start.includes('NROWS');
    }

    static isZMap(content) {
        // ZMap usually has comments starting with !
        // And header lines. This is a loose check.
        return content.trim().startsWith('!') || content.includes('nodes per line');
    }

    // --- Parsers ---

    static parseDelimited(content) {
        // Pre-processing:
        // 1. Identify the first line that looks like data (3+ numbers).
        // 2. Detect delimiter on that line.
        // 3. Strip comments (#, !, /)

        const lines = content.split('\n');
        let dataStartLine = 0;
        let delimiter = ',';

        // Heuristic to find data start
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#') || line.startsWith('!') || line.startsWith('/')) continue;
            
            // Check if line has numbers
            // Replace potential delimiters with space to check number count
            const parts = line.replace(/,/g, ' ').replace(/\t/g, ' ').split(/\s+/).filter(s => s.trim() !== '');
            const numCount = parts.filter(p => !isNaN(parseFloat(p))).length;
            
            if (numCount >= 3) {
                dataStartLine = i;
                // Guess delimiter
                if (line.includes(',')) delimiter = ',';
                else if (line.includes('\t')) delimiter = '\t';
                else delimiter = ' '; // whitespace
                break;
            }
        }

        // Use PapaParse with config derived from heuristic
        // If delimiter is space, PapaParse might struggle if not ' ', so we handle custom space parsing if needed.
        // But let's try PapaParse auto-detect first if we aren't sure, OR enforce strict delimiter if we found one.
        
        const parseConfig = {
            delimiter: delimiter === ' ' ? ' ' : delimiter, 
            dynamicTyping: true,
            skipEmptyLines: true,
            comments: "#" // Standard comment char
        };
        
        // If strictly space delimited (like many .dat or .xyz files), PapaParse can handle it if we specify delimiter.
        // However, multiple spaces are tricky.
        
        if (delimiter === ' ') {
            // Manual parsing for space/tab delimited to handle multiple spaces robustly
            const points = [];
            for (let i = dataStartLine; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('#') || line.startsWith('!')) continue;
                
                const parts = line.split(/\s+/).map(parseFloat);
                if (parts.length >= 3 && !isNaN(parts[0])) {
                    points.push({ x: parts[0], y: parts[1], z: parts[2] });
                }
            }
            return points;
        } else {
            // Use PapaParse for CSV/TSV
            // Slice content to start at dataStartLine (if headers exist, PapaParse header:false treats them as data otherwise)
            // Actually, usually we want to skip non-data header lines manually
            const dataContent = lines.slice(dataStartLine).join('\n');
            
            const results = Papa.parse(dataContent, parseConfig);
            
            // Map results
            return results.data.map(row => {
                // Filter only numeric entries just in case
                const nums = row.filter(c => typeof c === 'number');
                if (nums.length >= 3) {
                    return { x: nums[0], y: nums[1], z: nums[2] };
                }
                return null;
            }).filter(p => p !== null);
        }
    }

    static parseEsriAscii(content) {
        const lines = content.split('\n');
        const header = {};
        let dataStartIndex = 0;

        // Parse Header
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();
            const parts = line.split(/\s+/);
            
            if (parts.length === 2 && isNaN(parseFloat(parts[0]))) {
                header[parts[0]] = parseFloat(parts[1]);
                dataStartIndex = i + 1;
            } else if (parts.length > 5) {
                // Likely hit data
                break;
            }
        }

        const ncols = header['NCOLS'];
        const nrows = header['NROWS'];
        const xll = header['XLLCORNER'] || header['XLLCENTER'] || 0;
        const yll = header['YLLCORNER'] || header['YLLCENTER'] || 0;
        const cellSize = header['CELLSIZE'] || 1;
        const noData = header['NODATA_VALUE'] || -9999;

        if (!ncols || !nrows) throw new Error("Invalid ESRI ASCII Grid header");

        const points = [];
        let currentRow = 0;

        // Read Data rows
        for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const zVals = line.split(/\s+/).map(parseFloat);
            
            // Sometimes all data is on one line, sometimes split. 
            // Usually ASCII grid is row by row.
            for (let j = 0; j < zVals.length; j++) {
                const z = zVals[j];
                if (z === noData) continue;

                // Calculate X, Y
                // Note: ASCII Grid usually stores rows from Top to Bottom (maxY to minY)
                // Row 0 is maxY.
                const colIndex = (currentRow * zVals.length + j) % ncols; // Safety if wrapping occurs
                const rowIndex = Math.floor((currentRow * zVals.length + j) / ncols) + currentRow; // Simplified
                
                // Better approach: iterate logically
            }
        }
        
        // Re-implement simpler reading logic for ASCII Grid
        // Collect all Z values into single array first
        const allZ = [];
        for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                allZ.push(...line.split(/\s+/).map(parseFloat));
            }
        }

        if (allZ.length < ncols * nrows) {
            console.warn("ASCII Grid: Not enough data points found vs Header");
        }

        for (let r = 0; r < nrows; r++) {
            for (let c = 0; c < ncols; c++) {
                const idx = r * ncols + c;
                if (idx >= allZ.length) break;
                
                const z = allZ[idx];
                if (z === noData) continue;

                const x = xll + (c * cellSize);
                // Y usually starts at top (nrows-1) * cellsize + yll
                const y = yll + ((nrows - 1 - r) * cellSize);

                points.push({ x, y, z });
            }
        }

        return points;
    }

    // Best-effort coordinate reference system sniff. Only some formats carry it:
    // GeoJSON via the legacy `crs` member (OGC still emits it) and ESRI/ZMap grids
    // that reference an EPSG code in a comment/header. Returns a display string
    // (e.g. "EPSG:32631") or null so the user can confirm/override on import.
    static detectCrs(content, extension) {
        try {
            if (extension === 'json' || extension === 'geojson') {
                const json = JSON.parse(content);
                const name = json?.crs?.properties?.name; // e.g. "urn:ogc:def:crs:EPSG::32631"
                if (typeof name === 'string') {
                    const m = name.match(/EPSG:*:?(\d{4,6})/i);
                    if (m) return `EPSG:${m[1]}`;
                    return name;
                }
            }
            const epsg = content.slice(0, 4000).match(/EPSG[:\s]*(\d{4,6})/i);
            if (epsg) return `EPSG:${epsg[1]}`;
        } catch { /* unparseable — no CRS */ }
        return null;
    }

    static parseJson(content) {
        const json = JSON.parse(content);
        if (Array.isArray(json)) {
            return json.map(p => ({ 
                x: p.x !== undefined ? p.x : p.X, 
                y: p.y !== undefined ? p.y : p.Y, 
                z: p.z !== undefined ? p.z : p.Z || 0 
            }));
        }
        if (json.features) {
            return json.features.map(f => {
                const c = f.geometry.coordinates;
                return { x: c[0], y: c[1], z: c[2] || 0 };
            });
        }
        return [];
    }

    static calculateStats(points) {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let sumZ = 0;

        const count = points.length;
        if (count === 0) return { pointCount: 0 };

        for (let i = 0; i < count; i++) {
            const p = points[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
            sumZ += p.z;
        }

        const avgZ = sumZ / count;
        const width = maxX - minX;
        const height = maxY - minY;
        const estimatedArea = width * height;

        return {
            minX, maxX, minY, maxY, minZ, maxZ, avgZ,
            pointCount: count,
            estimatedArea
        };
    }
}