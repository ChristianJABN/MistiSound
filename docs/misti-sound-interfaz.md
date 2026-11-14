# Misti Sound: interfaz final (INTERFAZ.docx)

Este documento resume lo que se implementó a partir de `INTERFAZ.docx` y las
decisiones de datos que conviene conocer antes de presentar.

## Lo que ve la persona

- **Cabecera:**
  - Logo y nombre "Misti Sound".
  - Dos pestañas: **Tu Fecha** y **Guía Docente**. La segunda abre un modal.
  - Selector **ES / EN**, que cambia los textos y la voz.
  - Botón **A+**: agranda un 25 % toda la interfaz y sube el contraste. Para
    lograrlo, todo el CSS pasó de `px` a `rem` y se escala la raíz. La
    preferencia se recuerda en el navegador.
- **Columna 1 (01 · Tu punto de partida):**
  - Campo "Ciudad o lugar" con búsqueda mientras se escribe, más un botón de
    mira que usa la ubicación del navegador y elige la ciudad más cercana.
  - Selectores de **Día** y **Mes de cumpleaños**.
  - Botón **Escuchar mi fecha**: activa el sonido y reproduce el relato.
  - Demo "Arequipa · 15 de agosto".
  - Botón **Atajos de teclado (?)**, que abre un panel con los atajos.
- **Columna 2 (las 3 capas):**
  - **CO₂**: imagen DYAMOND de NASA SVS 5196, de la galería EIC.
  - **Capa de ozono**: mapa real de NASA Aura/OMI desde GIBS, del día del
    cumpleaños; se superponen 3 días para tapar las franjas sin pasada.
  - **Temperatura**: el globo 3D con los colores de anomalía, con zoom y
    viaje en el tiempo.
  - Cada tarjeta tiene su botón **Oír sonido** (solo esa capa: primero
    1950 y luego los últimos 5 años).
- **Columna 3 (02 · Escucha la diferencia):**
  - **[1] Antes · 1950** y **[2] Ahora · 5 años**, cada uno con Temp, CO₂ y
    Ozono, y su botón de reproducir.
  - **[3] Mezclar ambos tiempos**: 1950 suena a la izquierda y el presente
    a la derecha, al mismo tiempo.
  - **Compartir en Instagram** y **Compartir en TikTok**.
- **Barra inferior:** sonido, volumen y línea de tiempo, igual que antes.

Las pestañas Explorar, Perú, Accesible, DJ y Jukebox EIC **se quitaron del
menú, pero su código sigue intacto**. Un enlace compartido antiguo todavía
las abre.

## Sonido de las 3 capas (`src/history/layer-music.js`)

| Capa | Sonido | Regla |
|---|---|---|
| CO₂ | estrellas: destellos agudos con eco | 0,6 a 8 estrellas/s según (ppm − 280) / (430 − 280) |
| Ozono | brisa o viento: ruido rosa filtrado con ráfagas | fuerza = (330 − DU) / 90: menos ozono, viento más fuerte y brillante |
| Temperatura | melodía y latido | 1950: 56 BPM, arpegio estable. Presente: un compás por año, 72 BPM + 20 BPM por °C sobre 1950 (tope 132), con nota disonante desde +0,5 °C |

## Datos

| Métrica | Fuente | Alcance | "Antes" | "Ahora" |
|---|---|---|---|---|
| Temp | NASA GISTEMP v4 | celda de 2° de la ciudad, anomalía vs 1951–1980 | promedio 1950–1959 del mes | promedio de los últimos 5 años del mes |
| CO₂ | NASA GISS (núcleos de hielo, anual) + NOAA GML (global mensual desde 1979) | **global** | promedio 1950–1959 (≈ 311–316 ppm) | mismos años que la temperatura, mismo mes |
| Ozono | NASA Aura OMI vía GIBS (`OMI_Ozone_TOMS_Total_Column`) | la ciudad (≈ 0,56°) | **2005–2009**, los primeros años completos medidos | últimos 5 años, días 5, 15 y 25 del mes |

- **No existen mediciones de ozono por ciudad de 1950.** La app lo dice
  junto a las métricas y en la guía.
- El CO₂ es un dato global porque el gas se mezcla en toda la atmósfera. La
  app también lo aclara.
- Si el mes del cumpleaños todavía no está publicado en NOAA, se usa el
  último mes disponible de ese año y se marca como aproximado.
- Para regenerar el CO₂ y la imagen: `node scripts/prepare_layers.mjs`.
- El ozono se lee en vivo desde GIBS (CORS abierto, sin login) usando su
  tabla de colores oficial, donde cada color equivale a 2,5 DU.

## Teclado (solo en "Tu Fecha", nunca mientras se escribe en un campo)

| Tecla | Acción |
|---|---|
| Espacio | pausar o reproducir (si el foco está en un botón, actúa el botón) |
| 1 / 2 / 3 | 1950 / últimos 5 años / mezclar |
| M | silenciar la música; la voz sigue |
| Esc | cerrar el panel de atajos o la guía |

## Compartir

Instagram y TikTok **no permiten publicar directamente desde una web**. Por
eso la app genera el archivo y luego, según el dispositivo:

- **En el celular**, abre la hoja de compartir del sistema, desde donde se
  elige Instagram o TikTok.
- **En la PC**, lo descarga.

Los archivos que genera:

- **Instagram:** una tarjeta PNG de 1080×1350.
- **TikTok:** un video vertical de 1080×1920 con el **audio real** del
  relato, de unos 30 s. Es MP4 en Chrome y Edge recientes; si el navegador
  no lo permite, es WebM.

## Guía Docente

- Es un modal claro de alto contraste con el contenido de `INTERFAZ.docx` y
  las fuentes de los datos.
- **Descargar Ficha (PDF)** genera un PDF real sin librerías
  (`src/ui/pdf-lite.js`, Helvetica con codificación WinAnsi).
- **Copiar Guía** copia el texto.
- A+ también agranda el modal.
