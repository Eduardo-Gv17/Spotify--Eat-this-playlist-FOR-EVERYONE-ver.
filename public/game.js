// game.js
// "Eat This": snake que se alimenta de las portadas de canciones de Spotify,
// reproduciendo cada una al ser "comida" via el Embed iFrame API oficial de
// Spotify. La metadata (título + portada) de cada canción sale del oEmbed
// público de Spotify (open.spotify.com/oembed) — no requiere login, Client
// ID/Secret ni cuenta Premium, porque no es parte del Web API restringido.

// ---------- Config ----------
const GRID_SIZE = 15;          // celdas por lado
const TICK_MS = 150;           // velocidad del snake

// ---------- Elementos DOM ----------
const screenSetup = document.getElementById('screen-setup');
const screenGame = document.getElementById('screen-game');
const screenGameOver = document.getElementById('screen-gameover');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultsEl = document.getElementById('search-results');
const spotifyFallbackLink = document.getElementById('spotify-fallback-link');

const dropzone = document.getElementById('dropzone');
const trackUrlInput = document.getElementById('track-url-input');
const addTrackBtn = document.getElementById('add-track-btn');
const tracksQueueEl = document.getElementById('tracks-queue');
const loadBtn = document.getElementById('load-btn');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const setupStatus = document.getElementById('setup-status');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const nowPlayingCover = document.getElementById('now-playing-cover');
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingArtist = document.getElementById('now-playing-artist');

const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const changePlaylistBtn = document.getElementById('change-playlist-btn');

// ---------- Estado ----------
let tracks = [];          // cola completa de canciones (barajada)
let trackCursor = 0;       // índice de la próxima canción a usar como comida
let loadedImages = new Map(); // trackId -> HTMLImageElement

let snake = [];            // [{x,y,trackId|null}]
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = null;           // {x,y,track}
let score = 0;
let loopHandle = null;
let cellPx = 0;

let embedController = null;
let embedReady = false;

// ---------- Utilidades ----------
function extractTrackId(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // https://open.spotify.com/track/ID?si=... | spotify:track:ID | ID suelto
  const urlMatch = trimmed.match(/track[/:]([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]{15,25}$/.test(trimmed)) return trimmed;
  return null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function preloadImage(track) {
  if (loadedImages.has(track.id)) return loadedImages.get(track.id);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = track.image;
  loadedImages.set(track.id, img);
  return img;
}

// ---------- Cola de canciones (estilo "gestor de resource packs") ----------
// queueItem: { id, uri, name, image, status: 'loading'|'ready'|'error', errorMsg }
let queue = [];
const MIN_TRACKS = 3;

// ---------- Persistencia local (localStorage) ----------
// Guarda la cola confirmada ('ready') en este navegador/dispositivo para no
// tener que rearmarla cada vez que se abre el juego — sobre todo pensando
// en celular, donde ir y volver de la app de Spotify por cada canción es
// tedioso. Es 100% local: no hay servidor de por medio, no sincroniza entre
// dispositivos, y si borrás datos del navegador (o usás modo incógnito) se
// pierde. Todo dentro de try/catch porque localStorage puede no estar
// disponible (modo incógnito estricto de Safari, storage lleno, etc.) — si
// falla, el juego sigue funcionando igual, solo sin recordar la lista.
const QUEUE_STORAGE_KEY = 'eat-this:queue-v1';

function loadQueueFromStorage() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    saved.forEach((item) => {
      if (item && item.id && item.uri && item.name && !queueHasId(item.id)) {
        queue.push({ ...item, status: 'ready' });
      }
    });
  } catch (err) {
    console.error('No se pudo leer la lista guardada:', err.message);
  }
}

function saveQueueToStorage() {
  try {
    const readyOnly = queue
      .filter((q) => q.status === 'ready')
      .map(({ id, uri, name, image }) => ({ id, uri, name, image }));
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(readyOnly));
  } catch (err) {
    console.error('No se pudo guardar la lista:', err.message);
  }
}

function queueHasId(id) {
  return queue.some((q) => q.id === id);
}

function renderQueue() {
  tracksQueueEl.innerHTML = '';

  queue.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = `track-chip track-chip--${item.status}`;

    const img = document.createElement('img');
    img.className = 'track-chip-img';
    img.alt = '';
    if (item.image) img.src = item.image;

    const textWrap = document.createElement('div');
    textWrap.className = 'track-chip-text';
    const name = document.createElement('div');
    name.className = 'track-chip-name';
    name.textContent =
      item.status === 'loading' ? 'Cargando…' : item.status === 'error' ? item.errorMsg : item.name;
    textWrap.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'track-chip-remove';
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', 'Quitar canción');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      queue = queue.filter((q) => q.id !== item.id);
      saveQueueToStorage();
      renderQueue();
    });

    chip.appendChild(img);
    chip.appendChild(textWrap);
    chip.appendChild(removeBtn);
    tracksQueueEl.appendChild(chip);
  });

  const readyCount = queue.filter((q) => q.status === 'ready').length;
  loadBtn.disabled = readyCount < MIN_TRACKS;
  loadBtn.textContent = `Jugar (${readyCount}/${MIN_TRACKS} canciones)`;
  clearQueueBtn.classList.toggle('hidden', queue.length === 0);
}

async function addTrackToQueue(trackId) {
  if (!trackId || queueHasId(trackId)) return;

  const placeholder = { id: trackId, uri: `spotify:track:${trackId}`, name: '', image: '', status: 'loading' };
  queue.push(placeholder);
  renderQueue();

  try {
    const meta = await fetchTrackMeta(trackId);
    Object.assign(placeholder, meta, { status: 'ready' });
    saveQueueToStorage();
  } catch (err) {
    placeholder.status = 'error';
    placeholder.errorMsg = 'No se pudo cargar';
    console.error(`Fallo cargando ${trackId}:`, err.message);
  }
  renderQueue();
}

// ---------- Buscador (solo iTunes Search API) ----------
// No usa la API de Spotify, ni ningún servicio intermedio de terceros
// (Odesli/Songwhip), para nada: /api/search (server.js o api/search.js en
// Vercel) busca en iTunes por texto y devuelve el `previewUrl` oficial de
// 30s de cada candidato. Este buscador es una "vista previa rápida", NO
// resuelve un track real de Spotify — para eso, cada resultado trae un
// botón que abre la búsqueda de ese título+artista en Spotify. Además,
// como iTunes no tiene indexado absolutamente todo, siempre se muestra un
// link para forzar esa misma búsqueda en Spotify con el texto tal cual lo
// escribió el usuario, sin pasar por iTunes en absoluto.
let searchAbortController = null;
let previewAudio = null; // <audio> compartido: solo un preview sonando a la vez
let previewPlayingBtn = null;

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.currentTime = 0;
  }
  if (previewPlayingBtn) {
    previewPlayingBtn.textContent = '▶';
    previewPlayingBtn.classList.remove('search-result-preview--playing');
  }
  previewPlayingBtn = null;
}

function togglePreview(btn, previewUrl) {
  const isThisOnePlaying = previewPlayingBtn === btn;
  stopPreview();
  if (isThisOnePlaying) return; // era toggle a "pausa"

  if (!previewAudio) previewAudio = new Audio();
  previewAudio.src = previewUrl;
  previewAudio.play().catch((err) => console.error('No se pudo reproducir el preview:', err.message));
  previewAudio.onended = () => stopPreview();

  btn.textContent = '⏸';
  btn.classList.add('search-result-preview--playing');
  previewPlayingBtn = btn;
}

function spotifySearchUrl(title, artist) {
  const q = [title, artist].filter(Boolean).join(' ');
  return `https://open.spotify.com/search/${encodeURIComponent(q)}`;
}

async function runSearch(query) {
  const q = query.trim();
  if (!q) return;

  if (searchAbortController) searchAbortController.abort();
  searchAbortController = new AbortController();
  stopPreview();

  // El link a Spotify no depende de que iTunes encuentre nada — algunas
  // canciones no están indexadas en iTunes pero sí en Spotify, así que
  // esta opción queda disponible siempre, con el mismo texto que se buscó.
  spotifyFallbackLink.href = spotifySearchUrl(q, '');
  spotifyFallbackLink.textContent = `🔎 Buscar "${q}" directo en Spotify ↗`;
  spotifyFallbackLink.classList.remove('hidden');

  searchBtn.disabled = true;
  searchResultsEl.innerHTML = '<div class="search-status">Buscando…</div>';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      signal: searchAbortController.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${detail}`.trim());
    }

    const data = await res.json();
    renderSearchResults(data.results || []);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Búsqueda falló:', err);
    searchResultsEl.innerHTML =
      '<div class="search-status search-status--error">No se pudo buscar. Intenta de nuevo.</div>';
  } finally {
    searchBtn.disabled = false;
  }
}

function renderSearchResults(results) {
  searchResultsEl.innerHTML = '';

  if (results.length === 0) {
    searchResultsEl.innerHTML =
      '<div class="search-status">Sin resultados en iTunes — probá el link de arriba para buscarla directo en Spotify.</div>';
    return;
  }

  results.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'search-result';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'search-result-preview';
    previewBtn.textContent = '▶';
    previewBtn.title = 'Escuchar preview de 30s (iTunes)';
    previewBtn.addEventListener('click', () => togglePreview(previewBtn, r.previewUrl));

    const img = document.createElement('img');
    img.className = 'search-result-img';
    img.alt = '';
    if (r.image) img.src = r.image;

    const textWrap = document.createElement('div');
    textWrap.className = 'search-result-text';

    const title = document.createElement('div');
    title.className = 'search-result-title';
    title.textContent = r.title;

    const artist = document.createElement('div');
    artist.className = 'search-result-artist';
    artist.textContent = r.artist;

    textWrap.appendChild(title);
    textWrap.appendChild(artist);

    const openBtn = document.createElement('a');
    openBtn.className = 'search-result-add';
    openBtn.href = spotifySearchUrl(r.title, r.artist);
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';
    openBtn.textContent = 'Abrir en Spotify ↗';

    row.appendChild(previewBtn);
    row.appendChild(img);
    row.appendChild(textWrap);
    row.appendChild(openBtn);
    searchResultsEl.appendChild(row);
  });
}

searchBtn.addEventListener('click', () => runSearch(searchInput.value));

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runSearch(searchInput.value);
  }
});

function addRawText(raw) {
  const lines = raw
    .split(/[\r\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const ids = [...new Set(lines.map(extractTrackId).filter(Boolean))];
  ids.forEach(addTrackToQueue);

  if (ids.length === 0) {
    setupStatus.style.color = '#ff6161';
    setupStatus.textContent = 'No reconocí ningún link de canción de Spotify ahí.';
  } else {
    setupStatus.style.color = '#b3b3b3';
    setupStatus.textContent = '';
  }
}

// ---------- Agregar por input + botón ----------
addTrackBtn.addEventListener('click', () => {
  addRawText(trackUrlInput.value);
  trackUrlInput.value = '';
});

trackUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTrackBtn.click();
});

// soporta pegar varios links de un tirón (el input de una línea igual los recibe)
trackUrlInput.addEventListener('paste', (e) => {
  const text = e.clipboardData.getData('text');
  if (text && text.match(/[\r\n]/)) {
    e.preventDefault();
    addRawText(text);
    trackUrlInput.value = '';
  }
});

clearQueueBtn.addEventListener('click', () => {
  queue = [];
  saveQueueToStorage();
  renderQueue();
});

// ---------- Auto-agregar desde el portapapeles al volver a la pestaña ----------
// No hay forma oficial de que Spotify te devuelva el link directo al hacer
// una búsqueda (eso reintroduciría un puente frágil o algo contra sus
// términos — ver conversación). Esto es distinto: es 100% Clipboard API
// del navegador (estándar, sin tocar ningún servidor de terceros). Cuando
// volvés a esta pestaña después de copiar un link de canción en Spotify,
// si el navegador te dio permiso de leer el portapapeles, lo detectamos y
// lo agregamos solo — sin tener que pegarlo a mano. Es un "mejor esfuerzo":
// algunos navegores (Firefox, Safari en iOS) no dan ese permiso sin una
// acción explícita, o lo piden cada vez. Si no funciona, pegar a mano en
// el campo de abajo sigue funcionando igual que siempre.
async function tryAutoAddFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  try {
    const text = (await navigator.clipboard.readText()).trim();
    const id = extractTrackId(text);
    if (!id || queueHasId(id)) return;
    await addTrackToQueue(id);
    setupStatus.style.color = '#1db954';
    setupStatus.textContent = '🎉 Se agregó automáticamente el link que tenías copiado.';
  } catch (err) {
    // Sin permiso de portapapeles, o navegador sin soporte: no hacemos
    // nada — no es un error del usuario, y pegar a mano sigue disponible.
  }
}

let lastAutoCheckAt = 0;
function handleReturnToSetup() {
  if (screenSetup.classList.contains('hidden')) return; // solo mientras se arma la cola
  const now = Date.now();
  if (now - lastAutoCheckAt < 800) return; // evita disparar 2 veces (focus + visibilitychange casi juntos)
  lastAutoCheckAt = now;
  trackUrlInput.focus(); // así un Ctrl/Cmd+V manual ya cae directo en el campo
  tryAutoAddFromClipboard();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') handleReturnToSetup();
});

// El "focus" del window cubre casos que "visibilitychange" no dispara —
// por ejemplo, si el link se abrió en una ventana pop-up en vez de una
// pestaña nueva, nuestra pestaña puede seguir "visible" todo el tiempo y
// solo perder/recuperar el foco. Ambos eventos pueden dispararse casi
// juntos al volver; el debounce en handleReturnToSetup evita duplicar el
// intento.
window.addEventListener('focus', handleReturnToSetup);

// ---------- Drag & drop (links sueltos o un .txt/.csv exportado) ----------
['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone--active');
  });
});

['dragleave', 'dragend'].forEach((evt) => {
  dropzone.addEventListener(evt, () => dropzone.classList.remove('dropzone--active'));
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dropzone--active');

  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    [...files].forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => addRawText(String(reader.result));
      reader.readAsText(file);
    });
    return;
  }

  const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (text) addRawText(text);
});

// ---------- Metadata de cada canción vía oEmbed (público, sin login) ----------
// oEmbed no manda headers CORS, así que pasamos por /api/oembed (nuestra
// propia función serverless / ruta de server.js) que hace el fetch del lado
// del servidor y nos devuelve el JSON limpio.
async function fetchTrackMeta(trackId) {
  const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
  const res = await fetch(`/api/oembed?url=${encodeURIComponent(spotifyUrl)}`);

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`No se pudo leer la canción ${trackId} (HTTP ${res.status}). ${detail}`.trim());
  }

  const data = await res.json();
  if (!data.title || !data.thumbnail_url) {
    throw new Error(`Spotify no devolvió datos para ${trackId}. ¿El link es correcto?`);
  }

  return {
    id: trackId,
    uri: `spotify:track:${trackId}`,
    name: data.title,
    artist: '', // oEmbed no incluye el artista por separado
    image: data.thumbnail_url,
  };
}

// ---------- Spotify Embed iFrame API ----------
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const element = document.getElementById('spotify-embed');
  const options = { uri: '', width: '100%', height: '80' };
  IFrameAPI.createController(element, options, (controller) => {
    embedController = controller;
    embedReady = true;
  });
};

// NOTA: se probó pasar un `startAt` fijo acá (para saltar la intro y
// arrancar en una parte más "enganchadora", igual en PC que en celular) y
// rompió la reproducción en mobile por completo. Hipótesis: en mobile, sin
// sesión de Spotify Premium en el navegador, el Embed sirve directamente
// el clip de preview de ~30s (que ya arranca en un punto elegido por
// Spotify, no en 0:00 — por eso "ya sonaba bien" en celular) en vez del
// track completo. Pedirle que arranque a los 30s de ESE clip corto
// probablemente cae fuera de su duración y el Embed no reproduce nada. En
// PC, con sesión Premium, sí carga el track completo y el `startAt` no
// tiene ese problema — pero el comportamiento distinto entre plataformas
// es indetectable desde acá (el iframe es de otro dominio), así que no hay
// forma segura de aplicarlo solo cuando corresponde. Se revierte: cada
// plataforma vuelve a comportarse como decida Spotify por su cuenta.
function playTrack(track) {
  if (!embedController) return;
  embedController.loadUri(track.uri);
  embedController.play();
  nowPlayingCover.src = track.image;
  nowPlayingTitle.textContent = track.name;
  nowPlayingArtist.textContent = track.artist;
}


function pausePlayback() {
  if (embedController) embedController.pause();
}

// ---------- Setup flow ----------
loadBtn.addEventListener('click', () => {
  const ready = queue.filter((q) => q.status === 'ready');
  if (ready.length < MIN_TRACKS) return;

  stopPreview(); // no dejar sonando un preview de iTunes mientras arranca el juego
  tracks = shuffle(ready);
  tracks.forEach(preloadImage);
  startGame();
});

changePlaylistBtn.addEventListener('click', () => {
  show(screenSetup);
});

loadQueueFromStorage();
renderQueue(); // estado inicial (con lo que ya tenías guardado, si había algo)

// ---------- Juego ----------
function show(screen) {
  [screenSetup, screenGame, screenGameOver].forEach((s) => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function setupCanvasSize() {
  const size = canvas.clientWidth; // cuadrado por CSS
  canvas.width = size;
  canvas.height = size;
  cellPx = size / GRID_SIZE;
}

function nextFoodTrack() {
  const track = tracks[trackCursor % tracks.length];
  trackCursor += 1;
  return track;
}

function randomEmptyCell() {
  let cell;
  do {
    cell = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
  return cell;
}

function spawnFood() {
  const cell = randomEmptyCell();
  const track = nextFoodTrack();
  preloadImage(track);
  food = { x: cell.x, y: cell.y, track };
}

function startGame() {
  score = 0;
  trackCursor = 0;
  scoreEl.textContent = '0';

  const mid = Math.floor(GRID_SIZE / 2);
  snake = [
    { x: mid - 1, y: mid, trackId: null },
    { x: mid - 2, y: mid, trackId: null },
    { x: mid - 3, y: mid, trackId: null },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };

  spawnFood();
  show(screenGame);
  setupCanvasSize();

  // primer track suena al arrancar (esto ocurre tras el click de "Cargar
  // playlist", que cuenta como gesto del usuario para permitir autoplay)
  if (embedReady) {
    playTrack(food.track);
  } else {
    // el iframe API puede tardar unos ms en estar listo
    const waitReady = setInterval(() => {
      if (embedReady) {
        clearInterval(waitReady);
        playTrack(food.track);
      }
    }, 150);
  }

  if (loopHandle) clearInterval(loopHandle);
  loopHandle = setInterval(tick, TICK_MS);
}

function tick() {
  direction = nextDirection;
  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
    trackId: null,
  };

  // colisión con pared
  if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
    return gameOver();
  }
  // colisión consigo mismo
  if (snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
    return gameOver();
  }

  const ateFood = food && newHead.x === food.x && newHead.y === food.y;

  if (ateFood) {
    newHead.trackId = food.track.id;
    snake.unshift(newHead);
    score += 1;
    scoreEl.textContent = String(score);
    playTrack(food.track);
    spawnFood();
    // sin pop: el snake crece
  } else {
    snake.unshift(newHead);
    snake.pop();
  }

  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // comida
  if (food) {
    const img = loadedImages.get(food.track.id);
    drawCover(img, food.x, food.y);
  }

  // snake: cada segmento con portada muestra su álbum, el resto un bloque verde
  snake.forEach((seg, i) => {
    if (seg.trackId && loadedImages.has(seg.trackId)) {
      drawCover(loadedImages.get(seg.trackId), seg.x, seg.y);
    } else {
      ctx.fillStyle = i === 0 ? '#1db954' : '#178a3c';
      const pad = 1;
      ctx.fillRect(seg.x * cellPx + pad, seg.y * cellPx + pad, cellPx - pad * 2, cellPx - pad * 2);
    }
  });
}

function drawCover(img, gx, gy) {
  const x = gx * cellPx;
  const y = gy * cellPx;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, cellPx, cellPx);
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, cellPx, cellPx);
  }
}

function gameOver() {
  clearInterval(loopHandle);
  loopHandle = null;
  pausePlayback();
  finalScoreEl.textContent = `Comiste ${score} portada${score === 1 ? '' : 's'}`;
  show(screenGameOver);
}

restartBtn.addEventListener('click', () => {
  tracks = shuffle(tracks);
  startGame();
});

// ---------- Controles ----------
const KEY_DIRS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

function trySetDirection(dir) {
  if (!dir) return;
  // evitar giro de 180 grados
  if (dir.x === -direction.x && dir.y === -direction.y) return;
  nextDirection = dir;
}

window.addEventListener('keydown', (e) => {
  // no capturar teclas de movimiento mientras se escribe en un input/textarea
  // (por ej. el buscador), ni cuando no se está jugando
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (screenGame.classList.contains('hidden')) return;

  const dir = KEY_DIRS[e.key];
  if (!dir) return;
  trySetDirection(dir);
  e.preventDefault();
});

// ---------- Controles táctiles (swipe) ----------
// El juego solo escuchaba teclado — en celular no hay teclado, así que el
// snake nunca se movía. Esto agrega swipes sobre el canvas: se compara el
// punto donde empezó el toque contra donde terminó, y el eje con mayor
// desplazamiento define la dirección. SWIPE_MIN_PX evita que un toque
// corto/accidental (tap) se interprete como un giro.
const SWIPE_MIN_PX = 24;
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener(
  'touchstart',
  (e) => {
    if (screenGame.classList.contains('hidden')) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  },
  { passive: true },
);

canvas.addEventListener(
  'touchend',
  (e) => {
    if (screenGame.classList.contains('hidden')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return; // fue un tap, no un swipe

    const dir =
      Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
    trySetDirection(dir);
  },
  { passive: true },
);

// preventDefault en touchmove (necesita { passive: false }) para que el
// navegador no scrollee/haga "pull to refresh" mientras se está swipeando
// arriba del canvas durante la partida.
canvas.addEventListener(
  'touchmove',
  (e) => {
    if (!screenGame.classList.contains('hidden')) e.preventDefault();
  },
  { passive: false },
);

window.addEventListener('resize', () => {
  if (!screenGame.classList.contains('hidden')) {
    setupCanvasSize();
    draw();
  }
});