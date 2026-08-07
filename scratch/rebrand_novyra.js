const fs = require('fs');
const path = require('path');

const rootDir = 'c:\\Users\\Windows 11\\OneDrive\\Desktop\\GastosApp v0.1';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (file === 'node_modules' || file === '.git' || file === '.gemini' || file === 'brain') return;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk(rootDir);
let count = 0;

files.forEach(file => {
  const ext = path.extname(file).toLowerCase();
  if (['.html', '.json', '.js', '.ts', '.xml', '.gradle', '.java', '.md', '.txt', '.toml'].includes(ext)) {
    try {
      let content = fs.readFileSync(file, 'utf8');
      let updated = content;

      // Reemplazos de variantes de NOVYRA / NOVYRA -> NOVYRA
      updated = updated.replace(/NOVYRA/g, 'NOVYRA');
      updated = updated.replace(/Novyra/g, 'Novyra');
      updated = updated.replace(/novyra/g, 'novyra');

      updated = updated.replace(/NOVYRA/g, 'NOVYRA');
      updated = updated.replace(/Novyra/g, 'Novyra');
      updated = updated.replace(/novyra/g, 'novyra');

      updated = updated.replace(/com\.novyra\.app/g, 'com.novyra.app');
      updated = updated.replace(/com\.novyra\.app/g, 'com.novyra.app');

      if (updated !== content) {
        fs.writeFileSync(file, updated, 'utf8');
        console.log(`Updated: ${file}`);
        count++;
      }
    } catch(e) {
      console.error(`Error processing ${file}: ${e.message}`);
    }
  }
});

console.log(`Rebranding complete! Total files updated: ${count}`);
