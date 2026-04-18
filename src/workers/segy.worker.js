/* eslint-disable no-restricted-globals */

// A simplified SEG-Y parser for in-browser processing of 'lite' seismic data.
// This code is designed to run in a Web Worker to avoid blocking the main UI thread.

// Function to convert 4-byte IBM floating point to standard IEEE 754 float
function ibmToFloat(dataView, offset) {
    const word = dataView.getUint32(offset, false);
    if (word === 0) return 0.0;

    const sign = (word >> 31) & 1 ? -1 : 1;
    let exponent = (word >> 24) & 0x7F;
    const fraction = word & 0x00FFFFFF;

    exponent = (exponent - 64) * 4;

    let mantissa = fraction / Math.pow(2, 24);
    return sign * mantissa * Math.pow(2, exponent);
}

function readBinaryHeader(buffer) {
  const dataView = new DataView(buffer, 3200, 400);
  return {
    sampleInterval: dataView.getInt16(16, false), // in microseconds
    samplesPerTrace: dataView.getInt16(20, false),
    dataFormat: dataView.getInt16(24, false),
  };
}

function readTraceHeader(dataView, traceOffset) {
  return {
    inline: dataView.getInt32(traceOffset + 188, false),
    crossline: dataView.getInt32(traceOffset + 192, false),
  };
}

function getBytesPerSample(dataFormat) {
    switch(dataFormat) {
        case 1: case 2: case 5: return 4;
        case 3: return 2;
        case 8: return 1;
        default: return null;
    }
}

function readTraceData(dataView, traceDataOffset, samplesPerTrace, dataFormat) {
  const traceData = new Float32Array(samplesPerTrace);
  for (let i = 0; i < samplesPerTrace; i++) {
    let value;
    const currentOffset = traceDataOffset + i * getBytesPerSample(dataFormat);
    switch (dataFormat) {
      case 1: value = ibmToFloat(dataView, currentOffset); break;
      case 2: value = dataView.getInt32(currentOffset, false); break;
      case 3: value = dataView.getInt16(currentOffset, false); break;
      case 5: value = dataView.getFloat32(currentOffset, false); break;
      case 8: value = dataView.getInt8(currentOffset, false); break;
      default: value = 0; break;
    }
    traceData[i] = value;
  }
  return traceData;
}

async function handleParsing(file, parseMode, sliceIndex) {
    const buffer = await file.arrayBuffer();
    const dataView = new DataView(buffer);

    const binaryHeader = readBinaryHeader(buffer);
    const { sampleInterval, samplesPerTrace, dataFormat } = binaryHeader;

    const bytesPerSample = getBytesPerSample(dataFormat);
    if (bytesPerSample === null) {
        throw new Error(`Unsupported data format code: ${dataFormat}`);
    }

    const dt_ms = sampleInterval / 1000;
    const t0_ms = 0;

    const traceLengthBytes = 240 + samplesPerTrace * bytesPerSample;
    const totalTraces = Math.floor((buffer.byteLength - 3600) / traceLengthBytes);

    if (totalTraces <= 0) {
        return { traces: [], stats: { min: 0, max: 0 }, samplesPerTrace, error: "No traces found in file." };
    }

    let minInline = Infinity, maxInline = -Infinity;
    let minCrossline = Infinity, maxCrossline = -Infinity;
    let is3D = false;

    const tracesToScan = Math.min(totalTraces, 100);
    for (let i = 0; i < tracesToScan; i++) {
        const traceOffset = 3600 + i * traceLengthBytes;
        const traceHeader = readTraceHeader(dataView, traceOffset);
        if (traceHeader.inline !== 0) {
            minInline = Math.min(minInline, traceHeader.inline);
            maxInline = Math.max(maxInline, traceHeader.inline);
        }
        if (traceHeader.crossline !== 0) {
            minCrossline = Math.min(minCrossline, traceHeader.crossline);
            maxCrossline = Math.max(maxCrossline, traceHeader.crossline);
        }
    }
    if (maxInline > minInline || maxCrossline > minCrossline) {
        is3D = true;
    }

    if (parseMode === 'headerScan') {
        return {
            is3D,
            ilRange: is3D ? [minInline, maxInline] : [1, 1],
            xlRange: is3D ? [minCrossline, maxCrossline] : [1, totalTraces],
            samplesPerTrace, dt_ms, t0_ms, totalTraces
        };
    }

    const sectionTraces = [];
    let minVal = Infinity, maxVal = -Infinity;

    for (let i = 0; i < totalTraces; i++) {
        const traceOffset = 3600 + i * traceLengthBytes;
        let shouldInclude = false;

        if (is3D && (parseMode === 'inline' || parseMode === 'crossline')) {
            const traceHeader = readTraceHeader(dataView, traceOffset);
            const matchKey = parseMode === 'inline' ? traceHeader.inline : traceHeader.crossline;
            if (matchKey === sliceIndex) shouldInclude = true;
        } else {
            shouldInclude = true;
        }

        if (shouldInclude) {
            const traceDataOffset = traceOffset + 240;
            const traceData = readTraceData(dataView, traceDataOffset, samplesPerTrace, dataFormat);
            for (const val of traceData) {
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
            sectionTraces.push(traceData);
        }
    }

    if (sectionTraces.length === 0 && is3D) {
        return { traces: [], stats: { min: 0, max: 0 }, samplesPerTrace };
    }

    return { traces: sectionTraces, stats: { min: minVal, max: maxVal }, samplesPerTrace, dt_ms, t0_ms };
}


self.onmessage = async (e) => {
    const { file, parseMode, sliceIndex } = e.data;
    try {
        const result = await handleParsing(file, parseMode, sliceIndex);
        self.postMessage({ success: true, result });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};