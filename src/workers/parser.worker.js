/* eslint-disable no-restricted-globals */
import Papa from 'papaparse';

    const parseLAS = (text) => {
        const lines = text.split(/\r\n|\n/);
        let headerData = {};
        let curveInfo = [];
        let inCurveSection = false;
        let inDataSection = false;
        let curveNames = [];
        let dataLines = [];
    
        for (const line of lines) {
            if (line.trim().startsWith('#') || line.trim() === '') continue;
    
            if (line.toUpperCase().startsWith('~C')) {
                inCurveSection = true;
                inDataSection = false;
                continue;
            }
            if (line.toUpperCase().startsWith('~A')) {
                inCurveSection = false;
                inDataSection = true;
                curveNames = curveInfo.map(c => c.mnemonic);
                continue;
            }
            if (line.toUpperCase().startsWith('~')) {
                inCurveSection = false;
                inDataSection = false;
                continue;
            }
    
            if (inCurveSection) {
                const parts = line.trim().split(/\s+/);
                const mnemonic = parts[0].split('.')[0];
                curveInfo.push({ mnemonic });
            } else if (inDataSection) {
                dataLines.push(line.trim());
            }
        }
    
        const data = dataLines.map(line => {
            const values = line.split(/\s+/).map(parseFloat);
            let row = {};
            curveNames.forEach((name, i) => {
                row[name] = values[i];
            });
            return row;
        });
    
        return { curves: curveNames, data: data, header: headerData };
    };

    self.onmessage = (event) => {
      const { fileContent, fileType } = event.data;
      try {
        let parsedData;
        if (fileType === 'csv') {
          parsedData = Papa.parse(fileContent, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
          }).data;
        } else if (fileType === 'json') {
          parsedData = JSON.parse(fileContent);
        } else if (fileType === 'las') {
          parsedData = parseLAS(fileContent);
        } else {
          throw new Error('Unsupported file type for parsing');
        }
        self.postMessage({ success: true, data: parsedData });
      } catch (error) {
        self.postMessage({ success: false, error: error.message });
      }
    };