
/* global console, process, setTimeout */
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);
const MAX_RETRIES = 3;
const BASE_DELAY = 5000; // 5 seconds

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deployWithRetry(attempt = 1) {
  try {
    console.log(`🚀 Deployment Attempt ${attempt}/${MAX_RETRIES}...`);
    console.log('   Running optimized build...');
    
    // Use the new optimized build script
    const { stdout, stderr } = await execAsync('npm run build:fast');
    console.log(stdout);
    
    console.log('✅ Build successful!');
    // In a real scenario, the 'deploy' command would happen here.
    // Since we are just building for the purpose of this environment:
    process.exit(0);

  } catch (error) {
    console.error(`❌ Attempt ${attempt} failed.`);
    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY * attempt;
      console.log(`⏳ Retrying in ${delay/1000} seconds...`);
      await sleep(delay);
      deployWithRetry(attempt + 1);
    } else {
      console.error('🔥 All deployment attempts failed.');
      process.exit(1);
    }
  }
}

deployWithRetry();
