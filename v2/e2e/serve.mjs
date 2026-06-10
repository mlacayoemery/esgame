// Minimal static server with SPA fallback (mirrors the container's nginx `try_files ... /index.html`).
// Serves the production build for the Playwright e2e suite.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../dist/tradeoff-v2/', import.meta.url));
const PORT = process.env.PORT || 4173;
const TYPES = {
	'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
	'.tif': 'image/tiff', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

http.createServer(async (req, res) => {
	const { pathname } = new URL(req.url, 'http://localhost');
	let file = join(ROOT, decodeURIComponent(pathname));
	try {
		if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
	} catch {
		file = join(ROOT, 'index.html'); // SPA fallback
	}
	try {
		const body = await readFile(file);
		res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
		res.end(body);
	} catch {
		res.writeHead(404); res.end('not found');
	}
}).listen(PORT, () => console.log(`e2e server: ${ROOT} on http://localhost:${PORT}`));
