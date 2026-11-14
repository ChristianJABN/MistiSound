# "Tu cumpleaños en la Tierra": el storytelling de Misti Sound en la app

La pestaña **Tu historia** sigue el recorrido emocional del storytelling del
equipo. Cada paso se apoya en un dato real de la NASA.

| Paso | En la app | Datos |
|---|---|---|
| 1 · Conexión íntima | Lugar + **día y mes** del cumpleaños (año opcional) | Catálogo GeoNames y celda GISTEMP v4 más cercana |
| 2 · La memoria del pasado | Promedio del mes del cumpleaños en **1950-1959**. Melodía lenta (56 BPM), arpegio mayor estable, voz serena (velocidad 0,88). El globo vuelve a ese mes de 1950. | GISTEMP: 10 meses, mínimo 6 con dato |
| 3 · El latido de los últimos 5 años | Un compás por año (p. ej. 2022-2026). El tempo sube 20 BPM por cada °C sobre los años 50 (72 a 132 BPM), las notas suben con la anomalía, aparece una nota disonante desde +0,5 °C y suena un latido grave de dos golpes. | GISTEMP: 5 meses, mínimo 3 con dato |
| 4 · Reflexión y comunidad | Mensaje final, **tarjeta PNG 1080×1350** para redes (Web Share o descarga) y 3 preguntas para debatir en clase | Los mismos valores |

## Lo que es honesto decir (y la app dice)

- **GISTEMP es mensual.** El día del cumpleaños no cambia el dato de
  temperatura: solo elige la foto satelital del presente. La app lo explica
  junto al formulario.
- Son **anomalías** respecto a 1951-1980 en una celda de 2° suavizada
  (1200 km). No son la temperatura de la calle ni el clima de un día.
- Si una ventana tiene pocos datos, no se calcula su promedio ni la
  diferencia. Ese tramo queda en silencio, sin inventar nada.
- El año de nacimiento es opcional. Si se escribe, el relato agrega una
  línea sobre ese mes, sin cambiar la comparación principal.

## Globo: viajar en el tiempo y acercarse

- Al consultar, **sin necesidad de sonido**, la línea de tiempo y el globo
  van al mes del cumpleaños en 1950. Los botones *Ver años 50* y *Ver
  últimos 5 años* cambian de época en silencio.
- Foto satelital con fecha, de **NASA GIBS** (gratis, sin login, sin
  servidor). Código en `src/globe/dated-imagery.js`.
  - Pasado: Landsat WELD, compuesto anual de 1985, a unos 30 m por píxel.
    Es la imagen satelital global más antigua en GIBS; no existen fotos
    satelitales de los años 50, y la app lo dice.
  - Presente: MODIS Terra en color real del **día del cumpleaños** en el
    último año disponible, a unos 250 m por píxel. Puede tener nubes o
    franjas sin pasada del satélite.
- El acercamiento mínimo bajó de 400 km a **3 km** de altura, así que ya se
  puede ver la ciudad.
- Se descartó Google Earth Engine: necesitaría un servidor con
  credenciales o que cada visitante inicie sesión.

## Enlaces compartidos

Un relato se comparte como el par `1950-MM` + último `MM` (formato preset
v3 existente). **Nunca lleva el día ni el nombre del lugar.** Al abrirlo,
se reconstruye el relato con el mes.

## Código

- `src/history/story-core.js`: validación, ventanas, lectura atómica,
  textos, reflexión y preguntas.
- `src/history/story-music.js`: regla musical, en un módulo puro.
- `src/history/story-player.js`: reproducción con Tone por el bus global
  (volumen, silencio y limiter).
- `src/ui/story-card.js`: tarjeta para redes.
- Pruebas: `tests/story.test.js`.
