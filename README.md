# Eat This 🐍 — Spotify Snake

Snake donde las "manzanas" son las portadas de canciones de Spotify, y cada
vez que el snake se come una portada, suena esa canción (usando el Embed
iFrame API oficial de Spotify).

## Cómo funciona (arquitectura) — v4, buscador sin Spotify ni terceros frágiles

- `public/` → frontend estático (HTML/CSS/JS puro, sin frameworks).
- El usuario arma su cola de canciones pegando **links de canciones
  individuales** de Spotify (uno por línea) — esa es la única forma de
  agregar una canción *jugable* a la cola.
- El **buscador** (ver abajo) es una ayuda para encontrar y reconocer
  canciones por nombre/artista — no agrega directamente a la cola, porque
  ya no resuelve un ID real de Spotify (ver "Buscador").
- `api/oembed.js` (o la ruta equivalente en `server.js` para local) hace de
  proxy hacia el **oEmbed público** de Spotify
  (`https://open.spotify.com/oembed?url=...`) solo para esquivar CORS —
  Spotify no manda esos headers en esa respuesta. Este endpoint devuelve
  título + portada de una canción, **sin login, sin Client ID/Secret, sin
  cuenta Premium**. Se usa para confirmar cada link pegado a mano.
- El frontend usa esa metadata para armar la lista de "comida" del snake, y
  usa el **Spotify Embed iFrame API**
  (`open.spotify.com/embed/iframe-api/v1`) para reproducir cada canción al
  ser comida.

## Buscador (v4) — cero dependencia de terceros, solo Apple oficial

Buscar canciones por Spotify Web API no es viable (requisito de Premium en
Dev Mode, ver más abajo). Las dos versiones anteriores del buscador
intentaron resolver un ID real de Spotify para cada resultado encadenando
la iTunes Search API con un servicio intermediario no oficial:

- v2: Odesli/song.link → se dio de baja el 31 de julio de 2026.
- v3: Songwhip (mismo tipo de endpoint reverse-engineered) → mismo riesgo,
  distinto proveedor.

Cada vez que ese "puente" no oficial entre Apple y Spotify se rompe, el
buscador entero deja de funcionar aunque el resto de la app esté sana. En
vez de seguir apostando a un tercer puente, **v4 saca a Spotify de la
ecuación del buscador por completo**:

1. **iTunes Search API** (Apple, pública, sin key, oficial y documentada
   desde hace más de una década) — recibe el texto de búsqueda y devuelve
   candidatos con título, artista, portada y `previewUrl`: un preview de
   30s pensado exactamente para esto.
2. El buscador reproduce ese preview directo con `<audio>` en el
   navegador. **No resuelve nada, no llama a ningún servicio intermedio.**

El resultado es una "vista previa rápida" (30s, con portada y nombre) para
reconocer la canción — no un clon exacto del catálogo de Spotify. Junto a
cada resultado hay un botón **"Abrir en Spotify ↗"** que abre la búsqueda
de ese título+artista en `open.spotify.com/search/...`; ahí el usuario
copia el link real de la canción y lo pega en el campo de abajo (mismo
flujo de siempre para agregar a la cola, con la misma confirmación vía
oEmbed).

Los links pegados a mano siguen sonando completos vía **Spotify Embed**
— eso nunca dependió de Odesli/Songwhip y sigue funcionando igual.

- Implementado en `lib/musicSearch.js` (módulo compartido) y expuesto en
  `/api/search` (vía `api/search.js` en Vercel o el handler equivalente en
  `server.js` para local).
- Se muestran hasta 8 candidatos por búsqueda, solo los que tienen
  `previewUrl` (algunas canciones muy nuevas o exclusivas de streaming no
  lo tienen y no aparecen).
- Al no depender de ningún servicio no oficial, el buscador ya no tiene un
  modo de falla de "el tercero se cayó" — si iTunes mismo no responde, se
  muestra un error genérico y siempre queda la opción de pegar el link a
  mano.

### ¿Por qué el cambio de diseño (v1 usaba login de Spotify)?

La v1 de este proyecto usaba el **Web API** de Spotify (Authorization Code
Flow) para leer automáticamente las canciones de una playlist completa
(`/v1/playlists/{id}/items`). Eso dejó de ser viable por dos cambios de
política de Spotify:

1. **Feb. 2026** — ese endpoint solo devuelve el contenido de playlists
   **tuyas o donde seas colaborador**; cualquier otra playlist solo da
   metadata (nombre, portada), nunca la lista de canciones.
2. **Feb. 2026 (Dev Mode)** — además, **toda** app en modo "Development"
   (el modo gratis para proyectos personales) requiere que la cuenta que
   registró la app en el dashboard de Spotify tenga una **suscripción
   Premium activa**. Sin eso, el Web API devuelve 403 en todos sus
   endpoints — incluido el login de usuario y el Client Credentials Flow —
   sin importar si el usuario final tiene Premium o no.

Para no depender de que el dueño de la app tenga Premium, desde la v2 se
evita el Web API por completo y se usa el **oEmbed público**, que es un
servicio distinto (pensado para "link previews") y no está sujeto a esas
dos restricciones. La contrapartida: no hay forma de leer automáticamente
todas las canciones de una playlist — el usuario tiene que pegar los links
de las canciones que quiera usar, una por línea.

## Correr en local

```bash
node server.js
```

Abre http://localhost:3000 — no hace falta `.env`, ni Client ID, ni
Client Secret, ni login. `server.js` es un servidor de Node puro (sin
dependencias). Necesitas Node 18+ (usa `fetch` nativo).

## Deploy en Vercel

No hace falta el CLI: puedes conectar el repo desde el dashboard de Vercel
(Import Project → tu repo de GitHub) y detecta `api/` y `public/`
automáticamente. Si prefieres el CLI: `npx vercel` (sin instalarlo global).
No hay variables de entorno que configurar.

## Controles

- **Teclado**: flechas o WASD.
- **Táctil (celular/tablet)**: deslizá el dedo sobre el tablero en la
  dirección que querés mover al snake (swipe). Un toque corto (tap) no
  cuenta como movimiento, solo un desplazamiento de al menos ~24px.

## Cómo conseguir los links de canciones

En la app o web de Spotify, sobre una canción: **⋯ (o clic derecho) → Compartir
→ Copiar enlace de la canción**. Pega ese link (o el `spotify:track:...` URI)
en el textarea, uno por línea, mínimo 3 canciones.

## Notas y limitaciones (v4)

- El buscador (iTunes) es solo una vista previa de 30s para reconocer la
  canción — no agrega un track jugable directamente. Para jugarla hay que
  copiar su link real desde Spotify (el botón "Abrir en Spotify ↗" ayuda
  con eso) y pegarlo abajo.
- Algunas canciones no tienen `previewUrl` en iTunes (raro, pero pasa con
  catálogo muy nuevo o exclusivo) y no van a aparecer en los resultados.
- No hay forma de leer automáticamente el contenido de una playlist ajena
  desde el cambio de política de Spotify de feb. 2026 (ver arriba) — ni
  buscando ni pegando links se puede "importar" una playlist completa de
  otra persona de un tirón. Si quieres automatizarlo para *tus propias*
  playlists, tendrías que volver a usar el Web API con OAuth (v1 de este
  proyecto) y necesitarías que la cuenta dueña de la app de Spotify tenga
  Premium.
- El oEmbed público no incluye el nombre del artista por separado, solo el
  título de la canción — por eso el HUD no muestra artista en esta v2.
- Spotify deprecó los `preview_url` de 30s para apps nuevas en 2024 — por
  eso este proyecto usa el Embed iFrame API en vez de la API tradicional de
  previews. Si tienes Spotify Premium y sesión abierta en el navegador,
  reproduce la canción completa; si no, el comportamiento estándar de
  preview del embed.
- El primer `play()` ocurre justo después de darle a "Cargar canciones" (un
  click), así que cuenta como gesto del usuario para las políticas de
  autoplay del navegador.
- Las llamadas a `/api/oembed` son secuenciales (una por canción) para no
  golpear el endpoint público con ráfagas de requests; con playlists muy
  largas la carga tarda unos segundos.
- Cada canción arranca 30s adentro (no desde 0:00), usando el parámetro
  oficial `startAt` de `loadUri` del iFrame API — así se salta la intro y
  se escucha algo más parecido a un "highlight", consistente en cualquier
  dispositivo. Es un valor fijo (`SKIP_INTRO_SECONDS` en `game.js`), no un
  punto calculado por canción — ajustalo ahí si lo querés más corto/largo.
  Ojo: esto es aparte de cualquier diferencia de comportamiento que pueda
  tener el Embed según si el navegador tiene o no una sesión de Spotify
  Premium iniciada (eso lo decide Spotify del lado de su iframe, no
  nuestro código).
- La cola de canciones se guarda en `localStorage` del navegador
  (`eat-this:queue-v1`) apenas cada una queda confirmada. Es 100% local:
  no sincroniza entre dispositivos, se pierde si borrás datos de
  navegación o usás modo incógnito, y no requiere ningún backend. Sirve
  para no tener que rearmar la lista cada vez que abrís el juego — sobre
  todo en celular, donde entrar y salir de la app de Spotify por cada
  canción es molesto. "Vaciar lista" también borra lo guardado.
