/* ═══════════════════════════════════════════════════════════════
   media.js — captura de foto, vídeo y audio.

   Las fotos se reescalan y recomprimen en el móvil antes de guardarse:
   una foto de un iPhone son 4–8 MB y aquí quedan en torno a 300 KB sin
   perder detalle útil para ver un remate o un desconchón. Con 50 villas
   y decenas de tareas por lista, es la diferencia entre una app que
   sube y una que se atasca.
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, sheet, toast } from './ui.js';

const LADO_MAX = 1600;      // px del lado mayor tras reescalar
const CALIDAD = 0.82;       // JPEG
const MAX_VIDEO = 80 * 1024 * 1024;
const MAX_AUDIO = 25 * 1024 * 1024;

/* ─── Selector de ficheros ────────────────────────────────────── */
function pedirFicheros({ accept, capture, multiple = false }) {
  return new Promise((resolve) => {
    const input = h('input', {
      type: 'file', accept, multiple: multiple || null,
      style: { position: 'fixed', left: '-9999px', opacity: '0' },
    });
    if (capture) input.setAttribute('capture', capture);
    // Safari en iOS no dispara 'cancel'; el input se retira cuando la
    // ventana recupera el foco para no dejar nodos sueltos.
    const limpiar = () => { setTimeout(() => input.remove(), 500); };
    input.addEventListener('change', () => { resolve([...input.files]); limpiar(); });
    input.addEventListener('cancel', () => { resolve([]); limpiar(); });
    document.body.append(input);
    input.click();
  });
}

export const hacerFoto = () => pedirFicheros({ accept: 'image/*', capture: 'environment' });
export const elegirFotos = () => pedirFicheros({ accept: 'image/*', multiple: true });
export const grabarVideo = () => pedirFicheros({ accept: 'video/*', capture: 'environment' });
export const elegirVideo = () => pedirFicheros({ accept: 'video/*' });

/* ─── Imágenes ────────────────────────────────────────────────── */
/** Reescala y recomprime. Devuelve { blob, ancho, alto, mime }. */
export async function prepararImagen(file) {
  let bitmap;
  try {
    // imageOrientation: el navegador aplica el EXIF y evita que las fotos
    // hechas en vertical se guarden tumbadas.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await bitmapDesdeElemento(file);
  }
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();

  const blob = await new Promise((res) => lienzo.toBlob(res, 'image/jpeg', CALIDAD));
  // Si la recompresión no mejora (imagen ya pequeña), se guarda la original.
  if (!blob) return { blob: file, ancho, alto, mime: file.type || 'image/jpeg' };
  if (blob.size >= file.size && escala === 1) {
    return { blob: file, ancho, alto, mime: file.type || 'image/jpeg' };
  }
  return { blob, ancho, alto, mime: 'image/jpeg' };
}

function bitmapDesdeElemento(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen ilegible')); };
    img.src = url;
  });
}

/* ─── Vídeo ───────────────────────────────────────────────────── */
/** Comprueba tamaño y lee la duración. Devuelve null si no vale. */
export async function prepararVideo(file) {
  if (file.size > MAX_VIDEO) {
    toast('El vídeo pesa demasiado (máx. 80 MB). Graba uno más corto.', 'err');
    return null;
  }
  const datos = await metadatosMedia(file, 'video');
  return {
    blob: file,
    mime: file.type || 'video/mp4',
    ancho: datos.ancho, alto: datos.alto, duracion: datos.duracion,
    nombre: file.name,
  };
}

export async function prepararAudio(file) {
  if (file.size > MAX_AUDIO) {
    toast('El audio pesa demasiado (máx. 25 MB).', 'err');
    return null;
  }
  const datos = await metadatosMedia(file, 'audio');
  return { blob: file, mime: file.type || 'audio/mpeg', duracion: datos.duracion, nombre: file.name };
}

function metadatosMedia(file, tipo) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(tipo);
    el.preload = 'metadata';
    const acabar = () => {
      const d = Number.isFinite(el.duration) ? Math.round(el.duration) : 0;
      URL.revokeObjectURL(url);
      resolve({ duracion: d, ancho: el.videoWidth || 0, alto: el.videoHeight || 0 });
    };
    el.onloadedmetadata = acabar;
    el.onerror = () => { URL.revokeObjectURL(url); resolve({ duracion: 0, ancho: 0, alto: 0 }); };
    setTimeout(() => { if (el.readyState === 0) acabar(); }, 4000);
    el.src = url;
  });
}

/* ─── Grabadora de audio ──────────────────────────────────────── */
function mimeSoportado() {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidatos.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

/**
 * Abre la hoja de grabación. Resuelve con { blob, mime, duracion } o
 * undefined si se cancela. Si el navegador no graba, ofrece subir un
 * fichero de audio ya existente.
 */
export async function grabarAudio() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    const [f] = await pedirFicheros({ accept: 'audio/*' });
    return f ? prepararAudio(f) : undefined;
  }

  let stream, rec, trozos = [], t0 = 0, tick, resultado = null;

  const salida = await sheet((cerrar) => {
    const crono = h('div.display.mono-num', { style: { fontSize: '40px' } }, '0:00');
    const pista = h('p.sub.center', null, 'Toca para empezar a grabar');
    const nivel = h('div.bar.on-light', { style: { margin: '6px 0' } }, h('i', { style: { width: '0%' } }));
    const botonPrincipal = h('button.icon-btn.accent', {
      style: { width: '76px', height: '76px', flex: '0 0 76px' },
      'aria-label': 'Grabar',
    }, icon('mic', 28));
    const guardar = h('button.btn.ink.full', { disabled: true }, 'Añadir audio');
    let grabando = false;

    const pintarCrono = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      crono.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    const empezar = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        toast('No se pudo acceder al micrófono', 'err');
        return;
      }
      const mime = mimeSoportado();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      trozos = [];
      rec.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(trozos, { type: rec.mimeType || mime || 'audio/webm' });
        resultado = {
          blob, mime: blob.type,
          duracion: Math.round((Date.now() - t0) / 1000),
        };
        guardar.disabled = false;
        pista.textContent = 'Grabación lista. Puedes escucharla antes de añadirla.';
        const audio = h('audio', { controls: true, src: URL.createObjectURL(blob), style: { width: '100%' } });
        nivel.replaceWith(h('div.audio-row', null, audio));
      };
      rec.start();
      grabando = true;
      t0 = Date.now();
      tick = setInterval(() => {
        pintarCrono();
        // Tope de seguridad: 5 minutos por nota de voz.
        if (Date.now() - t0 > 5 * 60 * 1000) parar();
      }, 200);
      botonPrincipal.replaceChildren(icon('stop', 26));
      botonPrincipal.className = 'icon-btn ink';
      botonPrincipal.style.width = botonPrincipal.style.height = '76px';
      pista.textContent = 'Grabando… toca el cuadrado para parar';
    };

    const parar = () => {
      if (!grabando) return;
      grabando = false;
      clearInterval(tick);
      try { rec.stop(); } catch { /* ya parado */ }
      stream?.getTracks().forEach((t) => t.stop());
      botonPrincipal.style.display = 'none';
    };

    botonPrincipal.addEventListener('click', () => (grabando ? parar() : empezar()));
    guardar.addEventListener('click', () => { parar(); cerrar(resultado); });

    return [
      h('h2.title', null, 'Nota de voz'),
      h('div.center', { style: { padding: '14px 0 4px' } }, crono),
      pista,
      nivel,
      h('div', { style: { display: 'flex', justifyContent: 'center', padding: '10px 0 4px' } }, botonPrincipal),
      guardar,
      h('button.btn.ghost.full', {
        onclick: () => { parar(); stream?.getTracks().forEach((t) => t.stop()); cerrar(undefined); },
      }, 'Cancelar'),
    ];
  });

  clearInterval(tick);
  stream?.getTracks().forEach((t) => t.stop());
  return salida || undefined;
}

/** Duración en mm:ss para las etiquetas. */
export function duracionLegible(segundos) {
  if (!segundos) return '';
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
