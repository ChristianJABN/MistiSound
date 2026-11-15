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
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
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
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation);
  // Paleta opcional (ozono): luminancia -> cian / azul / violeta, como en el video.
  float lr = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 pal = lr < 0.5 ? mix(ramp0, ramp1, lr * 2.0) : mix(ramp1, ramp2, (lr - 0.5) * 2.0);
  c = mix(c, pal, ramp);
  c = (c - 0.5) * contrast + 0.5;
  c *= brightness + pulse * 0.35;
  c = mix(c, c * tint * 1.6, tintMix);
  // Luz suave desde arriba-izquierda (terminador) para dar volumen.
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
    rampColors = [[0.1, 0.15, 0.6], [0.2, 0.75, 1], [0.85, 0.5, 1]]
  } = opts;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    host.classList.add('sphere-fallback');
    return { setTexture() {}, setStars() {}, setLevel() {}, setEmphasis() {}, intro() {}, focus() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  let distance = 3.4;
  let targetDistance = 3.4;
  camera.position.set(0, 0, distance);

  const uniforms = {
    map: { value: null },
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

  const haloUniforms = { color: { value: new THREE.Vector3(...halo) }, strength: { value: 0.6 } };
  const haloMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.18, 64, 48),
    new THREE.ShaderMaterial({ uniforms: haloUniforms, vertexShader: VERT, fragmentShader: HALO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  );
  scene.add(haloMesh);

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
    uniforms.map.value?.dispose();
    uniforms.map.value = tex;
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
    targetDistance = Math.max(1.9, Math.min(6, targetDistance + e.deltaY * 0.002));
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
      distance = 9 + (targetDistance - 9) * e;
      if (introT >= 1) introT = null;
    } else distance += (targetDistance - distance) * 0.12;
    emphasis += (emphasisTarget - emphasis) * 0.08;
    camera.position.set(0, 0, distance - emphasis * 0.35);
    group.rotation.set(rotX, rotY, 0);
    uniforms.pulse.value = level * 0.9 + emphasis * 0.35;
    uniforms.contrast.value = contrast + emphasis * 0.25;
    haloUniforms.strength.value = 0.6 + level * 1.2 + emphasis * 0.5;
    const s = 1 + level * 0.035;
    group.scale.setScalar(s);
    haloMesh.scale.setScalar(s);
    starUniforms.time.value = now / 1000;
    renderer.render(scene, camera);
    const animating = velY !== 0 || introT !== null || focusTarget || Math.abs(emphasisTarget - emphasis) > 0.01 || level > 0.01 || stars || Math.abs(targetDistance - distance) > 0.01;
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
