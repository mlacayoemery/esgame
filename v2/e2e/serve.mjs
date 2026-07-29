// Minimal static server with SPA fallback (mirrors the container's nginx `try_files ... /index.html`).
// Serves the production build for the Playwright e2e suite.
//
// Range requests are supported because geotiff.js fetches the consequence/suitability
// GeoTIFFs by byte range. A server that answers a Range request with the whole file
// makes it abort with "Server responded with full file", and the board never populates
// — which is what happened here before, so the e2e suite could only ever assert that
// the board element mounted, never that it rendered any fields. nginx and GitHub Pages
// both honour Range, so this only ever affected local/CI runs.
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

// Parses a single-range "bytes=start-end" header against a known size.
// Returns null when absent/unsatisfiable-as-written, so the caller falls back to 200.
function parseRange(header, size) {
	if (!header) return null;
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m) return null;
	const [, rawStart, rawEnd] = m;
	if (rawStart === '' && rawEnd === '') return null;
	let start, end;
	if (rawStart === '') {
		// suffix range: last N bytes
		const n = Number(rawEnd);
		if (!n) return null;
		start = Math.max(0, size - n);
		end = size - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
	}
	if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
	return { start, end };
}

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
		const type = TYPES[extname(file)] || 'application/octet-stream';
		const range = parseRange(req.headers.range, body.length);
		if (range) {
			const { start, end } = range;
			res.writeHead(206, {
				'Content-Type': type,
				'Content-Range': `bytes ${start}-${end}/${body.length}`,
				'Content-Length': end - start + 1,
				'Accept-Ranges': 'bytes',
			});
			res.end(body.subarray(start, end + 1));
			return;
		}
		res.writeHead(200, {
			'Content-Type': type,
			'Content-Length': body.length,
			'Accept-Ranges': 'bytes',
		});
		res.end(body);
	} catch {
		res.writeHead(404); res.end('not found');
	}
}).listen(PORT, () => console.log(`e2e server: ${ROOT} on http://localhost:${PORT}`));
