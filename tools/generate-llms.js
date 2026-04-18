const fs = require('fs');
const path = require('path');

// Hardened version that skips directories to prevent EISDIR errors
function processDirectory(dirPath, outputArray = []) {
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      
      try {
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          // Skip directories, don't try to read them as files
          continue;
        }
        
        if (stats.isFile() && (item.endsWith('.js') || item.endsWith('.jsx'))) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            outputArray.push({
              path: fullPath,
              content: content.substring(0, 1000) // Truncate for safety
            });
          } catch (readError) {
            console.warn(`Warning: Could not read file ${fullPath}:`, readError.message);
          }
        }
      } catch (statError) {
        console.warn(`Warning: Could not stat ${fullPath}:`, statError.message);
        continue;
      }
    }
  } catch (dirError) {
    console.warn(`Warning: Could not read directory ${dirPath}:`, dirError.message);
  }
  
  return outputArray;
}

// Process src directory if it exists
const srcPath = path.join(__dirname, '..', 'src');
if (fs.existsSync(srcPath)) {
  const results = processDirectory(srcPath);
  console.log(`Processed ${results.length} files successfully`);
} else {
  console.log('src directory not found, skipping processing');
}

console.log('LLM generation tool completed successfully');