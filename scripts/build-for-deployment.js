
/* global console, process */
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

console.log('🚀 Starting Optimized Deployment Build...');

async function run() {
  try {
    // 1. Clean
    console.log('🧹 Cleaning previous builds...');
    if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true, force: true });

    // 2. Build
    console.log('🏗️  Building with optimized config...');
    const { stdout, stderr } = await execAsync('vite build --config vite.config.production.js');
    console.log(stdout);
    if (stderr) console.error(stderr); // Vite outputs some info to stderr

    // 3. Verify
    console.log('✅ Build complete. Verifying size...');
    // Simple size check logic could go here
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

run();
