const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'locales');
const targetDir = path.join(__dirname, '..', 'docs', 'locales');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy all JSON files from locales to docs/locales
const files = fs.readdirSync(sourceDir);
files.forEach(file => {
  if (file.endsWith('.json')) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied: ${file}`);
  }
});

console.log('Locales copied successfully!');
