// Activa el motor de audio dentro de un gesto del usuario (clic o tecla) y lo
// refleja en el store. Nunca se llama sin un gesto: la app no suena sola.
export async function ensureAudio({ audioEngine, store }) {
  if (audioEngine.isStarted()) return true;
  try {
    await audioEngine.start();
    store.set((s) => ({ audio: { ...s.audio, started: true } }));
    return true;
  } catch (err) {
    console.error('No se pudo activar el audio', err);
    return false;
  }
}
