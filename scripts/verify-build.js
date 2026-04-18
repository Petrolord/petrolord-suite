
/* global console, process */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

console.log('Starting build verification...');

let errorCount = 0;

// 1. Check Critical Configuration Files
const configFiles = ['package.json', 'vite.config.js', 'index.html'];
configFiles.forEach(file => {
    if (!fs.existsSync(path.join(rootDir, file))) {
        console.error(`❌ Missing critical file: ${file}`);
        errorCount++;
    } else {
        console.log(`✅ Found ${file}`);
    }
});

// 2. Check Critical Source Files
const srcFiles = ['main.jsx', 'App.jsx', 'index.css'];
srcFiles.forEach(file => {
    if (!fs.existsSync(path.join(srcDir, file))) {
        console.error(`❌ Missing source file: src/${file}`);
        errorCount++;
    } else {
        console.log(`✅ Found src/${file}`);
    }
});

// 3. Basic Import Scan (Naive implementation)
// This scans .jsx/.js files for imports starting with @/ and verifies existence
function scanDirectory(directory) {
    const files = fs.readdirSync(directory);
    
    files.forEach(file => {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            scanDirectory(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const importRegex = /from ['"]@\/([^'"]+)['"]/g;
            let match;
            
            while ((match = importRegex.exec(content)) !== null) {
                const importPath = match[1];
                // Try to resolve
                const potentialExtensions = ['', '.js', '.jsx', '.ts', '.tsx'];
                let found = false;
                
                for (const ext of potentialExtensions) {
                    const checkPath = path.join(srcDir, importPath + ext);
                    // Handle index files
                    const indexCheckPath = path.join(srcDir, importPath, 'index' + ext);
                    
                    if (fs.existsSync(checkPath) || fs.existsSync(indexCheckPath)) {
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    // Ignore image imports or other assets for this basic check if strictly checking code
                    if (!importPath.endsWith('.png') && !importPath.endsWith('.svg')) {
                        console.warn(`⚠️ Potential broken import in ${path.relative(srcDir, fullPath)}: @/${importPath}`);
                    }
                }
            }
        }
    });
}

try {
    scanDirectory(srcDir);
} catch (e) {
    console.error("Error scanning directory:", e);
}

if (errorCount > 0) {
    console.error(`\nBuild verification failed with ${errorCount} critical errors.`);
    process.exit(1);
} else {
    console.log('\nBuild verification passed basic checks.');
    process.exit(0);
}
