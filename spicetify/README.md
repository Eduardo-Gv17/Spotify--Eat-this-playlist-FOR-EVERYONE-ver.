# Eat This para Spicetify

> El desarrollo de esta app continúa en **[Eduardo-Gv17/eat-this-spicetify](https://github.com/Eduardo-Gv17/eat-this-spicetify)**. Usa su README en inglés y **[descarga el ZIP de la última release](https://github.com/Eduardo-Gv17/eat-this-spicetify/releases/latest/download/eat-this.zip)** para instalarla. Esta carpeta conserva la copia inicial del proyecto.

Custom App independiente de la versión web. No necesita servidor, credenciales de desarrollador ni paquetes npm. Usa React del cliente, canvas y el reproductor de Spotify. Se entrega directamente en el formato instalable `index.js` + `manifest.json`; Creator puede incorporarse después si se desea trabajar con JSX/TypeScript.

## Instalar en Windows

Primero instala Spotify de escritorio y configura [Spicetify](https://spicetify.app/docs/getting-started). Luego, desde la raíz de este repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\spicetify\install.ps1
```

El script copia el paquete a `CustomApps/eat-this` dentro de la configuración que indica `spicetify -c`, registra `eat-this` y ejecuta `spicetify apply`. Para actualizar, ejecútalo de nuevo. Spotify puede reiniciarse durante la aplicación.

También puedes copiar manualmente la carpeta `eat-this` a tu directorio `CustomApps` y ejecutar:

```powershell
spicetify config custom_apps eat-this
spicetify apply
```

## Jugar

Abre Eat This desde la barra lateral. **Tus playlists guardadas** carga tu biblioteca, incluidas las playlists dentro de carpetas. Busca por nombre y pulsa una tarjeta para cargarla; después pulsa **Empezar partida**. **Actualizar** vuelve a leer la biblioteca. Los enlaces siguen disponibles dentro de **O usar un enlace de playlist**, como alternativa si tu cliente no permite leer la biblioteca. También puedes hacer clic derecho en una playlist y seleccionar **Jugar Eat This**.

En **Comenzar canciones** puedes elegir:

- **Parte intensa (estimada)**, opción predeterminada: usa las secciones y su volumen del análisis musical cuando está disponible. Omite introducción y tramo final; elige la sección más intensa candidata. No representa estadísticas de escuchas ni garantiza encontrar el estribillo. Sin análisis disponible a tiempo, empieza al 33 % de la duración (o a 30 segundos si la duración no está disponible).
- **Desde 0:30** o **Desde 0:45**: posición fija.
- **Desde el inicio**: comportamiento anterior.

El salto se realiza una sola vez cuando Spotify confirma el URI esperado. Se limita para dejar al menos diez segundos antes del final de canciones cortas. El análisis de la próxima portada se prepara mientras juegas; una respuesta tardía no cambia de posición una canción que ya empezó. La preferencia se guarda localmente.

Haz clic en el tablero para enfocar los controles: flechas o WASD para moverte; espacio para pausar el juego. La música sigue sonando al pausar, perder o salir. La partida se pausa si la ventana pierde el foco. La primera portada suena al empezar y cada portada comida solicita esa canción. El pie muestra la canción realmente reportada por Spotify y avisa mientras espera confirmación.

## Compatibilidad y límites

- Requiere `Spicetify.Platform.PlaylistAPI.getContents(uri, { offset, limit })` y `Spicetify.Player`. La biblioteca usa `RootlistAPI.getContents({ folderUri, offset, limit })`; si no está disponible, conserva el acceso por enlace. El análisis opcional usa `Spicetify.getAudioData`. Las APIs internas cambian entre versiones. Un formato incompatible genera un error visible; no se usa el Web API público como sustituto.
- Pagina de 100 en 100, elimina canciones duplicadas y omite archivos locales, episodios y elementos marcados como no disponibles. Canciones restringidas por cuenta o región aún pueden fallar al reproducir.
- No garantiza reproducción bajo demanda con cuentas Free. Usa las capacidades del cliente y la cuenta existentes. Selecciona este PC como dispositivo activo para probar.
- Los pedidos rápidos se serializan y se conserva el último objetivo pendiente; una petición ya enviada puede sonar brevemente antes de la siguiente. No se garantiza latencia cero.
- La versión web original permanece independiente.

## Verificación

```powershell
node --test spicetify/test.cjs
```

Las pruebas cubren el motor, paginación de playlists y biblioteca, carpetas, formatos incompatibles, estimación de fragmentos, posiciones en canciones cortas y confirmación del reproductor antes del salto con un cliente simulado. La primera versión ya fue probada por el usuario en Spotify. Las nuevas funciones de biblioteca y fragmentos requieren validación real: biblioteca con carpetas, búsqueda, selección, fragmentos automáticos y fijos, cambios rápidos, salida y reentrada.

Referencias: [Custom Apps](https://spicetify.app/docs/development/custom-apps), [Player](https://spicetify.app/docs/development/api-wrapper/methods/player), [Platform](https://spicetify.app/docs/development/api-wrapper/methods/platform).

Para desactivar:

```powershell
spicetify config custom_apps eat-this-
spicetify apply
```
