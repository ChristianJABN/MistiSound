// Estilo de la musica del relato: 'ambient' (piano ambiental, por defecto)
// o 'classic' (la version original con latido y choque disonante). Se
// recuerda en el navegador; si el almacenamiento no esta disponible, se usa
// el valor por defecto.
export const MUSIC_STYLES = ['ambient', 'classic'];
const KEY = 'misti-music-style';
let current = 'ambient';
try {
  const saved = localStorage.getItem(KEY);
  if (MUSIC_STYLES.includes(saved)) current = saved;
} catch {
  /* sin almacenamiento: valor por defecto */
}

export function getMusicStyle() {
  return current;
}

export function setMusicStyle(style) {
  if (!MUSIC_STYLES.includes(style)) return;
  current = style;
  try {
    localStorage.setItem(KEY, style);
  } catch {
    /* opcional */
  }
}
