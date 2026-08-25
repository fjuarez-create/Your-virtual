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
const LADO_MIRADA = 1024;   // px del lado mayor de las fotos que van a la API
const CALIDAD_MIRADA = 0.72;
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

/**
 * Botón de subida de verdad: un <label> con el <input type="file">
 * escondido dentro. El toque llega al input por la vía nativa de la
 * etiqueta, sin que nadie llame a click().
 *
 * Esto importa: Safari en iOS solo abre el selector de ficheros si la
 * llamada sale de un toque reciente. Con una hoja de opciones por medio
 * («¿cámara o galería?») la llamada llega tarde y el navegador la
 * ignora en silencio — desde fuera parece que el botón está muerto. Con
 * un label no hay nada que ignorar.
 *
 * Y de paso sobra preguntar: `accept="image/*"` sin `capture` hace que
 * iOS ofrezca ya «Fototeca», «Hacer foto» y «Elegir archivo» en su
 * propio menú. Preguntarlo antes era duplicar el trabajo del sistema.
 *
 * @param {object} opciones  clase (las del label), accept, capture,
 *   multiple, etiqueta (aria-label) y onElegir(ficheros).
 */
export function botonFichero({ clase = 'btn', accept, capture, multiple = false, etiqueta, onElegir }, ...contenido) {
  const input = h('input', {
    type: 'file', accept, multiple: multiple || null, tabindex: '-1',
    style: {
      position: 'absolute', left: '0', top: '0', width: '1px', height: '1px',
      opacity: '0', pointerEvents: 'none',
    },
  });
  if (capture) input.setAttribute('capture', capture);
  input.addEventListener('change', () => {
    const ficheros = [...input.files];
    // Se vacía el input para que volver a elegir la misma foto dispare
    // otra vez 'change'; si no, la segunda vez no pasaría nada.
    input.value = '';
    if (ficheros.length) onElegir(ficheros);
  });
  return h(['label', ...String(clase).split(/\s+/).filter(Boolean)].join('.'), {
    role: 'button', tabindex: '0',
    'aria-label': etiqueta || null,
    style: { position: 'relative', cursor: 'pointer' },
    // Teclado: el input no es alcanzable a propósito (tabindex -1), así
    // que es el label quien recoge Enter y espacio.
    onkeydown: (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      input.click();
    },
  }, input, ...contenido);
}

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

/**
 * Una foto lista para ir dentro de un PDF: recortada a la proporción
 * pedida (como `cover`: se come un poco de los lados o de arriba y
 * abajo, nunca deforma) y recomprimida en JPEG, que es lo único que un
 * PDF traga tal cual, sin tener que decodificar nada.
 *
 * Devuelve los bytes y las medidas, que el PDF necesita las dos cosas.
 * Si la foto no se deja leer —un Blob perdido de los de Safari—,
 * devuelve null y la tarea sale sin foto en el papel.
 */
export async function jpegParaPdf(blob, { anchoMax = 1100, proporcion = 8 / 5 } = {}) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    try { bitmap = await bitmapDesdeElemento(blob); } catch { return null; }
  }
  try {
    // El recorte centrado: la ventana más grande con la proporción
    // pedida que cabe en la foto.
    let rw = bitmap.width;
    let rh = Math.round(rw / proporcion);
    if (rh > bitmap.height) { rh = bitmap.height; rw = Math.round(rh * proporcion); }
    const rx = Math.round((bitmap.width - rw) / 2);
    const ry = Math.round((bitmap.height - rh) / 2);

    const ancho = Math.min(anchoMax, rw);
    const alto = Math.round(ancho / proporcion);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho; lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, rx, ry, rw, rh, 0, 0, ancho, alto);

    const jpeg = await new Promise((res) => lienzo.toBlob(res, 'image/jpeg', 0.74));
    if (!jpeg) return null;
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), ancho, alto };
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Una copia pequeña de una foto, en base64 y sin la cabecera `data:`,
 * para mandarla a que la lean.
 *
 * Se encoge a propósito. En la API cada foto se cobra por lo grande que
 * sea, y para ver que una junta está abierta o que un rodapié está
 * suelto no hacen falta cuatro megapíxeles: a 1024 px del lado mayor se
 * distingue igual y cuesta la quinta parte.
 */
export async function paraMirar(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await bitmapDesdeElemento(blob);
  }
  const escala = Math.min(1, LADO_MIRADA / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();

  const pequena = await new Promise((res) => lienzo.toBlob(res, 'image/jpeg', CALIDAD_MIRADA));
  return base64Pelado(pequena || blob);
}

/** Lo que hay dentro de un blob, en base64 y sin el `data:…;base64,`. */
function base64Pelado(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(lector.error || new Error('No se ha podido leer la foto.'));
    lector.onload = () => resolve(String(lector.result).split(',')[1] || '');
    lector.readAsDataURL(blob);
  });
}

/**
 * Foto de perfil: recorte cuadrado centrado y 512 px de lado. Se hace
 * aquí y no en el servidor para que lo que viaje sean 40 KB y no 6 MB.
 */
export async function prepararAvatar(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await bitmapDesdeElemento(file);
  }
  const lado = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - lado) / 2;
  const sy = (bitmap.height - lado) / 2;

  const LADO = 512;
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = LADO;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, lado, lado, 0, 0, LADO, LADO);
  bitmap.close?.();

  const blob = await new Promise((res) => lienzo.toBlob(res, 'image/jpeg', 0.86));
  return blob;
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
export function mimeSoportado() {
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
