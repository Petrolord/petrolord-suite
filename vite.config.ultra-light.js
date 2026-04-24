import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

// Production build config - assume production mode
const isDev = false;

// Aggressive Ultra-Light Build Configuration
export default defineConfig({
  plugins: [
    react(),
    // Generate a report to help identify large chunks
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false, // Don't auto-open in CI/CD
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve('src'),
    },
  },
  build: {
    target: 'esnext', // Modern browsers only for smaller code
    outDir: 'dist',
    minify: 'terser', // Use Terser for better minification than esbuild
    cssCodeSplit: true,
    sourcemap: false, // CRITICAL: No source maps for production to save memory/time
    reportCompressedSize: false, // CRITICAL: Skip compression report to speed up build
    chunkSizeWarningLimit: 500, // Strict warning limit (500KB)
    assetsInlineLimit: 4096, // Inline small assets to reduce requests
    
    terserOptions: {
      compress: {
        drop_console: !isDev,
        drop_debugger: !isDev,
        pure_funcs: isDev ? [] : ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 2, // Multiple passes for better optimization
        ecma: 2020,
        unsafe: true, // Aggressive optimizations
        unsafe_arrows: true,
        unsafe_methods: true,
      },
      format: {
        comments: false, // Remove all comments
      },
      mangle: {
        safari10: true,
      },
    },
    
    rollupOptions: {
      output: {
        // Aggressive manual chunking to split up large vendor files
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Core React
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            // Visualization Libraries (Heavy)
            if (id.includes('three') || id.includes('@react-three')) return 'vendor-3d';
            if (id.includes('echarts') || id.includes('zrender')) return 'vendor-charts';
            if (id.includes('leaflet') || id.includes('maplibre') || id.includes('deck.gl')) return 'vendor-maps';
            if (id.includes('plotly')) return 'vendor-plotly';
            if (id.includes('d3')) return 'vendor-d3';
            
            // UI Frameworks
            if (id.includes('@radix-ui') || id.includes('framer-motion')) return 'vendor-ui';
            
            // Utilities
            if (id.includes('lodash') || id.includes('date-fns') || id.includes('moment')) return 'vendor-utils';
            
            // Default vendor chunk
            return 'vendor-common';
          }
          
          // Split application code by feature directories if possible
          if (id.includes('src/pages/apps/')) {
            const match = id.match(/src\/pages\/apps\/([^/]+)/);
            if (match) return `app-${match[1].toLowerCase()}`;
          }
        },
        // Hash in filenames for better caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      // Tree shaking
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },
  },
});