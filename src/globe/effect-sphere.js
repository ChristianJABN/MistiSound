// Esfera 3D con efectos (three.js) para las capas CO2 y ozono de Misti Sound.
// La textura es una imagen REAL de NASA en proyeccion equirectangular (2:1):
//  - CO2: NASA SVS 5436 (DYAMOND, galeria Earth Information Center).
//  - Ozono: NASA Aura OMI via GIBS (canvas con el mapa del dia del cumpleanos).
// Efectos: brillo/contraste realzados en el shader, halo atmosferico (fresnel),
// particulas brillantes (estrellas de CO2 sobre los focos naranjas de la
// imagen), giro lento, arrastre con el puntero, rueda/pellizco para acercar,
// "juego de camara" (acercamiento al aparecer) y pulso con el nivel del sonido.
// Con prefers-reduced-motion: sin giro ni acercamiento automatico.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vUv = uv;
  vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

// Ruido 3D (sobre la posicion del objeto: sin costura en el meridiano 180).
const NOISE = /* glsl */ `
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5; float r = 0.0; for (int i = 0; i < 4; i++) { r += a * noise3(p); p = p * 2.03 + 3.1; a *= 0.5; } return r; }
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform float hasMap;
uniform float hasDay;
uniform float hasNight;
uniform float style;
uniform float time;
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform vec3 tint;
uniform float tintMix;
uniform vec3 rim;
uniform float rimPower;
uniform float pulse;
uniform float ramp;
uniform vec3 ramp0;
uniform vec3 ramp1;
uniform vec3 ramp2;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
${NOISE}
const vec3 W = vec3(0.299, 0.587, 0.114);
void main() {
  vec3 data = texture2D(map, vUv).rgb * hasMap;
  vec3 day = texture2D(dayMap, vUv).rgb * hasDay;
  vec3 night = texture2D(nightMap, vUv).rgb * hasNight;
  vec3 c;
  if (style < 0.5) {
    c = data;
    float l = dot(c, W);
    c = mix(vec3(l), c, saturation);
    float lr = dot(c, W);
    vec3 pal = lr < 0.5 ? mix(ramp0, ramp1, lr * 2.0) : mix(ramp1, ramp2, (lr - 0.5) * 2.0);
    c = mix(c, pal, ramp);
  } else if (style < 1.5) {
    // CO2: Tierra de noche, focos de CO2 (SVS 5436) y luces de ciudades en brasa.
    // Las texturas sRGB llegan linealizadas (oscuras): volvemos a ~gamma.
    data = sqrt(data); night = sqrt(night); day = sqrt(day);
    float land = smoothstep(0.12, 0.3, dot(data, W));
    float dl = dot(day, W);
    vec3 base = mix(vec3(0.01, 0.012, 0.022), vec3(0.2, 0.11, 0.05) * (0.5 + dl), land);
    float plume = smoothstep(0.06, 0.32, data.r - data.b) * smoothstep(0.3, 0.6, data.r);
    float lights = pow(dot(night, W), 1.35);
    float flicker = 0.75 + 0.5 * fbm(vPos * 9.0 + vec3(0.0, time * 0.35, 0.0));
    c = base
      + vec3(1.0, 0.42, 0.06) * plume * (1.5 + pulse) * flicker
      + vec3(1.0, 0.62, 0.2) * lights * (3.2 + pulse * 2.0);
  } else if (style < 2.5) {
    // Ozono: Tierra real + mapa OMI del dia en cian/violeta + remolinos vivos.
    vec3 base = day * vec3(0.8, 0.95, 1.15);
    float ol = dot(data, W);
    vec3 pal = ol < 0.5 ? mix(ramp0, ramp1, ol * 2.0) : mix(ramp1, ramp2, (ol - 0.5) * 2.0);
    base = mix(base, pal, 0.5 * hasMap);
    vec3 q = vPos * 2.2;
    float warp = fbm(q + vec3(time * 0.05, 0.0, time * 0.03));
    float n = fbm(q * 1.4 + warp * 2.2 + vec3(0.0, time * 0.04, 0.0));
    vec3 sw = mix(vec3(0.25, 0.95, 1.0), vec3(0.72, 0.42, 1.0), smoothstep(0.35, 0.7, warp));
    sw = mix(sw, vec3(0.45, 1.0, 0.65), smoothstep(0.62, 0.8, n) * 0.5);
    float bands = smoothstep(0.42, 0.72, n);
    c = mix(base, sw, bands * 0.4) + sw * bands * 0.1;
  } else {
    // Temperatura: planeta en llamas (tierra mas caliente que el oceano).
    float land = smoothstep(0.02, 0.12, day.g - day.b + 0.06);
    float n = fbm(vPos * 4.0 + vec3(0.0, time * 0.12, 0.0));
    float heat = clamp(0.35 + land * 0.4 + n * 0.45 + dot(data, W) * 0.3, 0.0, 1.2);
    c = heat < 0.55 ? mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.45, 0.05), heat / 0.55)
                    : mix(vec3(1.0, 0.45, 0.05), vec3(1.0, 0.88, 0.45), (heat - 0.55) / 0.65);
    c *= 0.8 + dot(day, W) * 0.5;
  }
  // Contraste alrededor del gris medio solo para la imagen de datos; las
  // esferas estilizadas son oscuras y lo perderian todo.
  c = style < 0.5 ? (c - 0.5) * contrast + 0.5 : c * contrast;
  c = max(c, 0.0) * (brightness + pulse * 0.35);
  c = mix(c, c * tint * 1.6, tintMix);
  float light = clamp(dot(vNormal, normalize(vec3(-0.4, 0.5, 0.8))) * 0.6 + 0.55, 0.25, 1.15);
  c *= light;
  float f = pow(1.0 - max(dot(vNormal, vView), 0.0), rimPower);
  c += rim * f * (0.55 + pulse * 0.8);
  gl_FragColor = vec4(c, 1.0);
}`;

const HALO_FRAG = /* glsl */ `
uniform vec3 color;
uniform float strength;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float f = clamp(pow(0.72 - dot(vNormal, vView), 2.6), 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0) * f * strength;
}`;

// Capas translucidas animadas (cintas de ozono alrededor del planeta).
const SHELL_FRAG = /* glsl */ `
uniform vec3 colorA;
uniform vec3 colorB;
uniform float time;
uniform float seed;
uniform float strength;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
${NOISE}
void main() {
  vec3 p = normalize(vPos) * 1.6 + seed * 7.0;
  float n = fbm(p + vec3(time * 0.06, time * 0.04, 0.0));
  float lines = pow(abs(sin((n * 9.0 + time * 0.25 + seed) * 3.14159)), 18.0);
  float edge = pow(1.0 - abs(dot(vNormal, vView)), 1.6);
  float a = (lines * 0.55 + edge * 0.3) * smoothstep(0.3, 0.7, n) * strength;
  vec3 col = mix(colorA, colorB, smoothstep(0.3, 0.75, n));
  gl_FragColor = vec4(col * a, a);
}`;

const STAR_VERT = /* glsl */ `
attribute float seed;
uniform float time;
uniform float size;
uniform float rate;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.5 + 0.5 * sin(time * (1.5 + rate * 4.0) + seed * 40.0);
  vAlpha = tw * smoothstep(0.0, 0.2, dot(normalize(normalMatrix * position), normalize(-mv.xyz)));
  gl_PointSize = size * (0.6 + tw) * (3.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const STAR_FRAG = /* glsl */ `
uniform vec3 color;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  gl_FragColor = vec4(color, a);
}`;

/** Puntos (lon/lat) donde la textura es "naranja" (fuentes de CO2 en SVS 5436). */
export function hotspotsFromImage(image, { max = 900, test = (r, g, b) => r > 170 && g > 70 && g < 150 && b < 90 } = {}) {
  const c = document.createElement('canvas');
  const w = 256;
  const h = 128;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const pts = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (test(data[i], data[i + 1], data[i + 2])) pts.push([(x / w) * 360 - 180, 90 - (y / h) * 180]);
    }
  }
  // Muestra uniforme si hay demasiados.
  const step = Math.max(1, Math.floor(pts.length / max));
  return pts.filter((_, i) => i % step === 0);
}

function lonLatToVec(lon, lat, r) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

export function createEffectSphere(host, opts = {}) {
  const {
    tint = [1, 1, 1],
    tintMix = 0,
    rim = [0.4, 0.9, 1],
    halo = [0.4, 0.8, 1],
    brightness = 1.15,
    contrast = 1.25,
    saturation = 1.2,
    starColor = [1, 0.6, 0.2],
    ramp = 0,
    rampColors = [[0.1, 0.15, 0.6], [0.2, 0.75, 1], [0.85, 0.5, 1]],
    style = 'data',
    dayUrl = null,
    nightUrl = null,
    shells = [],
    haloSize = 1.18,
    haloStrength = 0.6,
    home = 4.9
  } = opts;
  const styleId = { data: 0, co2: 1, ozone: 2, temp: 3 }[style] ?? 0;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    host.classList.add('sphere-fallback');
    return { setTexture() {}, setStars() {}, setStarRate() {}, setLevel() {}, setEmphasis() {}, intro() {}, focus() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(styleId > 0 ? 1.5 : 2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  // El lienzo ocupa toda la tarjeta (deja sitio a halo y cintas); el planeta
  // queda en ~64% del ancho.
  const HOME = home;
  let distance = HOME;
  let targetDistance = HOME;
  camera.position.set(0, 0, distance);

  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const uniforms = {
    map: { value: blank },
    dayMap: { value: blank },
    nightMap: { value: blank },
    hasMap: { value: 0 },
    hasDay: { value: 0 },
    hasNight: { value: 0 },
    style: { value: styleId },
    time: { value: 0 },
    brightness: { value: brightness },
    contrast: { value: contrast },
    saturation: { value: saturation },
    tint: { value: new THREE.Vector3(...tint) },
    tintMix: { value: tintMix },
    rim: { value: new THREE.Vector3(...rim) },
    rimPower: { value: 3.2 },
    pulse: { value: 0 },
    ramp: { value: ramp },
    ramp0: { value: new THREE.Vector3(...rampColors[0]) },
    ramp1: { value: new THREE.Vector3(...rampColors[1]) },
    ramp2: { value: new THREE.Vector3(...rampColors[2]) }
  };
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG }));
  const group = new THREE.Group();
  group.add(globe);
  scene.add(group);

  const haloUniforms = { color: { value: new THREE.Vector3(...halo) }, strength: { value: haloStrength } };
  const haloMesh = new THREE.Mesh(
    new THREE.SphereGeometry(haloSize, 64, 48),
    new THREE.ShaderMaterial({ uniforms: haloUniforms, vertexShader: VERT, fragmentShader: HALO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  );
  scene.add(haloMesh);

  const shellMeshes = shells.map((sh, i) => {
    const u = {
      colorA: { value: new THREE.Vector3(...(sh.colorA ?? [0.3, 0.9, 1])) },
      colorB: { value: new THREE.Vector3(...(sh.colorB ?? [0.75, 0.4, 1])) },
      time: { value: 0 },
      seed: { value: i * 1.37 + 0.4 },
      strength: { value: sh.strength ?? 0.8 }
    };
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(sh.r ?? 1.1 + i * 0.08, 64, 48),
      new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: SHELL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    m.rotation.set(sh.tilt ?? i * 0.5, i * 1.1, (sh.tilt ?? 0) * 0.5);
    m.userData = { u, speed: sh.speed ?? 0.05 * (i % 2 ? -1 : 1) };
    scene.add(m);
    return m;
  });

  const loader = new THREE.TextureLoader();
  function loadInto(url, key, flag) {
    if (!url) return;
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      uniforms[key].value = tex;
      uniforms[flag].value = 1;
      requestFrame();
    });
  }
  loadInto(dayUrl, 'dayMap', 'hasDay');
  loadInto(nightUrl, 'nightMap', 'hasNight');

  let stars = null;
  const starUniforms = { time: { value: 0 }, size: { value: 9 }, rate: { value: 0.5 }, color: { value: new THREE.Vector3(...starColor) } };

  function setStars(points, rate = 0.5) {
    if (stars) {
      group.remove(stars);
      stars.geometry.dispose();
    }
    if (!points?.length) return;
    const pos = new Float32Array(points.length * 3);
    const seeds = new Float32Array(points.length);
    points.forEach(([lon, lat], i) => {
      const v = lonLatToVec(lon, lat, 1.012);
      pos.set([v.x, v.y, v.z], i * 3);
      seeds[i] = Math.random();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    stars = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({ uniforms: starUniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    group.add(stars);
    starUniforms.rate.value = rate;
    requestFrame();
  }

  function setTexture(source) {
    const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    if (uniforms.map.value !== blank) uniforms.map.value?.dispose();
    uniforms.map.value = tex;
    uniforms.hasMap.value = 1;
    requestFrame();
    return tex;
  }

  // Interaccion: arrastrar para girar, rueda para acercar.
  let rotY = -1.2;
  let rotX = 0.25;
  let velY = reduced ? 0 : 0.0025;
  let dragging = null;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    rotY += (e.clientX - dragging.x) * 0.008;
    rotX = Math.max(-1.2, Math.min(1.2, rotX + (e.clientY - dragging.y) * 0.006));
    dragging = { x: e.clientX, y: e.clientY };
    requestFrame();
  });
  el.addEventListener('pointerup', () => (dragging = null));
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    targetDistance = Math.max(3.2, Math.min(9, targetDistance + e.deltaY * 0.003));
    requestFrame();
  }, { passive: false });

  let raf = 0;
  let last = performance.now();
  let level = 0;
  let emphasis = 0;
  let emphasisTarget = 0;
  let introT = null;
  let focusTarget = null;

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestFrame();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let visible = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) requestFrame();
  });
  io.observe(host);

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging) rotY += velY * dt * 60;
    if (focusTarget) {
      rotY += (focusTarget.y - rotY) * 0.06;
      rotX += (focusTarget.x - rotX) * 0.06;
      if (Math.abs(focusTarget.y - rotY) < 0.002) focusTarget = null;
    }
    if (introT !== null) {
      introT = Math.min(1, introT + dt / 2.2);
      const e = 1 - Math.pow(1 - introT, 3);
      distance = 14 + (targetDistance - 14) * e;
      if (introT >= 1) introT = null;
    } else distance += (targetDistance - distance) * 0.12;
    emphasis += (emphasisTarget - emphasis) * 0.08;
    camera.position.set(0, 0, distance - emphasis * 0.55);
    group.rotation.set(rotX, rotY, 0);
    uniforms.pulse.value = level * 0.9 + emphasis * 0.35;
    uniforms.contrast.value = contrast + emphasis * 0.25;
    haloUniforms.strength.value = haloStrength * (1 + level * 2 + emphasis * 0.8);
    const s = 1 + level * 0.035;
    group.scale.setScalar(s);
    haloMesh.scale.setScalar(s);
    const tt = reduced ? 0 : now / 1000;
    uniforms.time.value = tt;
    for (const m of shellMeshes) {
      m.userData.u.time.value = tt;
      m.userData.u.strength.value = (shells[shellMeshes.indexOf(m)].strength ?? 0.8) * (1 + level * 1.5 + emphasis * 0.4);
      if (!reduced) m.rotation.y += m.userData.speed * dt;
      m.scale.setScalar(s * (1 + level * 0.05));
    }
    starUniforms.time.value = now / 1000;
    renderer.render(scene, camera);
    const animating = (styleId > 0 && !reduced) || shellMeshes.length > 0 && !reduced || velY !== 0 || introT !== null || focusTarget || Math.abs(emphasisTarget - emphasis) > 0.01 || level > 0.01 || stars || Math.abs(targetDistance - distance) > 0.01;
    if (visible && animating) requestFrame();
  }
  function requestFrame() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  requestFrame();

  return {
    setTexture,
    setStars,
    /** Nivel del sonido 0..1 (pulso de brillo y escala). */
    setLevel(v) {
      level = Math.max(0, Math.min(1, v || 0));
      if (level > 0.01) requestFrame();
    },
    /** Realce cuando su capa suena: mas luz, contraste y un leve acercamiento. */
    setEmphasis(on) {
      emphasisTarget = on ? 1 : 0;
      requestFrame();
    },
    setStarRate(rate) {
      starUniforms.rate.value = rate;
    },
    /** Juego de camara: acercamiento desde lejos al aparecer. */
    intro() {
      if (reduced) return;
      introT = 0;
      requestFrame();
    },
    /** Gira la esfera para mostrar lon/lat de frente. */
    focus(lon, lat) {
      // Con lonLatToVec, girar en Y por -(lon + 90) grados deja ese meridiano
      // de frente a la camara; girar en X por la latitud la centra.
      focusTarget = { y: (-(lon + 90) * Math.PI) / 180, x: (lat * Math.PI) / 180 };
      // Normaliza el giro actual cerca del objetivo para no dar vueltas largas.
      while (rotY - focusTarget.y > Math.PI) rotY -= 2 * Math.PI;
      while (focusTarget.y - rotY > Math.PI) rotY += 2 * Math.PI;
      if (reduced) {
        rotY = focusTarget.y;
        rotX = focusTarget.x;
        focusTarget = null;
      }
      requestFrame();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.dispose();
      el.remove();
    }
  };
}
