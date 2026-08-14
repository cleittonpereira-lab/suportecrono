import fs from 'fs';
import path from 'path';

const routesDir = path.join(process.cwd(), 'src', 'routes');

function cleanup(dir) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      cleanup(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      // Check if a corresponding .ts or .tsx exists
      const baseName = file.replace(/\.jsx?$/, '');
      const tsFile = path.join(dir, `${baseName}.ts`);
      const tsxFile = path.join(dir, `${baseName}.tsx`);

      if (fs.existsSync(tsFile) || fs.existsSync(tsxFile)) {
        console.log(`Removing residual file: ${filePath}`);
        fs.unlinkSync(filePath);
      }
    }
  });
}

console.log('Cleaning up residual route files...');
cleanup(routesDir);
console.log('Cleanup complete.');
