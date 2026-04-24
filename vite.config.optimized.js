import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Production build config - assume production mode
const isDev = false;

/**
 * Optimized Production Build Configuration
 * - Implements aggressive code splitting
 * - Uses Terser for minification
 * - Disables source maps for smaller bundle size
 * - Increases chunk size warnings
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve('src'),
    },
  },
  build: {
    outDir: 'dist',
    minify: 'terser', // Explicitly use terser for better minification
    terserOptions: {
      compress: {
        drop_console: !isDev, // Remove console.log in production
        drop_debugger: !isDev,
        pure_funcs: isDev ? [] : ['console.log', 'console.info', 'console.debug'],
      },
      format: {
        comments: false, // Remove comments
      },
    },
    sourcemap: false, // Disable source maps to reduce build size and time
    reportCompressedSize: false, // Speed up build by skipping GZIP reporting
    chunkSizeWarningLimit: 2000, // Increase warning limit for large chunks
    rollupOptions: {
      output: {
        // Intelligent Code Splitting Strategy
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Core React Vendor
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            // 3D Visualization Vendor (Heavy)
            if (id.includes('three') || id.includes('@react-three') || id.includes('drei')) {
              return 'vendor-3d';
            }
            // Charting Vendor
            if (id.includes('echarts') || id.includes('chart.js') || id.includes('recharts') || id.includes('plotly.js')) {
              return 'vendor-charts';
            }
            // Mapping Vendor
            if (id.includes('leaflet') || id.includes('maplibre-gl') || id.includes('deck.gl')) {
              return 'vendor-maps';
            }
            // UI Library Vendor
            if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('framer-motion')) {
              return 'vendor-ui';
            }
            // Data Processing Vendor
            if (id.includes('lodash') || id.includes('date-fns') || id.includes('papaparse') || id.includes('xlsx')) {
              return 'vendor-utils';
            }
            
            // General fallback for other node_modules
            return 'vendor';
          }
        },
      },
    },
  },
});