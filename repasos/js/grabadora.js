/* La grabadora de reuniones, calcada del grabador de notas de voz del
   iPhone que le gusta a Fran: un panel oscuro que sube desde abajo,
   con el título, el cronómetro con centésimas, la onda roja avanzando
   en vivo y el botón cuadrado de parar dentro de su aro.

   Debajo del aspecto hay tres decisiones de fondo:

   - El audio se parte en FICHEROS COMPLETOS: la grabadora rota cada
     18 minutos y sube cada parte según la cierra. No es capricho: los
     trozos de un mp4 de iPhone no se pueden pegar en el servidor, y
     así cada parte cabe en los topes del transcriptor (25 MB/25 min)
     y una reunión de dos horas no se juega entera a una subida final.

   - El panel vive colgado del body, no de la pantalla: se puede bajar
     a una barrita y seguir moviéndose por la app —apuntar una tarea a
     mano, mirar una vivienda— sin dejar de grabar.

   - Si una parte no sube (un bache de cobertura), se guarda y se
     reintenta sola: la grabación no se pierde por un corte de red.

   Solo puede haber una grabación en marcha: la obra tiene una reunión
   al día y dos grabadoras a la vez solo pueden ser un despiste. */
import { h, icon, toast } from './ui.js';
import * as api from './api.js';

/* Cada cuánto se rota la grabadora. 18 minutos de opus u AAC quedan
   muy por debajo de los 25 MB / 25 min que admite el transcriptor. */
const ROTACION_MS = 18 * 60 * 1000;

/* Cuánto histórico de onda se guarda para pintar. */
const BARRAS = 480;

let activa = null;   // la grabación en marcha, si la hay

export const hayGrabacionEnMarcha = () => !!activa;

function mimeDeGrabadora() {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidatos.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

/**
 * Empieza a grabar la reunión y levanta el panel. `alTerminar(grabacion)`
 * se llama cuando el audio está parado, subido y cerrado en el servidor
 * —la transcripción y el acta son el paso siguiente, de quien llama—.
 */
export async function empezarGrabadora({ reunionId, titulo, alTerminar }) {
  if (activa) { toast('Ya hay una grabación en marcha', 'err'); return null; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast('Este navegador no puede grabar audio', 'err');
    return null;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast('No se pudo acceder al micrófono', 'err');
    return null;
  }

  const mime = mimeDeGrabadora();
  let grabacion;
  try {
    const r = await api.empezarGrabacion(reunionId, mime || 'audio/webm');
    grabacion = r.grabacion;
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    toast(e.codigo === 'red' ? 'Sin conexión: la grabación necesita servidor' : e.message, 'err');
    return null;
  }

  /* ─── El estado de la sesión ─── */
  const s = {
    grabacion,
    stream,
    rec: null,
    trozos: [],
    parte: 0,             // la parte que se está grabando ahora
    parteEmpezo: 0,       // cuándo empezó esta parte (para su duración)
    t0: Date.now(),       // cuándo empezó la reunión entera
    pendientes: [],       // partes por subir: {n, dur, blob}
    subiendo: false,
    parando: false,
    niveles: new Array(BARRAS).fill(0),
    audioCtx: null,
    analizador: null,
    reloj: null,
    onda: null,
    panel: null,
    mini: null,
  };
  activa = s;

  /* ─── Subidas: una cola con reintento ─── */
  const subir = async () => {
    if (s.subiendo) return;
    s.subiendo = true;
    while (s.pendientes.length) {
      const p = s.pendientes[0];
      try {
        await api.subirParteGrabacion(s.grabacion.id, p.n, p.dur, p.blob);
        s.pendientes.shift();
        pintarEstado();
      } catch {
        // Bache de cobertura: se reintenta en 15 segundos sin perder nada.
        pintarEstado(true);
        setTimeout(() => { s.subiendo = false; subir(); }, 15000);
        return;
      }
    }
    s.subiendo = false;
    pintarEstado();
    if (s.parando) rematar();
  };

  /* ─── La grabadora que rota ─── */
  const grabarParte = () => {
    s.trozos = [];
    s.parteEmpezo = Date.now();
    s.rec = new MediaRecorder(s.stream, mime ? { mimeType: mime } : undefined);
    s.rec.ondataavailable = (e) => { if (e.data.size) s.trozos.push(e.data); };
    s.rec.onstop = () => {
      const blob = new Blob(s.trozos, { type: s.rec.mimeType || mime || 'audio/webm' });
      const dur = Math.round((Date.now() - s.parteEmpezo) / 1000);
      if (blob.size > 0) {
        s.pendientes.push({ n: s.parte, dur, blob });
        s.parte += 1;
        subir();
      }
      if (!s.parando) grabarParte();   // la parte siguiente, sin hueco apreciable
      else if (!s.pendientes.length && !s.subiendo) rematar();
    };
    // Trozos cada 10 s: si el navegador muere, lo grabado hasta el
    // último trozo sigue en memoria del proceso… y sobre todo evita un
    // único volcado gigante al rotar.
    s.rec.start(10000);
  };

  /* ─── El final: todo subido → cerrar en el servidor ─── */
  // Cerrar la grabación se reintenta, pero no eternamente: un error
  // que no es de red —el acta ya sellada, por ejemplo— no se arregla
  // insistiendo, y dejar la app llamando al servidor cada ocho
  // segundos hasta el fin de los tiempos no ayuda a nadie.
  let intentosCierre = 0;
  const rematar = async () => {
    try {
      const dur = Math.round((Date.now() - s.t0) / 1000);
      const r = await api.cerrarGrabacion(s.grabacion.id, dur);
      desmontar();
      alTerminar?.(r.grabacion);
    } catch (e) {
      intentosCierre += 1;
      const insiste = e.codigo === 'red' && intentosCierre < 5;
      toast(insiste
        ? 'Sin conexión: se reintenta en unos segundos'
        : `${e.message} · el audio está guardado; vuelve a entrar en la reunión`, 'err');
      if (insiste) setTimeout(rematar, 8000);
      else desmontar();
    }
  };

  const parar = () => {
    if (s.parando) return;
    s.parando = true;
    try { s.rec?.stop(); } catch { /* ya parado */ }
    s.stream.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(s.reloj);
    try { s.audioCtx?.close(); } catch { /* nada */ }
    pintarEstado();
  };

  const desmontar = () => {
    s.panel?.remove();
    s.mini?.remove();
    activa = null;
  };

  /* ─── La onda en vivo ─── */
  try {
    s.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const fuente = s.audioCtx.createMediaStreamSource(s.stream);
    s.analizador = s.audioCtx.createAnalyser();
    s.analizador.fftSize = 512;
    fuente.connect(s.analizador);
  } catch { /* sin onda; la grabación sigue */ }

  const muestras = s.analizador ? new Uint8Array(s.analizador.fftSize) : null;
  let ultimaBarra = 0;

  /* ─── El panel grande ─── */
  const crono = h('div.d-grab-crono', null, '00:00,00');
  const lienzo = h('canvas.d-grab-onda');
  const estado = h('p.d-grab-estado', null, 'Avisa a la mesa: la reunión queda grabada.');

  const botonParar = h('button.d-grab-parar', { 'aria-label': 'Parar la grabación', onclick: parar },
    h('span.d-grab-cuadrado'));

  s.panel = h('div.d-grabadora', null,
    h('button.d-grab-asa', { 'aria-label': 'Bajar la grabadora', onclick: () => plegar(true) }, h('span')),
    h('p.d-grab-titulo', null, titulo),
    crono,
    h('div.d-grab-lienzo', null, lienzo),
    estado,
    botonParar,
  );

  /* ─── La barrita para seguir usando la app mientras graba ─── */
  const miniCrono = h('span.d-grab-mini-crono', null, '00:00');
  s.mini = h('button.d-grab-mini', { 'aria-label': 'Volver a la grabación', onclick: () => plegar(false) },
    h('span.d-grab-punto'),
    h('span', null, 'Grabando'),
    miniCrono,
    h('span.d-grab-mini-parar', {
      role: 'button', 'aria-label': 'Parar la grabación',
      onclick: (ev) => { ev.stopPropagation(); parar(); plegar(false); },
    }, h('span.d-grab-cuadrado.chico')),
  );
  s.mini.style.display = 'none';

  const plegar = (aMini) => {
    s.panel.style.display = aMini ? 'none' : '';
    s.mini.style.display = aMini ? '' : 'none';
  };

  const pintarEstado = (atascado = false) => {
    if (s.parando) {
      const quedan = s.pendientes.length;
      estado.textContent = quedan
        ? `Guardando el audio… ${quedan === 1 ? 'queda una parte' : `quedan ${quedan} partes`}`
        : 'Cerrando la grabación…';
      botonParar.style.visibility = 'hidden';
    } else if (atascado) {
      estado.textContent = 'Poca cobertura: el audio se guarda y se reintenta solo.';
    } else if (s.pendientes.length) {
      estado.textContent = 'Subiendo una parte mientras se sigue grabando…';
    } else {
      estado.textContent = 'Avisa a la mesa: la reunión queda grabada.';
    }
  };

  /* ─── El reloj de pintar: cronómetro + onda ─── */
  const ctx = lienzo.getContext('2d');
  const pintar = () => {
    const ms = Date.now() - s.t0;
    const m = Math.floor(ms / 60000);
    const seg = Math.floor((ms % 60000) / 1000);
    const cent = Math.floor((ms % 1000) / 10);
    crono.textContent = m >= 60
      ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')},${String(cent).padStart(2, '0')}`;
    miniCrono.textContent = `${m}:${String(seg).padStart(2, '0')}`;

    if (s.analizador && Date.now() - ultimaBarra > 80) {
      ultimaBarra = Date.now();
      s.analizador.getByteTimeDomainData(muestras);
      let suma = 0;
      for (let i = 0; i < muestras.length; i++) {
        const v = (muestras[i] - 128) / 128;
        suma += v * v;
      }
      s.niveles.push(Math.min(1, Math.sqrt(suma / muestras.length) * 3.2));
      if (s.niveles.length > BARRAS) s.niveles.shift();
    }

    // La onda: barras finas desde la derecha, como la de iOS.
    const ancho = lienzo.clientWidth;
    const alto = lienzo.clientHeight;
    if (ancho && (lienzo.width !== ancho * 2 || lienzo.height !== alto * 2)) {
      lienzo.width = ancho * 2;
      lienzo.height = alto * 2;
    }
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = '#db3e32';
    const paso = 6;   // 2px de barra + 1px de aire, a doble densidad
    const caben = Math.floor(lienzo.width / paso);
    const desde = Math.max(0, s.niveles.length - caben);
    for (let i = desde; i < s.niveles.length; i++) {
      const x = lienzo.width - (s.niveles.length - i) * paso;
      // La curva levanta lo bajito: una voz suave también tiene que
      // verse latir, como en la grabadora del iPhone.
      const alt = Math.max(6, Math.pow(s.niveles[i], 0.55) * lienzo.height * 0.9);
      ctx.fillRect(x, (lienzo.height - alt) / 2, 4, alt);
    }

    if (activa === s) s.reloj = requestAnimationFrame(pintar);
  };

  document.body.append(s.panel, s.mini);
  grabarParte();
  s.reloj = requestAnimationFrame(pintar);

  return { parar };
}
