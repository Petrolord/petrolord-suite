
/* global console, process */
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

console.log('🚀 Initiating ULTRA-LIGHT Production Build...');

async function run() {
  try {
    // 1. Pre-build cleanup
    console.log('🧹 Cleaning dist folder...');
    if (fs.existsSync('dist')) {
      fs.rmSync('dist', { recursive: true, force: true });
    }

    // 2. Audit (non-blocking)
    console.log('🔍 Auditing dependencies...');
    await execAsync('node scripts/audit-dependencies.js');

    // 3. Build with Ultra-Light Config
    console.log('🏗️  Building with vite.config.ultra-light.js...');
    const { stdout } = await execAsync('vite build --config vite.config.ultra-light.js');
    console.log(stdout);

    // 4. Size Verification
    console.log('📏 Verifying build size...');
    await execAsync('node scripts/verify-build-size.js');

    console.log('\n✅ ULTRA-LIGHT BUILD COMPLETE SUCCESSFULLY');
    
  } catch (error) {
    console.error('\n❌ BUILD FAILED:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

run();
