// api/oembed.js
// Serverless function (Vercel). Hace de proxy hacia el oEmbed PÚBLICO de
// Spotify (open.spotify.com/oembed) para poder llamarlo desde el navegador
// sin toparnos con CORS (Spotify no manda esos headers en esa respuesta).
//
// Importante: este endpoint es distinto del Web API restringido — no
// requiere Client ID/Secret, no requiere login de usuario, y no está sujeto
// al requisito de cuenta Premium del dueño de la app que aplica al Web API
// en "Development Mode" desde feb. 2026. Solo da título + portada, así que
// no sirve para leer listas de canciones de una playlist ajena — para eso
// no existe alternativa pública desde el cambio de política de Spotify.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const targetUrl = req.query ? req.query.url : new URL(req.url, 'http://x').searchParams.get('url');

  if (!targetUrl || !/^https:\/\/open\.spotify\.com\/track\//.test(targetUrl)) {
    return res.status(400).json({ error: 'Falta o es inválido el parámetro "url" (debe ser un link de track de Spotify).' });
  }

  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`;
    const spotifyRes = await fetch(oembedUrl);

    if (!spotifyRes.ok) {
      const detail = await spotifyRes.text().catch(() => '');
      return res.status(spotifyRes.status).json({ error: 'Spotify rechazó el oEmbed.', detail });
    }

    const data = await spotifyRes.json();
    return res.status(200).json({
      title: data.title || null,
      thumbnail_url: data.thumbnail_url || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Fallo interno consultando oEmbed.', detail: String(err) });
  }
};
