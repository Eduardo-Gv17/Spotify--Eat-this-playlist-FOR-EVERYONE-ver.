// lib/musicSearch.js
//
// Buscador de canciones — v4.
//
// Ya NO intenta resolver un ID real de Spotify para cada resultado (eso
// era la v3, encadenando iTunes -> Songwhip). Esa cadena dependía de un
// endpoint no oficial de terceros dos veces seguidas: primero Odesli/
// song.link (dado de baja el 31 de julio de 2026) y después Songwhip
// (mismo tipo de endpoint reverse-engineered, mismo riesgo). Cada vez que
// el "puente" no oficial entre Apple y Spotify se rompe, el buscador entero
// deja de funcionar aunque el resto de la app esté sano.
//
// v4 saca a Spotify de la ecuación para el buscador por completo:
//
//   iTunes Search API (Apple, pública, sin key) — texto -> candidatos con
//   título, artista, portada y `previewUrl` (un preview de 30s pensado
//   exactamente para esto).
//     https://itunes.apple.com/search?term=...&media=music&entity=song
//
// El buscador reproduce ese preview directo con <audio> en el navegador,
// sin resolver nada ni depender de ningún servicio intermedio. Cero
// dependencia de terceros para la búsqueda, cero cadena que se pueda
// romper. La iTunes Search API es de Apple, oficial, documentada y estable
// desde hace más de una década.
//
// Los links pegados a mano (o copiados desde Spotify después de escuchar
// el preview) siguen sonando completos vía Spotify Embed — eso nunca
// dependió de Odesli/Songwhip y sigue igual en esta versión.

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const MAX_RESULTS = 8; // cuántos resultados de iTunes devolvemos
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, timeoutMs, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function betterArtwork(url) {
  // iTunes da 100x100 por defecto; pedimos una versión más grande para que
  // se vea decente como "manzana" del snake / en la lista de resultados.
  if (!url) return '';
  return url.replace(/\/\d+x\d+bb\.(jpg|png)/, '/300x300bb.$1');
}

/**
 * Busca canciones por texto en la iTunes Search API y devuelve candidatos
 * con su preview de 30s. No resuelve ningún ID de Spotify — es una vista
 * previa rápida, no un clon exacto del catálogo de Spotify.
 *
 * @param {string} query
 * @returns {Promise<{results: Array<{title, artist, image, previewUrl}>}>}
 */
async function searchTracks(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return { results: [] };

  const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(trimmed)}&media=music&entity=song&limit=${MAX_RESULTS}`;
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);

  if (!res.ok) {
    throw new Error(`iTunes Search API respondió HTTP ${res.status}`);
  }

  const data = await res.json();
  const results = (data.results || [])
    .filter((r) => r.trackName && r.previewUrl)
    .map((r) => ({
      title: r.trackName,
      artist: r.artistName || '',
      image: betterArtwork(r.artworkUrl100),
      previewUrl: r.previewUrl,
    }));

  return { results };
}

module.exports = { searchTracks };
