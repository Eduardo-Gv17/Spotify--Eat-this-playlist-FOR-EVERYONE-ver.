// api/search.js
// Serverless function (Vercel). Buscador de canciones que NO depende de
// Spotify para nada: usa únicamente la iTunes Search API (Apple, gratis,
// sin key) y devuelve el `previewUrl` de 30s de cada candidato para
// reproducir en el navegador con <audio>. Sin resolución de ID de Spotify,
// sin servicios intermedios de terceros. Ver lib/musicSearch.js.

const { searchTracks } = require('../lib/musicSearch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  const q = req.query ? req.query.q : new URL(req.url, 'http://x').searchParams.get('q');

  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Falta el parámetro "q" (texto a buscar).' });
  }

  try {
    const { results } = await searchTracks(q);
    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: 'Fallo interno buscando canciones.', detail: String(err) });
  }
};
