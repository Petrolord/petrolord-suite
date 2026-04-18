
/* global console, process */
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function preBuildChecks() {
  console.log('🔍 Running pre-build checks...');
  if (!fs.existsSync(path.join(rootDir, 'package.json'))) {
    throw new Error('package.json not found');
  }
  // Ensure clean state
  if (fs.existsSync(path.join(rootDir, 'dist'))) {
    fs.rmSync(path.join(rootDir, 'dist'), { recursive: true, force: true });
  }
}

async function optimizedBuild() {
  console.log('🏗️  Starting optimized build...');
  // Use the optimized config
  const { stdout, stderr } = await execAsync('vite build --config vite.config.optimized.js');
  console.log(stdout);
  if (stderr) console.warn(stderr);
}

function analyzeBuildSize() {
  console.log('📊 Analyzing build size...');
  const distDir = path.join(rootDir, 'dist');
  
  if (!fs.existsSync(distDir)) {
    console.error('❌ Build folder not found!');
    return;
  }

  const getAllFiles = (dirPath, arrayOfFiles) => {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(file => {
      if (fs.statSync(dirPath + "/" + file).isDirectory()) {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      } else {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    });
    return arrayOfFiles;
  };

  const files = getAllFiles(distDir);
  let totalSize = 0;

  files.forEach(file => {
    const stats = fs.statSync(file);
    totalSize += stats.size;
  });

  const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
  console.log(`📦 Total Bundle Size: ${sizeMB} MB`);
  
  if (sizeMB > 15) {
    console.warn('⚠️  Warning: Bundle size is larger than 15MB. Consider further splitting.');
  }
}

async function main() {
  try {
    await preBuildChecks();
    await optimizedBuild();
    analyzeBuildSize();
    console.log('✅ Production build completed successfully.');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

main();
