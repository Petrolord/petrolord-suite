
/* global console, process */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(path.resolve(__dirname, '..'), 'dist');

// Limits configuration
const LIMITS = {
  totalMB: 50,
  jsChunkKB: 500,
  cssChunkKB: 300
};

console.log('📏 Verifying Build Size Limits...');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ directory not found. Run build first.');
  process.exit(1);
}

let totalSize = 0;
let oversizedChunks = [];

function scan(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scan(fullPath);
    } else {
      totalSize += stat.size;
      const sizeKB = stat.size / 1024;
      
      if (file.endsWith('.js') && sizeKB > LIMITS.jsChunkKB) {
        oversizedChunks.push({ file, size: sizeKB });
      }
    }
  });
}

scan(distDir);

const totalMB = totalSize / 1024 / 1024;
console.log(`📦 Total Bundle Size: ${totalMB.toFixed(2)} MB`);

if (totalMB > LIMITS.totalMB) {
  console.error(`❌ Total size exceeds limit of ${LIMITS.totalMB} MB`);
  process.exit(1);
}

if (oversizedChunks.length > 0) {
  console.warn(`⚠️  ${oversizedChunks.length} chunks exceed ${LIMITS.jsChunkKB} KB limit:`);
  oversizedChunks.forEach(c => console.log(`   - ${c.file}: ${c.size.toFixed(2)} KB`));
  // We don't fail build for this, just warn
} else {
  console.log('✅ All chunks within size limits.');
}

console.log('✅ Verification Passed.');
