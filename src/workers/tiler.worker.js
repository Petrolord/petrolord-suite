/* eslint-disable no-restricted-globals */

self.onmessage = async (event) => {
    const { file, tileSize, signal } = event.data;

    if (signal) {
        signal.onabort = () => {
            self.close();
        };
    }

    if (!file) {
        self.postMessage({ status: 'error', error: 'No file provided to worker.' });
        return;
    }

    try {
        const imageBitmap = await createImageBitmap(file);
        const { width, height } = imageBitmap;

        const numTilesX = Math.ceil(width / tileSize);
        const numTilesY = Math.ceil(height / tileSize);
        const totalTiles = numTilesX * numTilesY;

        self.postMessage({ status: 'start', totalTiles });

        const canvas = new OffscreenCanvas(tileSize, tileSize);
        const ctx = canvas.getContext('2d');

        for (let y = 0; y < numTilesY; y++) {
            for (let x = 0; x < numTilesX; x++) {
                if (signal && signal.aborted) {
                    self.postMessage({ status: 'aborted' });
                    return;
                }

                const sx = x * tileSize;
                const sy = y * tileSize;

                ctx.clearRect(0, 0, tileSize, tileSize);
                ctx.drawImage(imageBitmap, sx, sy, tileSize, tileSize, 0, 0, tileSize, tileSize);

                const blob = await canvas.convertToBlob({ type: 'image/png' });
                
                self.postMessage({
                    status: 'tile',
                    tile: { blob, x, y },
                    processedTiles: (y * numTilesX) + x + 1,
                });
            }
        }

        imageBitmap.close();
        self.postMessage({ status: 'end' });
    } catch (error) {
        if (error.name !== 'AbortError') {
            self.postMessage({ status: 'error', error: `Tiling failed: ${error.message}` });
        }
    }
};