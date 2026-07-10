import Papa from 'papaparse';

/**
 * A parse failure that carries a plain-language explanation and, where possible,
 * concrete next steps for the (non-programmer) user. `title` is a short label,
 * `message` explains what went wrong, `guidance` is an array of what-to-do-next
 * bullets. Thrown by SurfaceParser and rendered by the import dialog.
 */
export class SurfaceParseError extends Error {
    constructor(title, message, guidance = []) {
        super(message);
        this.name = 'SurfaceParseError';
        this.title = title;
        this.guidance = guidance;
    }
}

// Generic guidance shown for most "this isn't a surface" failures.
const GENERIC_GUIDANCE = [
    'A depth/structure surface is a text file with three numeric columns: X (easting), Y (northing) and Z (depth or elevation).',
    'Accepted formats: XYZ, CSV, DAT, ESRI ASCII grid (.asc), ZMap+ (.dat), CPS-3, or GeoJSON.',
    'Export the surface from your mapping package as "XYZ points" or "ASCII grid" and try again.',
];

export class SurfaceParser {
    static async parse(file) {
        const extension = file.name.split('.').pop().toLowerCase();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const content = e.target.result;

                    // 0. Reject obviously-wrong files up front with a clear reason,
                    //    rather than letting the lenient parser fail cryptically (or,
                    //    worse, "succeed" on a handful of stray numbers).
                    this.assertLooksLikeSurface(content, file, extension);

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
                        throw new SurfaceParseError(
                            'No data points found',
                            `We opened "${file.name}" but couldn't find any rows of X Y Z numbers in it.`,
                            GENERIC_GUIDANCE,
                        );
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
                            !SurfaceParser.isNullZ(p.z)
                        );
                    });

                    if (cleanPoints.length === 0) {
                        throw new SurfaceParseError(
                            'No usable depth values',
                            `Every row in "${file.name}" was empty or a null/undefined marker (e.g. -9999), so there is nothing to map.`,
                            [
                                'Check that the third column really contains depth/elevation values.',
                                'If your file uses a special "no-data" value, make sure real data is also present.',
                            ],
                        );
                    }

                    // 3. Geometry sanity — a surface must be a genuine 2D field, not a
                    //    single point, a straight line (e.g. a well path or a fault
                    //    polyline), or an all-flat constant.
                    const stats = this.calculateStats(cleanPoints);
                    const warnings = this.validateGeometry(cleanPoints, stats, file);

                    const crs = this.detectCrs(content, extension);

                    resolve({
                        name: file.name,
                        format: formatDetected,
                        importedAt: new Date().toISOString(),
                        points: cleanPoints,
                        ...(warnings.length ? { warnings } : {}),
                        ...(crs ? { crs } : {}),
                        ...stats
                    });

                } catch (error) {
                    console.error("Surface Parsing Error:", error);
                    reject(error);
                }
            };

            reader.onerror = () => reject(new SurfaceParseError(
                'File could not be read',
                `The browser was unable to read "${file.name}". The file may be corrupt or still downloading.`,
                ['Re-download or re-export the file, then try importing it again.'],
            ));
            reader.readAsText(file);
        });
    }

    // --- Pre-flight validation -------------------------------------------------

    // Throw a friendly SurfaceParseError when the uploaded file clearly isn't a
    // depth/property surface (a binary, a well log, a spreadsheet of production
    // data, etc.). Kept deliberately loose so real surfaces are never blocked.
    // Null/no-data detection for z values. Previously this was a blunt
    // `z > -9000 && z < 90000` window, which silently discarded every
    // surface deeper than 9,000 ft (deep-water horizons routinely sit at
    // -10,000 to -20,000 ft, e.g. Seismolord depth exports). Now: reject
    // the specific well-known sentinels and physically implausible
    // magnitudes, keep everything else.
    static isNullZ(z) {
        if (!Number.isFinite(z)) return true;
        if (Math.abs(z) >= 1e29) return true;                 // 1.0E+30 grid nulls
        const SENTINELS = [-9999, -9999.25, -9999.99, -999.25, 999.25, 9999.25];
        if (SENTINELS.some(s => Math.abs(z - s) < 1e-6)) return true;
        return Math.abs(z) > 100000;                          // beyond plausible depth/elevation
    }

    static assertLooksLikeSurface(content, file, extension) {
        if (content == null || content.length === 0) {
            throw new SurfaceParseError(
                'The file is empty',
                `"${file.name}" contains no data.`,
                ['Check you selected the right file, then export it again from your mapping software.'],
            );
        }

        const head = content.slice(0, 4000);

        // Binary / non-text: image, PDF, Petrel/Kingdom native, SEG-Y, DLIS, Excel…
        // A run of NUL bytes or a high proportion of control characters is the tell.
        const controlChars = (head.match(/[\x00-\x08\x0e-\x1f]/g) || []).length;
        if (head.includes('\x00') || controlChars > head.length * 0.05) {
            throw new SurfaceParseError(
                'This is not a text surface file',
                `"${file.name}" looks like a binary file (an image, PDF, spreadsheet, or a program's native project file) rather than a text grid of X Y Z values.`,
                [
                    'Surfaces must be exported as a plain-text format before import.',
                    ...GENERIC_GUIDANCE.slice(1),
                ],
            );
        }

        // Well-log ASCII (LAS) — a common mistake, since it is text and full of numbers.
        const upperHead = head.toUpperCase();
        if (/~VERSION|~WELL|~CURVE|~ASCII/.test(upperHead) || extension === 'las') {
            throw new SurfaceParseError(
                'This looks like a well log, not a surface',
                `"${file.name}" appears to be an LAS well-log file. Those hold measurements down a single borehole, not a mapped surface.`,
                [
                    'Import a mapped depth/structure surface instead (top or base of the reservoir).',
                    ...GENERIC_GUIDANCE.slice(0, 2),
                ],
            );
        }

        // PDF / rich documents mis-saved with a text extension.
        if (head.startsWith('%PDF') || upperHead.includes('<!DOCTYPE HTML') || upperHead.includes('<HTML')) {
            throw new SurfaceParseError(
                'This is a document, not surface data',
                `"${file.name}" is a PDF or web page, which can't be used as a reservoir surface.`,
                GENERIC_GUIDANCE,
            );
        }

        // Does the body contain at least one line with 3+ numbers? If not, it may be
        // a header-only file, a well deviation survey with the wrong columns, etc.
        const lines = content.split('\n');
        let numericRows = 0;
        for (let i = 0; i < Math.min(lines.length, 400); i++) {
            const parts = lines[i].replace(/[,\t]/g, ' ').trim().split(/\s+/);
            const nums = parts.filter(p => p !== '' && !isNaN(parseFloat(p)) && isFinite(p));
            if (nums.length >= 3) { numericRows++; if (numericRows >= 2) break; }
        }
        if (numericRows < 2) {
            throw new SurfaceParseError(
                "We couldn't find X Y Z columns",
                `"${file.name}" doesn't contain rows of at least three numbers (easting, northing, depth), so it can't be read as a surface.`,
                GENERIC_GUIDANCE,
            );
        }
    }

    // Non-fatal quality checks — returned as warnings so the user is told when an
    // import succeeds but the surface looks degenerate (likely the wrong file).
    static validateGeometry(points, stats, file) {
        const warnings = [];
        const width = stats.maxX - stats.minX;
        const height = stats.maxY - stats.minY;

        if (points.length < 10) {
            warnings.push(`Only ${points.length} data point${points.length === 1 ? '' : 's'} were found — too few to build a reliable map. Contours and volumes may be unstable.`);
        }
        if (width === 0 || height === 0) {
            warnings.push('All points fall on a single line (zero width or height). This looks like a well path or a polyline, not a 2D surface — the map cannot be gridded properly.');
        } else {
            const aspect = Math.max(width, height) / Math.min(width, height);
            if (aspect > 500) {
                warnings.push('The points are almost collinear (extremely long and thin). Check this is a mapped surface and not a well trajectory or a cross-section.');
            }
        }
        if (stats.maxZ - stats.minZ === 0) {
            warnings.push(`Every depth value is identical (${stats.minZ}). A perfectly flat surface produces no structural relief and no contours — check the depth column.`);
        }
        return warnings;
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