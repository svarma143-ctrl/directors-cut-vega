#!/usr/bin/env node
/**
 * Static asset server for the Director's Cut demo.
 *
 * Serves the demo media (video, poster, captions) over HTTP so the Fire TV
 * app can stream it. During development the Vega Virtual Device reaches
 * this server through:
 *
 *   vega device start-port-forwarding --port 8099
 *
 * which makes the host's port available to the device. For recording the
 * demo video the same server can be exposed on the LAN.
 *
 * It also serves the compiled agent's `/ping` and `/director` endpoints
 * under a `/agent` prefix, so a single port serves everything the app
 * needs and only one port-forwarding rule is required.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
// The assets live next to the repository root, one level up from tools/.
const assetsDir = join(here, '..', 'assets');

const PORT = Number(process.env.PORT ?? 8099);
const HOST = process.env.HOST ?? '0.0.0.0';

const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.vtt': 'text/vtt',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
};

/**
 * Resolve a request path to a file inside the assets directory.
 *
 * Returns null if the path escapes the directory, which prevents a path
 * traversal.
 */
function resolveAsset(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const full = join(assetsDir, relative);
  if (!full.startsWith(assetsDir)) return null;
  if (!existsSync(full)) return null;
  return full;
}

/** Stream a file with HTTP range support so the player can seek. */
function serveFile(req, res, filePath) {
  const stat = statSync(filePath);
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start >= stat.size || end >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  // CORS, so the app and any browser tooling can reach the server.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy the agent so a single public HTTPS URL serves both the media and
  // the AI backend. The Vega media player rejects cleartext HTTP, so having
  // one HTTPS origin avoids a second tunnel.
  if (pathname === '/agent' || pathname.startsWith('/agent/')) {
    proxyAgent(req, res, pathname.replace(/^\/agent/, '') || '/');
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
       <h1>Director's Cut - demo assets</h1>
       <ul>
         <li><a href="/tears-of-steel.mp4">tears-of-steel.mp4</a></li>
         <li><a href="/tears-of-steel.vtt">tears-of-steel.vtt</a></li>
         <li><a href="/tears-of-steel.cues.json">tears-of-steel.cues.json</a></li>
         <li><a href="/agent/ping">agent /ping</a></li>
       </ul></body></html>`,
    );
    return;
  }

  const file = resolveAsset(pathname);
  if (file) {
    serveFile(req, res, file);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

/** Forward a request to the local agent process. */
async function proxyAgent(req, res, agentPath) {
  const agentHost = process.env.AGENT_HOST ?? '127.0.0.1';
  const agentPort = Number(process.env.AGENT_PORT ?? 8080);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  try {
    const upstream = await fetch(`http://${agentHost}:${agentPort}${agentPath}`, {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'agent unreachable', detail: String(err) }));
  }
}

server.listen(PORT, HOST, () => {
  console.log(`[assets] serving ${assetsDir} on http://${HOST}:${PORT}`);
});
