/* ═══════════════════════════════════════════════════════════════
   recorrido.js — grabar un paseo por una vivienda.

   La idea: el arquitecto se planta en la puerta, empieza a grabar y
   recorre la casa hablando. Cada vez que ve un defecto toca la
   pantalla: se guarda la foto de ese instante y el segundo exacto en
   que ocurrió. Al terminar, esa lista de fotos con su hora es lo que
   se convierte en tareas.

   DE VÍDEO, NADA. La cámara se ve en pantalla pero no se graba: lo
   único que se graba es el audio. Y es la decisión importante de todo
   este fichero, así que conviene entender por qué:

     · Diez minutos de vídeo, aun en baja resolución, son 40–80 MB.
       Los mismos diez minutos de audio son metro y medio. En una obra
       con media raya de cobertura, eso es la diferencia entre subirlo
       y no subirlo.
     · El vídeo no lo va a ver nadie nunca. Lo que se consulta después
       son las fotos de los momentos marcados y lo que se dijo.
     · Grabar vídeo diez minutos calienta el móvil y se come la
       batería, y en Safari es donde más papeletas hay de que la cosa
       se caiga a media faena.

   El instante que se captura no es un fotograma cualquiera: se cogen
   tres seguidos y se guarda el más nítido. Andando, la mitad de las
   capturas salen movidas, y una foto movida de un remate no sirve
   para nada.
   ═══════════════════════════════════════════════════════════════ */

/** Tope de una grabación. Pasado esto se corta sola. */
export const TOPE_SEGUNDOS = 10 * 60;

/** Lado mayor de las instantáneas. */
const LADO_MAX = 1400;
const CALIDAD = 0.82;

/* ─── Formato de audio ────────────────────────────────────────── */
/**
 * El primero que el navegador acepte. Safari solo entiende mp4 y
 * Chrome prefiere webm/opus; el orden va de más ligero a más
 * compatible para que cada uno coja el suyo sin preguntarle a nadie.
 */
function mimeAudio() {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  return candidatos.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

/** Si el dispositivo puede con esto. Se comprueba antes de enseñar nada. */
export function sePuede() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/* ─── Nitidez ─────────────────────────────────────────────────── */
/**
 * Cuánto de nítida está una imagen, medido sobre una miniatura en
 * gris: se suman las diferencias entre píxeles vecinos y cuanto más
 * alta es esa varianza, más definido está el borde. No es una medida
 * absoluta de nada; solo sirve para comparar tres fotogramas tomados
 * con medio segundo de diferencia, que es justo para lo que se usa.
 */
function nitidez(lienzo) {
  const L = 96;
  const chico = document.createElement('canvas');
  chico.width = chico.height = L;
  const cx = chico.getContext('2d', { willReadFrequently: true });
  cx.drawImage(lienzo, 0, 0, L, L);
  const d = cx.getImageData(0, 0, L, L).data;

  const gris = new Float32Array(L * L);
  for (let i = 0; i < L * L; i++) {
    gris[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }
  let suma = 0;
  let suma2 = 0;
  let n = 0;
  for (let y = 1; y < L - 1; y++) {
    for (let x = 1; x < L - 1; x++) {
      const i = y * L + x;
      // Laplaciano de cuatro vecinos.
      const v = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - L] - gris[i + L];
      suma += v; suma2 += v * v; n++;
    }
  }
  const media = suma / n;
  return suma2 / n - media * media;
}

/* ─── La grabación ────────────────────────────────────────────── */
/**
 * Abre cámara y micrófono y devuelve el mando de la grabación.
 *
 * `alAvisar` se llama con el estado cada poco para que la pantalla
 * pinte el cronómetro sin tener que preguntarlo ella.
 */
export async function empezar({ alAvisar, alTope, alParcial } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true },
  });

  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;            // sin esto, acopla con el micrófono
  video.playsInline = true;
  video.autoplay = true;
  await video.play().catch(() => { /* algunos navegadores lo hacen solos */ });

  // Solo el audio va al grabador. La pista de vídeo se queda en la
  // pantalla, viéndose, sin escribirse en ningún sitio.
  const soloAudio = new MediaStream(stream.getAudioTracks());
  const mime = mimeAudio();
  const rec = new MediaRecorder(soloAudio, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);

  const trozos = [];
  const marcas = [];

  /* Lo grabado hasta ahora, empaquetado igual que al parar. Sirve para
     que quien llama lo escriba en disco SEGÚN se graba: si iOS mata la
     app a mitad de paseo, lo andado hasta el último aviso está a salvo.
     Solo se avisa cuando hay alguna marca —un paseo sin marcas no
     produce tareas y no merece resucitarse— y como mucho cada cinco
     segundos, salvo al marcar, que avisa al momento: la marca es lo
     que más duele perder. */
  const capturaParcial = () => ({
    audio: new Blob(trozos, { type: rec.mimeType || mime || 'audio/webm' }),
    mime: rec.mimeType || mime || 'audio/webm',
    duracion: transcurrido(),
    marcas: [...marcas],
  });
  let ultimoParcial = 0;
  const avisarParcial = (aLaFuerza = false) => {
    if (!alParcial || parado || !marcas.length) return;
    const ya = Date.now();
    if (!aLaFuerza && ya - ultimoParcial < 5000) return;
    ultimoParcial = ya;
    // Guardar no puede tumbar la grabación: cualquier pega, silencio.
    try { alParcial(capturaParcial()); } catch { /* seguimos grabando */ }
  };

  rec.ondataavailable = (e) => { if (e.data?.size) { trozos.push(e.data); avisarParcial(); } };
  const t0 = Date.now();
  let parado = false;
  let candado = null;

  /**
   * Pausa.
   *
   * El reloj no cuenta el rato en pausa, y no es un detalle de
   * presentación: `MediaRecorder.pause()` deja de escribir audio, así
   * que si los segundos siguieran corriendo, una marca hecha después de
   * una pausa de cinco minutos diría «minuto 8» sobre una grabación de
   * tres, y darle al play para oír lo que se dijo en esa marca llevaría
   * más allá del final. El tope de diez minutos cuenta lo mismo: lo
   * grabado, no lo que duró el paseo.
   */
  let pausado = false;
  let pausaDesde = 0;
  let pausadoTotal = 0;
  const enPausa = () => (pausado ? Date.now() - pausaDesde : 0);

  // Que no se apague la pantalla: en iOS, bloquearla corta la
  // grabación, y andando por una casa se tarda un minuto largo entre
  // toque y toque.
  try { candado = await navigator.wakeLock?.request('screen'); } catch { /* no lo soporta */ }

  rec.start(1000);   // troceado por segundos: si algo casca, se pierde uno

  const transcurrido = () => Math.round((Date.now() - t0 - pausadoTotal - enPausa()) / 1000);
  const aviso = setInterval(() => {
    if (parado) return;
    alAvisar?.({ segundos: transcurrido(), marcas: marcas.length, pausado });
    if (!pausado && transcurrido() >= TOPE_SEGUNDOS) { alTope?.(); mando.parar(); }
  }, 250);

  /** Congela el instante: tres fotogramas y nos quedamos con el mejor. */
  async function marcar() {
    // En pausa no se marca: la foto se guardaría con un minuto que no
    // existe en el audio, y quien luego le diera al play oiría otra cosa.
    if (parado || pausado) return null;
    const ms = transcurrido() * 1000;
    const ancho = video.videoWidth || 1280;
    const alto = video.videoHeight || 720;
    const escala = Math.min(1, LADO_MAX / Math.max(ancho, alto));
    const w = Math.max(1, Math.round(ancho * escala));
    const h = Math.max(1, Math.round(alto * escala));

    let mejor = null;
    let mejorNitidez = -1;
    for (let i = 0; i < 3; i++) {
      const lienzo = document.createElement('canvas');
      lienzo.width = w; lienzo.height = h;
      lienzo.getContext('2d').drawImage(video, 0, 0, w, h);
      const n = nitidez(lienzo);
      if (n > mejorNitidez) { mejorNitidez = n; mejor = lienzo; }
      if (i < 2) await new Promise((r) => setTimeout(r, 55));
    }

    const blob = await new Promise((r) => mejor.toBlob(r, 'image/jpeg', CALIDAD));
    const marca = { id: `${ms}`, ms, blob, ancho: w, alto: h };
    marcas.push(marca);
    alAvisar?.({ segundos: transcurrido(), marcas: marcas.length });
    avisarParcial(true);
    return marca;
  }

  const mando = {
    video,
    marcas,
    marcar,
    get segundos() { return transcurrido(); },
    get pausado() { return pausado; },

    /**
     * ¿Sigue vivo el grabador?
     *
     * Safari corta el micrófono cuando la app se va a segundo plano y no
     * avisa: el objeto se queda en `inactive` por su cuenta. Preguntarlo
     * al volver es la diferencia entre reanudar de verdad y seguir
     * enseñando un cronómetro que no graba nada.
     */
    vivo() { return !parado && rec.state !== 'inactive'; },

    /** Deja de grabar sin cerrar nada. La cámara se sigue viendo. */
    pausar() {
      if (parado || pausado) return false;
      try { rec.pause(); } catch { return false; }
      pausado = true;
      pausaDesde = Date.now();
      alAvisar?.({ segundos: transcurrido(), marcas: marcas.length, pausado: true });
      return true;
    },

    /** Vuelve a grabar. Devuelve false si el grabador ya no está vivo. */
    reanudar() {
      if (parado || !pausado) return false;
      if (rec.state === 'inactive') return false;
      try { rec.resume(); } catch { return false; }
      pausadoTotal += Date.now() - pausaDesde;
      pausado = false;
      alAvisar?.({ segundos: transcurrido(), marcas: marcas.length, pausado: false });
      return true;
    },

    /** Corta, suelta cámara y micrófono y devuelve lo capturado. */
    async parar() {
      if (parado) return null;
      // Si se para estando en pausa, ese rato no cuenta como grabado.
      if (pausado) { pausadoTotal += Date.now() - pausaDesde; pausado = false; }
      parado = true;
      clearInterval(aviso);
      const fin = new Promise((r) => { rec.onstop = r; });
      try { rec.stop(); } catch { /* ya estaba parado */ }
      await fin;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      try { await candado?.release(); } catch { /* daba igual */ }
      candado = null;
      const audio = new Blob(trozos, { type: rec.mimeType || mime || 'audio/webm' });
      return { audio, mime: audio.type, duracion: transcurrido(), marcas };
    },

    /**
     * Corta porque nos vamos de la pantalla. Suelta cámara y micrófono
     * igual que `parar`, y devuelve lo capturado: quien llama decide si
     * lo tira o lo guarda. Diez minutos andando por una casa no se
     * pierden por un deslizamiento hacia atrás sin querer.
     */
    async cancelar() {
      return mando.parar();
    },
  };
  return mando;
}

/** Segundos como 3:07, que es como se lee un cronómetro. */
export function reloj(segundos) {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
