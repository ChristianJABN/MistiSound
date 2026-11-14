# Jukebox EIC: de los mapas oficiales de NASA a sonido

Pestaña **Jukebox EIC**. Responde al objetivo central del reto: elegir una
visualización del Earth Information Center (EIC) y escuchar una sonificación
generada a partir de la imagen en tiempo real.

## Frames usados (NASA SVS, dominio público)

| Año | Página SVS | Archivo original | Qué representa | Escala de color |
|---|---|---|---|---|
| 2022 | [5060](https://svs.gsfc.nasa.gov/5060/) | `2022GISTEMP-anomaly-notitles.png` | Año 2022 (single year) | −2..+2 °C |
| 2023 | [5207](https://svs.gsfc.nasa.gov/5207/) | `2023AverageTemp_HD.png` | Año 2023 | −2..+2 °C |
| 2024 | [5450](https://svs.gsfc.nasa.gov/5450/) | `2024GISTEMPMap_2K.png` | **Promedio móvil de 24 meses** que termina en 2024 | −2..+2 °C |
| 2025 | [5603](https://svs.gsfc.nasa.gov/5603/) | `Map_HD_2025.png` | Año 2025 (smoothed) | −4..+4 °C |

Todos son GISTEMP v4, proyección Robinson, línea base 1951-1980. La
representación de cada uno sale del caption o la descripción de su página
SVS y queda copiada en `public/data/eic/frames.json` (`representation_source`).
El de 2024 se muestra siempre como promedio de 24 meses, nunca como "el año 2024".

### Cómo regenerarlos

```bash
node scripts/prepare_eic_frames.mjs
```

- Descarga los PNG de SVS a `work/raw-eic-frames/` (ignorado por git),
  calcula su SHA-256, los reduce a 960×540 y los escribe en
  `public/data/eic/frames/`.
- Sin dependencias: solo Node ≥ 20 (`scripts/lib/png.mjs` decodifica y
  codifica PNG con `node:zlib`).
- `--offline` reutiliza las descargas crudas sin usar la red.
- Se copian en lugar de leerse en remoto porque `svs.gsfc.nasa.gov` no
  habilita CORS para nuestro origen, así que un `<canvas>` no podría leer
  sus píxeles.

Para agregar otro mapa, añade una entrada a `FRAMES` en el script. Hay que
medir dos cosas sobre la imagen 1920×1080:

- la barra de leyenda: eje, extremos y valores;
- el rectángulo del mapa, con las zonas a excluir (leyenda y textos).

## Método (`src/eic/frame-analysis.js`)

1. **Leyenda de la propia imagen.** Se muestrean 96 puntos a lo largo de la
   barra de color de NASA y se arma una tabla color → °C. Cada año trae su
   propia escala, por eso no se usa una paleta fija.
2. **Color → °C.** Cada píxel del mapa se compara con `k ×` cada color de la
   leyenda, con `k` entre 0,62 y 1,08. Ese factor tolera el sombreado de
   relieve e iluminación que SVS aplica sobre el color. Un píxel lejos de
   toda la leyenda (negro, costas, textos) queda "sin lectura".
3. **Franjas.** El mapa se corta en 24 columnas de oeste a este y en 3
   franjas de latitud (norte, trópicos, sur). Por columna se calcula el
   promedio en °C, la fracción ≥ +1 °C y la fracción por debajo de lo normal
   (< −0,2 °C).

Es una **lectura visual aproximada**, no el dato numérico de GISTEMP. Hay
otra limitación: en los mapas de 2022-2024 todo lo que pasa de +2 °C se ve
del mismo rojo, y la descripción avisa qué porcentaje del mapa está en ese
tope.

Comprobación con los frames reales (`tests/eic-jukebox.test.js`):

- Se lee más del 90 % de cada mapa.
- 2022, un año de La Niña, sale más fresco que 2023, 2024 y 2025, como
  indica GISTEMP.

## Regla musical (`src/eic/frame-sonification.js`)

El mapa se recorre de oeste a este, una franja cada 0,5 s (24 franjas = 12 s).

| Lo que se ve | Lo que se oye |
|---|---|
| Promedio en °C de la franja | Nota del piano: pentatónica de Do, escala **fija** de −2 a +3 °C, igual para todos los años |
| Fracción de la franja ≥ +1 °C | 0 a 4 golpes suaves por franja (más rojo intenso = más ritmo) |
| Fracción por debajo de lo normal (azules) | Volumen de un acorde grave |
| Franja sin lectura | Silencio (nunca se inventa una nota) |

Todo sale por el bus global del `AudioEngine`, así que el volumen, el
silencio y el limiter de la app se aplican igual. La reproducción nunca
empieza sola.

## Accesibilidad

- Una lista de texto describe qué ve la jukebox: porcentaje cálido y frío,
  promedio por franjas de latitud, la franja más y menos cálida con región
  aproximada, y el aviso de saturación. Mientras se carga, una línea de
  estado lo anuncia por `role="status"`.
- El botón **Leer descripción en voz** usa la narración de la app (Web
  Speech API) en español o inglés.
- La casilla opcional **Anunciar cada franja** hace que el lector de
  pantalla diga, mientras suena, qué región pasa y su valor aproximado
  (`aria-live`).
- El `alt` de cada mapa explica qué significa cada color.
- Pendiente: probarlo con NVDA o VoiceOver reales.
