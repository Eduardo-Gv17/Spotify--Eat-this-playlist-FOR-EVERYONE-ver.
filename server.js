// server.js
// Servidor local con Node puro (cero dependencias). Sirve /public como
// estático y expone /api/oembed, que hace de proxy al oEmbed público de
// Spotify (para esquivar CORS). No requiere ninguna variable de entorno ni
// credenciales de Spotify: no hay login, ni Client ID/Secret, ni Premium.
//
//   node server.js
//
// Para producción, despliega en Vercel (ver README) — ahí se usa
// api/oembed.js directamente como función serverless.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { searchTracks } = require('./lib/musicSearch');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

async function handleOembed(req, res, targetUrl) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (!targetUrl || !/^https:\/\/open\.spotify\.com\/track\//.test(targetUrl)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Falta o es inválido el parámetro "url".' }));
  }

  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`;
    const spotifyRes = await fetch(oembedUrl);

    if (!spotifyRes.ok) {
      const detail = await spotifyRes.text();
      res.writeHead(spotifyRes.status, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Spotify rechazó el oEmbed.', detail }));
    }

    const data = await spotifyRes.json();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ title: data.title || null, thumbnail_url: data.thumbnail_url || null }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Fallo interno consultando oEmbed.', detail: String(err) }));
  }
}

async function handleSearch(req, res, query) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (!query || !query.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Falta el parámetro "q" (texto a buscar).' }));
  }

  try {
    const { results } = await searchTracks(query);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ results }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Fallo interno buscando canciones.', detail: String(err) }));
  }
}

// --- Servidor estático + /api/oembed + /api/search ---
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // no salirse de /public
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (reqUrl.pathname === '/api/oembed') {
    return handleOembed(req, res, reqUrl.searchParams.get('url'));
  }

  if (reqUrl.pathname === '/api/search') {
    return handleSearch(req, res, reqUrl.searchParams.get('q'));
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n🐍  Eat This corriendo en http://localhost:${PORT}\n`);
});
