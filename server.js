const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const PUBLIC_DIR = __dirname;
const FOOD_IMAGES_DIR = path.join(PUBLIC_DIR, 'Food Images');

// Content types mapping
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon'
};

// Cache for unique food images
let cachedUniqueImages = null;

function getUniqueFoodImages() {
  if (cachedUniqueImages) return cachedUniqueImages;

  try {
    if (!fs.existsSync(FOOD_IMAGES_DIR)) {
      return [];
    }

    const files = fs.readdirSync(FOOD_IMAGES_DIR);
    const hashes = new Map();

    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = path.join(FOOD_IMAGES_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        if (!hashes.has(hash)) {
          hashes.set(hash, file);
        }
      }
    }

    // Sort by name
    const uniqueFiles = Array.from(hashes.values()).sort();
    cachedUniqueImages = uniqueFiles;
    return uniqueFiles;
  } catch (error) {
    console.error('Error scanning Food Images:', error);
    return [];
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // API: Get food images list
  if (pathname === '/api/food-images' && req.method === 'GET') {
    const images = getUniqueFoodImages();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(images));
    return;
  }

  // API: Replace website image
  if (pathname === '/api/replace-image' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { target, source } = JSON.parse(body);
        if (!target || !source) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing target or source' }));
          return;
        }

        const sourcePath = path.join(FOOD_IMAGES_DIR, source);
        const targetPath = path.join(PUBLIC_DIR, target);

        // Security checks
        const resolvedSourcePath = path.resolve(sourcePath);
        const resolvedTargetPath = path.resolve(targetPath);

        if (!resolvedSourcePath.startsWith(FOOD_IMAGES_DIR) || !resolvedTargetPath.startsWith(PUBLIC_DIR)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden path access' }));
          return;
        }

        if (!fs.existsSync(resolvedSourcePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Source file not found' }));
          return;
        }

        // Copy source file to overwrite target
        fs.copyFileSync(resolvedSourcePath, resolvedTargetPath);
        console.log(`Successfully replaced ${target} with ${source}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Error replacing image:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent directory traversal
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(resolvedFilePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(resolvedFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(resolvedFilePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Live Customizer available at http://localhost:${PORT}/customize.html`);
});
