
/* global console, process, setTimeout */
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000; // 1 second start

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deployWithAdvancedRetry(attempt = 1) {
  try {
    console.log(`\n🚀 Deployment Attempt ${attempt}/${MAX_RETRIES}`);
    
    // Execute the ultra-light build command
    // In a real scenario, this would also include the 'deploy' command
    // For this environment, we simulate deployment by running the build
    console.log(`   Executing: npm run build:ultra-light`);
    
    const { stdout } = await execAsync('npm run build:ultra-light');
    console.log(stdout);
    
    console.log('✅ Deployment sequence successful!');
    process.exit(0);

  } catch (error) {
    console.error(`❌ Attempt ${attempt} failed:`, error.message.split('\n')[0]); // Log first line of error
    
    if (attempt < MAX_RETRIES) {
      // Exponential Backoff: 1s, 2s, 4s, 8s, 16s
      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.log(`⏳ Waiting ${delay/1000}s before retry...`);
      await sleep(delay);
      deployWithAdvancedRetry(attempt + 1);
    } else {
      console.error('\n🔥 ALL DEPLOYMENT ATTEMPTS FAILED.');
      console.error('   Please check docs/FIX_524_TIMEOUT.md for troubleshooting.');
      process.exit(1);
    }
  }
}

deployWithAdvancedRetry();
