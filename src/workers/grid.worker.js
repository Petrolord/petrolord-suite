/* eslint-disable no-restricted-globals */
function processGrid(gridData) {
        // Placeholder for a more complex grid processing logic
        // For now, it just validates and passes the data through
        if (!gridData || !gridData.values || gridData.values.length === 0) {
            throw new Error('Invalid grid data format');
        }
        const min = Math.min(...gridData.values.flat().filter(v => v !== gridData.nodata_value));
        const max = Math.max(...gridData.values.flat().filter(v => v !== gridData.nodata_value));

        return { ...gridData, min, max };
    }
    
    self.onmessage = (event) => {
        const { gridData } = event.data;
        try {
            const processedGrid = processGrid(gridData);
            self.postMessage({ success: true, data: processedGrid });
        } catch (error) {
            self.postMessage({ success: false, error: error.message });
        }
    };