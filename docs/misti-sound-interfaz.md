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

---

# v2: flujo con fecha completa, esferas con efectos y Experiencias

Basado en los videos de referencia del equipo.

## Flujo (`src/ui/flow.js`)

1. **Inicio:** al principio solo se ve el formulario, centrado sobre la
   aurora: lugar, **día, mes y año** de nacimiento. Todos son obligatorios.
2. **Intro:** al pulsar "Escuchar mi fecha" aparecen partículas, ondas y los
   textos "Descubre cómo sonaba la Tierra el día que naciste…", "Cada rincón
   del planeta guarda una melodía." y "Sintonizando datos reales…". Dura
   unos 4 s, mientras cargan los datos. Se puede saltar con Esc.
3. **Tablero:** se revelan las 3 esferas con un acercamiento de cámara y
   empieza el relato. El orden es **1950 → tu año → últimos 5 años**.

Los datos son **mensuales** (GISTEMP no cambia por día). El día solo se usa
para elegir la foto satelital MODIS.

## Tres momentos

| Momento | Temp | CO₂ | Ozono |
|---|---|---|---|
| 1950 | promedio 1950–1959 del mes | promedio anual 1950–1959 (GISS) | 2005–2009, el primer período medido |
| Tu año | el mes de ese año | anual (GISS) si es antes de 1979, mensual (NOAA) desde 1979 | solo si naciste en 2005 o después; si no, "sin medición" |
| Últimos 5 años | promedio del mes | mismos años | mismos años |

Teclas: **1** = 1950, **2** = tu año, **3** = últimos 5 años, **4** =
mezclar, **M** = solo voz, **Espacio** = pausar o reproducir.

## Esferas con efectos

- **CO₂ y ozono** son esferas 3D (`src/globe/effect-sphere.js`, three.js):
  - La textura es una imagen real de NASA: SVS 5436 (EIC) para el CO₂ y el
    mapa OMI del día del cumpleaños para el ozono.
  - Tienen brillo y contraste realzados, halo atmosférico y paleta
    cian-violeta en el ozono.
  - En el CO₂ hay **estrellas** que titilan justo sobre los focos naranjas
    de la imagen de NASA.
  - Giran solas, se arrastran con el mouse, se acercan con la rueda y hacen
    un acercamiento de cámara al aparecer.
  - Cuando suena su capa se iluminan, ganan contraste y laten.
- **Temperatura** sigue siendo el globo Cesium (zoom a la ciudad y fotos
  Landsat/MODIS). Al revelarse vuela desde el espacio hasta tu ciudad, y
  tiene resplandor y filtros que reaccionan al sonido.
- Cada esfera tiene un **anillo de picos** (`src/ui/sound-ring.js`) que
  sigue el espectro real del audio, como en el video.
- **Debajo de cada esfera hay un gráfico animado**
  (`src/ui/layer-charts.js`):
  - *Histórico de CO₂*: 1950 → hoy, con tu año marcado.
  - *Evolución del ozono*: ondas más agitadas cuanto menos ozono hay.
  - *Tendencia de temperatura*: barras de los años 50, tu año (en verde) y
    los últimos 5 años.
- Con `prefers-reduced-motion` no hay giro, acercamientos ni animación de
  intro.

## Compartir

- **Instagram:** solo la imagen (tarjeta PNG de 1080×1350).
- **TikTok:** video de la **tarjeta estilizada** (mismo diseño) con el
  sonido real, 1080×1920. El momento que suena se ilumina, un ecualizador
  sigue el audio y las barras crecen.

## Experiencias (`src/ui/experiences.js`)

Cada persona puede dejar:

- un comentario;
- una foto, que se reduce a 1280 px en el navegador;
- su **melodía Misti**, un clip de unos 12 s de la mezcla de sus tiempos
  grabado del audio real.

El envío pide permiso explícito para publicar. Se manda con **Netlify
Forms** (formulario `experiencias` en `index.html`).

**Pasos en Netlify (una sola vez):**

1. *Site configuration → Forms → Enable form detection* y volver a publicar.
2. Los envíos aparecen en *Forms → experiencias*, con la foto y la melodía
   como archivos adjuntos. Opcional: activar avisos por correo.
3. Para publicar en el muro una experiencia aprobada, agregarla a
   `public/data/experiences.json` en `items` con este formato:
   `{ "name", "place", "comment", "summary", "photo": "<URL>", "audio": "<URL>" }`.
   Conviene subir antes la foto y el audio a `public/experiences/`.

**Límites del plan gratuito de Netlify:** 100 envíos y 10 MB de archivos
al mes. Netlify no permite leer los envíos públicamente; por eso el muro
muestra los aprobados (JSON) y los propios de cada persona (guardados en su
navegador). En desarrollo local el envío falla a propósito: se guarda en el
navegador y la app lo avisa.
