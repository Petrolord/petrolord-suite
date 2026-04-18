import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { deploymentConfig } from './src/config/deploymentOptimization.js';

// Production build config - assume production mode
const isDev = false;

/**
 * Production-specific Vite Configuration
 * optimized for speed and bundle size
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve('src'),
    },
  },
  build: {
    // Use config from deployment optimization
    target: 'esnext',
    outDir: 'dist',
    minify: 'terser',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1500,
    terserOptions: {
      compress: {
        drop_console: !isDev,
        drop_debugger: !isDev,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
            if (id.includes('three') || id.includes('drei') || id.includes('fiber')) return 'three-vendor';
            if (id.includes('echarts') || id.includes('chart.js') || id.includes('plotly')) return 'charts-vendor';
            if (id.includes('leaflet') || id.includes('maplibre')) return 'maps-vendor';
            if (id.includes('framer-motion')) return 'animation-vendor';
            if (id.includes('@radix-ui')) return 'ui-vendor';
            return 'vendor';
          }
        }
      }
    }
  },
});