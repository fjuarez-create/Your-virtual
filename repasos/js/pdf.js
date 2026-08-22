/* ═══════════════════════════════════════════════════════════════
   pdf.js — hoja de repasos en PDF para pegar en la puerta.

   El PDF se escribe a mano, sin librerías: solo texto y rectángulos con
   las tipografías Helvetica que todo lector de PDF trae de serie. Eso
   deja el fichero en unos pocos kilobytes y evita cargar 200 KB de
   dependencia en el móvil de obra.

   El texto va en Latin-1 (WinAnsiEncoding), que cubre todas las tildes,
   la eñe y los signos de apertura del castellano.
   ═══════════════════════════════════════════════════════════════ */

import { estado, oficio, OFICIOS, ZONAS } from './catalog.js';

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 48;

/* Anchos de Helvetica en milésimas de punto. Con ellos las líneas se
   parten donde toca en vez de salirse del papel. */
const ANCHOS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584, '¿': 611, '¡': 333, '·': 278,
};
for (const d of '0123456789') ANCHOS[d] = 556;

function anchoTexto(texto, tam, negrita = false) {
  let total = 0;
  for (const c of texto) total += ANCHOS[c] ?? 556;
  // La negrita de Helvetica es algo más ancha; con este factor la
  // partición de líneas no se queda corta.
  return (total / 1000) * tam * (negrita ? 1.06 : 1);
}

/** Parte un texto en líneas que quepan en `ancho`. */
function partir(texto, ancho, tam, negrita = false) {
  const lineas = [];
  for (const parrafo of String(texto).split('\n')) {
    let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? actual + ' ' + palabra : palabra;
      if (anchoTexto(prueba, tam, negrita) <= ancho) {
        actual = prueba;
      } else {
        if (actual) lineas.push(actual);
        actual = palabra;
      }
    }
    lineas.push(actual);
  }
  return lineas.length ? lineas : [''];
}

/* ─── Escritura del fichero ───────────────────────────────────── */
function escapar(texto) {
  return String(texto).replace(/[\\()]/g, (c) => '\\' + c);
}

/** Pasa a Latin-1; lo que no quepa se sustituye por algo parecido. */
function latin1(texto) {
  const equivalentes = { '—': '-', '–': '-', '«': '"', '»': '"', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...' };
  return String(texto)
    .replace(/[—–«»“”‘’…]/g, (c) => equivalentes[c] || c)
    .split('')
    .map((c) => (c.charCodeAt(0) <= 255 ? c : '?'))
    .join('');
}

/* Los colores de la aplicación, tal cual, para que el papel y la
   pantalla hablen el mismo idioma. En PDF van de 0 a 1. */
const COLOR = {
  tinta: [0, 0, 0],
  gris: [0.55, 0.55, 0.55],
  beige: [0.839, 0.792, 0.737],      // #d6cabc
  beigeSuave: [0.937, 0.925, 0.910], // #efecE8
  topo: [0.451, 0.420, 0.361],       // #736b5c
  verde: [0.024, 0.302, 0.176],      // #064d2d
  verdeSuave: [0.878, 0.937, 0.906],
  rojo: [0.396, 0.114, 0.090],       // #651d17
  rojoSuave: [0.984, 0.918, 0.910],
  ambar: [0.408, 0.235, 0.012],      // #683c03
  ambarSuave: [0.996, 0.957, 0.902],
  papel: [1, 1, 1],
  tarjeta: [0.969, 0.969, 0.965],   // el gris de las tarjetas, muy suave para el papel
  fondo: [0.961, 0.961, 0.961],
};
const c3 = (c) => c.map((n) => n.toFixed(3)).join(' ');

class Pagina {
  constructor() { this.ops = []; }
  texto(x, y, cadena, { tam = 11, negrita = false, gris = 0, color = null, espaciado = 0 } = {}) {
    this.ops.push(
      'BT',
      color ? `${c3(color)} rg` : `${gris} g`,
      `/${negrita ? 'F2' : 'F1'} ${tam} Tf`,
      espaciado ? `${espaciado} Tc` : '0 Tc',
      `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
      `(${escapar(latin1(cadena))}) Tj`,
      'ET',
    );
  }
  /** Un rectángulo macizo. */
  relleno(x, y, ancho, alto, color) {
    this.ops.push(`${c3(color)} rg`, `${x.toFixed(2)} ${y.toFixed(2)} ${ancho.toFixed(2)} ${alto.toFixed(2)} re f`);
  }
  /**
   * Una pastilla: rectángulo con las esquinas redondeadas. El PDF no
   * las trae, así que se dibujan con cuatro curvas. El 0,5523 es la
   * constante de siempre para que una curva de Bézier pase por un
   * cuarto de círculo sin que se note.
   */
  pastilla(x, y, ancho, alto, radio, color) {
    const r = Math.min(radio, alto / 2, ancho / 2);
    const k = r * 0.5523;
    const x2 = x + ancho;
    const y2 = y + alto;
    this.ops.push(
      `${c3(color)} rg`,
      `${(x + r).toFixed(2)} ${y.toFixed(2)} m`,
      `${(x2 - r).toFixed(2)} ${y.toFixed(2)} l`,
      `${(x2 - r + k).toFixed(2)} ${y.toFixed(2)} ${x2.toFixed(2)} ${(y + r - k).toFixed(2)} ${x2.toFixed(2)} ${(y + r).toFixed(2)} c`,
      `${x2.toFixed(2)} ${(y2 - r).toFixed(2)} l`,
      `${x2.toFixed(2)} ${(y2 - r + k).toFixed(2)} ${(x2 - r + k).toFixed(2)} ${y2.toFixed(2)} ${(x2 - r).toFixed(2)} ${y2.toFixed(2)} c`,
      `${(x + r).toFixed(2)} ${y2.toFixed(2)} l`,
      `${(x + r - k).toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${(y2 - r + k).toFixed(2)} ${x.toFixed(2)} ${(y2 - r).toFixed(2)} c`,
      `${x.toFixed(2)} ${(y + r).toFixed(2)} l`,
      `${x.toFixed(2)} ${(y + r - k).toFixed(2)} ${(x + r - k).toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c`,
      'f',
    );
  }
  linea(x1, y1, x2, y2, grosor = 0.8, gris = 0) {
    this.ops.push(`${gris} G`, `${grosor} w`, `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
  recuadro(x, y, ancho, alto, grosor = 1, gris = 0.2) {
    this.ops.push(`${gris} G`, `${grosor} w`, `${x.toFixed(2)} ${y.toFixed(2)} ${ancho} ${alto} re S`);
  }
  /** Pinta una imagen registrada en `ensamblar` por su nombre. */
  imagen(nombre, x, y, ancho, alto) {
    this.ops.push('q', `${ancho.toFixed(2)} 0 0 ${alto.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`, `/${nombre} Do`, 'Q');
  }
  /**
   * La misma imagen pero con las esquinas redondeadas: el camino de la
   * pastilla como recorte (`W n`) en vez de como relleno. Es lo que
   * hace que una foto pegada en el papel se vea de la misma familia
   * que las tarjetas de la aplicación.
   */
  fotoRecortada(nombre, x, y, ancho, alto, radio = 10) {
    const r = Math.min(radio, alto / 2, ancho / 2);
    const k = r * 0.5523;
    const x2 = x + ancho;
    const y2 = y + alto;
    this.ops.push(
      'q',
      `${(x + r).toFixed(2)} ${y.toFixed(2)} m`,
      `${(x2 - r).toFixed(2)} ${y.toFixed(2)} l`,
      `${(x2 - r + k).toFixed(2)} ${y.toFixed(2)} ${x2.toFixed(2)} ${(y + r - k).toFixed(2)} ${x2.toFixed(2)} ${(y + r).toFixed(2)} c`,
      `${x2.toFixed(2)} ${(y2 - r).toFixed(2)} l`,
      `${x2.toFixed(2)} ${(y2 - r + k).toFixed(2)} ${(x2 - r + k).toFixed(2)} ${y2.toFixed(2)} ${(x2 - r).toFixed(2)} ${y2.toFixed(2)} c`,
      `${(x + r).toFixed(2)} ${y2.toFixed(2)} l`,
      `${(x + r - k).toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${(y2 - r + k).toFixed(2)} ${x.toFixed(2)} ${(y2 - r).toFixed(2)} c`,
      `${x.toFixed(2)} ${(y + r).toFixed(2)} l`,
      `${x.toFixed(2)} ${(y + r - k).toFixed(2)} ${(x + r - k).toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c`,
      'W n',
      `${ancho.toFixed(2)} 0 0 ${alto.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`,
      `/${nombre} Do`,
      'Q',
    );
  }
  get contenido() { return this.ops.join('\n'); }
}

/**
 * Monta el fichero. `imagenes` es un Map nombre → {bytes, ancho, alto}
 * con JPEGs tal cual: el PDF los traga sin tocarlos (DCTDecode), así
 * que embeber una foto cuesta exactamente lo que pesa la foto.
 *
 * Se ensambla por partes —texto y bytes crudos— porque un JPEG no
 * sobrevive a un paso por string más que por casualidad.
 */
function ensamblar(paginas, imagenes = new Map()) {
  const partes = [];        // trozos: string (latin-1/ascii) o Uint8Array
  let posicion = 0;
  const meter = (parte) => {
    partes.push(parte);
    posicion += typeof parte === 'string' ? parte.length : parte.length;
  };

  const idPaginas = 2;
  const idFuente = 3;
  const idFuenteNegrita = 4;
  const nombres = [...imagenes.keys()];
  const idImagen = new Map(nombres.map((n, i) => [n, 5 + i]));
  const primeraPagina = 5 + nombres.length;
  const total = primeraPagina + paginas.length * 2;

  const recursos = '<< '
    + `/Font << /F1 ${idFuente} 0 R /F2 ${idFuenteNegrita} 0 R >> `
    + (nombres.length
      ? `/XObject << ${nombres.map((n) => `/${n} ${idImagen.get(n)} 0 R`).join(' ')} >> `
      : '')
    + '>>';

  const posiciones = [];
  const objeto = (id, cuerpo, flujo = null) => {
    posiciones[id] = posicion;
    meter(`${id} 0 obj\n${cuerpo}\n`);
    if (flujo !== null) {
      meter('stream\n');
      meter(flujo);
      meter('\nendstream\n');
    }
    meter('endobj\n');
  };

  meter('%PDF-1.4\n');
  objeto(1, `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`);
  const kids = paginas.map((_, i) => `${primeraPagina + i * 2} 0 R`).join(' ');
  objeto(idPaginas, `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
  objeto(idFuente, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objeto(idFuenteNegrita, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  for (const n of nombres) {
    const im = imagenes.get(n);
    objeto(idImagen.get(n),
      `<< /Type /XObject /Subtype /Image /Width ${im.ancho} /Height ${im.alto} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`,
      im.bytes);
  }

  paginas.forEach((pag, i) => {
    const idPag = primeraPagina + i * 2;
    const idContenido = idPag + 1;
    objeto(idPag, `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${A4.ancho} ${A4.alto}] `
      + `/Resources ${recursos} /Contents ${idContenido} 0 R >>`);
    const flujo = pag.contenido;
    objeto(idContenido, `<< /Length ${flujo.length} >>`, flujo);
  });

  const inicioXref = posicion;
  meter(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) {
    meter(`${String(posiciones[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  meter(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`);

  // Los strings van carácter a byte (ya están en Latin-1); los bytes, tal cual.
  const salida = new Uint8Array(posicion);
  let d = 0;
  for (const parte of partes) {
    if (typeof parte === 'string') {
      for (let i = 0; i < parte.length; i++) salida[d++] = parte.charCodeAt(i) & 0xff;
    } else {
      salida.set(parte, d);
      d += parte.length;
    }
  }
  return new Blob([salida], { type: 'application/pdf' });
}

/* ─── Los grupos de la hoja ───────────────────────────────────── */

/**
 * Parte las tareas en bloques con título, según se quiera la hoja por
 * gremios o por estancias.
 *
 * El orden de los bloques NO es alfabético, es el del catálogo, y en
 * los dos casos por el mismo motivo: el catálogo ya está ordenado como
 * se usa. Los gremios, como se reparte el trabajo; las estancias, como
 * se anda la casa —planta baja, planta alta, y lo de fuera al final—.
 * Alfabético pondría la cubierta antes que la entrada.
 *
 * Lo que no esté en el catálogo —una estancia de una obra vieja, un
 * gremio retirado— no se pierde: va detrás, por orden alfabético. Y lo
 * que no tenga nada puesto, al final del todo, junto y avisado.
 *
 * @returns {null|Array<{titulo, sub, tareas}>} null si no hay que
 *   agrupar, y entonces la hoja sale en lista llana como siempre.
 */
function agrupar(tareas, orden) {
  if (orden !== 'oficio' && orden !== 'estancia') return null;
  const porGremio = orden === 'oficio';

  /* Un gremio que ya no está en el catálogo se cuenta como «General»,
     que es exactamente lo que hace oficio() y por tanto lo que se ve en
     la pantalla. Si aquí se dejara el identificador crudo, el papel
     diría una cosa y el móvil otra; y con dos claves distintas —la
     retirada y «general»— saldrían dos bloques con el mismo título.

     Las estancias no se tocan: son texto libre y la que no esté en el
     catálogo es igual de válida, solo que más nueva o más vieja. */
  const enCatalogo = new Set(OFICIOS.map((o) => o.id));
  const claveDe = (t) => {
    if (!porGremio) return String(t.zona || '');
    const id = String(t.oficio || '');
    if (!id) return '';
    return enCatalogo.has(id) ? id : OFICIOS[0].id;
  };

  const cajas = new Map();
  for (const t of tareas) {
    const clave = claveDe(t);
    if (!cajas.has(clave)) cajas.set(clave, []);
    cajas.get(clave).push(t);
  }

  /* El título de cada bloque. En los gremios se cuelga debajo la
     empresa que lo lleva: esta hoja se le manda a alguien, y saber a
     quién es media faena. */
  const titulo = (clave) => {
    if (!clave) return { titulo: porGremio ? 'Sin gremio asignado' : 'Sin estancia asignada', sub: '' };
    if (!porGremio) return { titulo: clave, sub: '' };
    const o = oficio(clave);
    return { titulo: o.nombre, sub: o.empresa || '' };
  };

  const grupos = [];
  const meter = (clave) => {
    const lista = cajas.get(clave);
    if (!lista) return;
    grupos.push({ ...titulo(clave), tareas: lista });
    cajas.delete(clave);
  };

  for (const clave of porGremio ? OFICIOS.map((o) => o.id) : ZONAS) meter(clave);
  for (const clave of [...cajas.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))) meter(clave);
  meter('');

  return grupos;
}

/* ─── La hoja de la puerta ────────────────────────────────────── */
/**
 * Genera el PDF de una lista de repaso: una casilla y una línea por
 * tarea, en cuerpo grande, para imprimir y pegar en la puerta de la
 * vivienda. Sin fotos: aquí manda la legibilidad a un metro de distancia.
 *
 * `orden` parte la hoja en bloques: 'oficio' por gremios, 'estancia'
 * por habitaciones. Sin él —o con cualquier otra cosa— sale la lista
 * llana de siempre, que es lo que quieren las pantallas donde el orden
 * ya lo manda un control en la propia pantalla.
 *
 * @returns {Blob} el PDF listo para descargar o compartir
 */
export function hojaDePuerta({ vivienda, promocion, fecha, autor, tareas, orden = null }) {
  const anchoUtil = A4.ancho - MARGEN * 2;
  const paginas = [];
  let pag = new Pagina();
  let y = A4.alto - MARGEN;

  const cabecera = (primera) => {
    if (primera) {
      pag.texto(MARGEN, y, 'UNIK WORKS', { tam: 9, negrita: true, gris: 0.45 });
      y -= 30;
      pag.texto(MARGEN, y, vivienda, { tam: 30, negrita: true });
      y -= 20;
      pag.texto(MARGEN, y, promocion, { tam: 13, gris: 0.35 });
      y -= 18;
      pag.texto(MARGEN, y, `Inspección ${fecha}  ·  ${autor}`, { tam: 11, gris: 0.45 });
      y -= 14;
      pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 1.6);
      y -= 26;
    } else {
      pag.texto(MARGEN, y, `${vivienda}  ·  ${promocion}`, { tam: 10, negrita: true, gris: 0.4 });
      y -= 12;
      pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.8, 0.6);
      y -= 22;
    }
  };
  cabecera(true);

  const TAM = 12;
  const INTERLINEA = 15.5;
  const SANGRIA = 44;          // hueco de la casilla y el número
  const SUELO = MARGEN + 26;   // por debajo de esto ya no cabe nada

  /* El bloque que se está pintando ahora mismo, para poder repetir su
     título si se cambia de página en mitad. Sin esto, la hoja de al
     lado empieza con «9. Junta abierta en...» y nadie sabe de qué
     gremio es: la mitad de una hoja repartida por gremios se quedaría
     sin dueño. */
  let grupoEnCurso = null;

  /* La franja del título. `seguida` la marca como continuación, y es la
     única diferencia entre estrenar un bloque y retomarlo. */
  const franja = (g, seguida = false) => {
    const conSub = !!g.sub && !seguida;
    const alto = conSub ? 34 : 24;
    pag.pastilla(MARGEN - 6, y - alto + 13, anchoUtil + 12, alto, 4, COLOR.beigeSuave);
    pag.texto(MARGEN, y, g.titulo, { tam: 13, negrita: true, color: COLOR.topo });
    const dcha = seguida ? '(viene de la página anterior)' : '';
    if (dcha) {
      pag.texto(A4.ancho - MARGEN - anchoTexto(dcha, 9), y, dcha, { tam: 9, gris: 0.5 });
    }
    if (conSub) pag.texto(MARGEN, y - 12, g.sub, { tam: 9.5, gris: 0.5 });
    y -= alto + 8;
  };

  const saltar = () => {
    paginas.push(pag);
    pag = new Pagina();
    y = A4.alto - MARGEN;
    cabecera(false);
    if (grupoEnCurso) franja(grupoEnCurso, true);
  };

  /* Estrenar un bloque: el gremio o la estancia, y debajo la empresa
     cuando la hay. Va con su franja beige para que se localice pasando
     las hojas con el pulgar, que es como se usa esto en obra. */
  const tituloDeGrupo = (g, primero) => {
    const alto = g.sub ? 34 : 24;
    /* Un título solo al pie de la página no es un título de nada: se
       baja con su primera tarea. Por eso pide sitio para las dos.

       El bloque anterior se da por cerrado ANTES de ese posible salto:
       si no, la página nueva estrenaría repitiendo el título del que
       acaba de terminar, justo encima del que empieza. */
    grupoEnCurso = null;
    if (!primero && y - (alto + 46) < SUELO) saltar();
    else if (!primero) y -= 12;

    franja(g);
    grupoEnCurso = g;
  };

  /* Una tarea. `n` es el número que le toca en la hoja: corrido de
     principio a fin aunque haya bloques, para poder decir «la 14» por
     teléfono sin tener que decir además de qué bloque. */
  const pintarTarea = (t, n) => {
    const lineas = partir(t.texto || 'Sin descripción', anchoUtil - SANGRIA, TAM);
    const altoBloque = Math.max(lineas.length * INTERLINEA, 24) + 14;

    // Salto de página cuando ya no cabe el bloque entero.
    if (y - altoBloque < SUELO) saltar();

    // Casilla para marcar a bolígrafo en la propia obra.
    pag.recuadro(MARGEN, y - 11.5, 13, 13, 1.1, 0.25);
    pag.texto(MARGEN + 22, y, `${n}.`, { tam: TAM, negrita: true, gris: 0.35 });
    lineas.forEach((linea, i) => {
      pag.texto(MARGEN + SANGRIA, y - i * INTERLINEA, linea, { tam: TAM });
    });

    y -= lineas.length * INTERLINEA + 4;
    // El nombre sale del catálogo: esta hoja se imprime y se manda por
    // WhatsApp, y poner «RESUELTA» debajo de una tarea rechazada sería
    // decir en papel lo contrario de lo que pasó.
    if (t.estado && t.estado !== 'pendiente') {
      pag.texto(MARGEN + SANGRIA, y, estado(t.estado).nombre.toUpperCase(),
        { tam: 8.5, negrita: true, gris: 0.5 });
      y -= 11;
    }
    y -= 10;
    pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.5, 0.82);
    y -= 16;
  };

  const grupos = agrupar(tareas, orden);
  if (!grupos) {
    tareas.forEach((t, i) => pintarTarea(t, i + 1));
  } else {
    let n = 0;
    grupos.forEach((g, i) => {
      tituloDeGrupo(g, i === 0);
      for (const t of g.tareas) pintarTarea(t, ++n);
    });
  }

  paginas.push(pag);

  // Pie con la numeración, ya sabiendo cuántas páginas hay.
  paginas.forEach((p, i) => {
    p.texto(MARGEN, MARGEN - 14,
      `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}  ·  Página ${i + 1} de ${paginas.length}`,
      { tam: 8.5, gris: 0.55 });
  });

  return ensamblar(paginas);
}

/* ─── El acta del día ─────────────────────────────────────────── */

/* Cómo se cuenta en papel cada cosa que le pasó a un repaso, y de qué
   color va su barra. Los mismos verbos y los mismos colores que en la
   pantalla: quien mira el PDF y quien mira el móvil tienen que estar
   viendo lo mismo. */
const HECHOS_PDF = {
  nueva: { rotulo: 'APUNTADO', color: COLOR.gris, fondo: COLOR.fondo },
  resuelta: { rotulo: 'COMPLETADO', color: COLOR.ambar, fondo: COLOR.ambarSuave },
  verificada: { rotulo: 'VERIFICADO', color: COLOR.verde, fondo: COLOR.verdeSuave },
  rechazada: { rotulo: 'RECHAZADO', color: COLOR.rojo, fondo: COLOR.rojoSuave },
  nota: { rotulo: 'NOTA', color: COLOR.topo, fondo: COLOR.beigeSuave },
};

/**
 * El acta de un día de obra, en papel.
 *
 * Se lee como un parte de visita: la portada con la fecha en grande y
 * quién estuvo, el resumen del día en cuatro cifras, y debajo, casa por
 * casa y hora a hora, todo lo que se hizo. Es el documento que la
 * promotora manda a la constructora, así que tiene que poder imprimirse
 * y entenderse sin haber visto nunca la aplicación.
 *
 * @returns {Blob} el PDF listo para descargar o compartir
 */
export function actaDelDia({ titulo, diaSemana, promocion, gente, conteo, villas }) {
  const anchoUtil = A4.ancho - MARGEN * 2;
  const paginas = [];
  let pag = new Pagina();
  let y = 0;

  const nuevaPagina = (primera) => {
    pag = new Pagina();
    if (primera) {
      // La banda beige de la portada, del ancho del papel.
      pag.relleno(0, A4.alto - 168, A4.ancho, 168, COLOR.beige);
      let by = A4.alto - 52;
      pag.texto(MARGEN, by, 'UNIK WORKS', { tam: 8.5, negrita: true, color: COLOR.topo, espaciado: 2.2 });
      pag.texto(A4.ancho - MARGEN - anchoTexto('ACTA DE OBRA', 8.5, true) - 24, by, 'ACTA DE OBRA',
        { tam: 8.5, negrita: true, color: COLOR.topo, espaciado: 2.2 });
      by -= 44;
      pag.texto(MARGEN, by, titulo, { tam: 30, negrita: true, color: COLOR.tinta });
      by -= 22;
      pag.texto(MARGEN, by, `${diaSemana} · ${promocion}`, { tam: 12.5, color: COLOR.topo });
      y = A4.alto - 168 - 34;
    } else {
      pag.texto(MARGEN, A4.alto - 44, `Acta del ${titulo}`, { tam: 9, negrita: true, color: COLOR.topo, espaciado: 1.2 });
      pag.linea(MARGEN, A4.alto - 54, A4.ancho - MARGEN, A4.alto - 54, 0.7, 0.85);
      y = A4.alto - 78;
    }
  };
  let villaEnCurso = '';
  const sitio = (alto) => {
    if (y - alto >= MARGEN + 24) return;
    paginas.push(pag);
    nuevaPagina(false);
    // Un acta se lee meses después: si una vivienda se parte entre dos
    // páginas, la segunda tiene que decir de qué casa está hablando.
    if (villaEnCurso) {
      pag.texto(MARGEN, y, `${villaEnCurso} (sigue)`, { tam: 13, negrita: true, color: COLOR.tinta });
      y -= 8;
      pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.8, 0.85);
      y -= 18;
    }
  };

  nuevaPagina(true);

  /* ─── Quién estuvo ─── */
  pag.texto(MARGEN, y, 'QUIENES ESTUVIERON', { tam: 8.5, negrita: true, color: COLOR.gris, espaciado: 1.6 });
  y -= 18;
  const nombres = gente.length ? gente.join('  ·  ') : 'Sin firmar';
  for (const linea of partir(nombres, anchoUtil, 13)) {
    pag.texto(MARGEN, y, linea, { tam: 13, color: COLOR.tinta });
    y -= 17;
  }
  y -= 16;

  /* ─── Las cifras del día, en pastillas ─── */
  const cifras = [
    { n: conteo.nuevas, rotulo: conteo.nuevas === 1 ? 'repaso nuevo' : 'repasos nuevos', c: COLOR.tinta, f: COLOR.fondo },
    { n: conteo.completadas, rotulo: conteo.completadas === 1 ? 'completado' : 'completados', c: COLOR.ambar, f: COLOR.ambarSuave },
    { n: conteo.verificadas, rotulo: conteo.verificadas === 1 ? 'verificado' : 'verificados', c: COLOR.verde, f: COLOR.verdeSuave },
    { n: conteo.rechazadas, rotulo: conteo.rechazadas === 1 ? 'rechazado' : 'rechazados', c: COLOR.rojo, f: COLOR.rojoSuave },
  ].filter((x) => x.n > 0);

  if (cifras.length) {
    const hueco = 9;
    const ancho = (anchoUtil - hueco * (cifras.length - 1)) / cifras.length;
    const alto = 58;
    cifras.forEach((x, i) => {
      const cx = MARGEN + i * (ancho + hueco);
      pag.pastilla(cx, y - alto, ancho, alto, 12, x.f);
      pag.texto(cx + 14, y - 28, String(x.n), { tam: 24, negrita: true, color: x.c });
      pag.texto(cx + 14, y - 44, x.rotulo, { tam: 9, color: COLOR.topo });
    });
    y -= alto + 26;
  }

  /* ─── Y el detalle, casa por casa ─── */
  for (const villa of villas) {
    villaEnCurso = '';
    sitio(74);
    villaEnCurso = villa.nombre;
    pag.texto(MARGEN, y, villa.nombre, { tam: 17, negrita: true, color: COLOR.tinta });
    const cuantos = villa.eventos.length === 1 ? '1 apunte' : `${villa.eventos.length} apuntes`;
    pag.texto(A4.ancho - MARGEN - anchoTexto(cuantos, 10), y, cuantos, { tam: 10, color: COLOR.gris });
    y -= 10;
    pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 1.1, 0.78);
    y -= 20;

    for (const e of villa.eventos) {
      const hecho = HECHOS_PDF[e.tipo] || HECHOS_PDF.nota;
      const sangria = 62;
      const anchoTextoUtil = anchoUtil - sangria - 6;
      const lineas = partir(e.texto, anchoTextoUtil, 11.5);
      const lineasNota = e.nota ? partir(`«${e.nota}»`, anchoTextoUtil, 10) : [];
      const alto = 16 + lineas.length * 14 + (lineasNota.length ? lineasNota.length * 12.5 + 3 : 0) + 15;

      sitio(alto + 10);

      // La pastilla de fondo y la barra de color, como en la pantalla.
      pag.pastilla(MARGEN, y - alto + 8, anchoUtil, alto, 10, COLOR.tarjeta);
      pag.pastilla(MARGEN, y - alto + 8, 3.5, alto, 1.6, hecho.color);

      pag.texto(MARGEN + 12, y - 4, e.hora, { tam: 10, negrita: true, color: COLOR.gris });
      pag.texto(MARGEN + sangria, y - 4, hecho.rotulo, { tam: 8, negrita: true, color: hecho.color, espaciado: 1.1 });
      if (e.quien) {
        pag.texto(MARGEN + sangria + anchoTexto(hecho.rotulo, 8, true) + 12, y - 4, `· ${e.quien}`,
          { tam: 8.5, color: COLOR.gris });
      }
      let ty = y - 20;
      for (const linea of lineas) {
        pag.texto(MARGEN + sangria, ty, linea, { tam: 11.5, color: COLOR.tinta });
        ty -= 14;
      }
      for (const linea of lineasNota) {
        pag.texto(MARGEN + sangria, ty - 1, linea, { tam: 10, color: COLOR.topo });
        ty -= 12.5;
      }
      const pie = [e.oficio, e.zona].filter(Boolean).join(' · ');
      if (pie) pag.texto(MARGEN + sangria, ty - 1, pie, { tam: 8.5, color: COLOR.gris });

      y -= alto + 6;
    }
    y -= 14;
    villaEnCurso = '';
  }

  paginas.push(pag);

  // El pie, ya sabiendo cuántas páginas hay.
  paginas.forEach((p, i) => {
    p.linea(MARGEN, MARGEN - 6, A4.ancho - MARGEN, MARGEN - 6, 0.7, 0.85);
    p.texto(MARGEN, MARGEN - 20, `${promocion}  ·  ${titulo}`, { tam: 8.5, color: COLOR.gris });
    const pie = `Página ${i + 1} de ${paginas.length}`;
    p.texto(A4.ancho - MARGEN - anchoTexto(pie, 8.5), MARGEN - 20, pie, { tam: 8.5, color: COLOR.gris });
  });

  return ensamblar(paginas);
}

/** Nombre de fichero legible y sin caracteres problemáticos. */
/* ─── La hoja de reparto ──────────────────────────────────────────
   El PDF que se le pone al encargado de obra en la mano y que él corta
   y reparte a los gremios. Cada tarea con su foto GRANDE —a todo lo
   ancho del papel, que desde una lista de texto nadie encuentra el
   rodapié—, su casilla para tachar a bolígrafo, su estancia y su
   gremio. Y si se pide el histórico, las ejecutadas al final, en lista
   apretada y sin fotos: son constancia, no trabajo por hacer. */

/**
 * Ordena las tareas de un grupo por cómo se anda la casa (el orden de
 * las estancias en el catálogo), y a igual estancia la más antigua
 * primero: es la que más tiempo lleva esperando.
 */
function ordenDePaseo(tareas, porGremio) {
  const indiceZona = new Map(ZONAS.map((z, i) => [z, i]));
  const indiceOficio = new Map(OFICIOS.map((o, i) => [o.id, i]));
  return [...tareas].sort((a, b) => {
    const ia = porGremio ? (indiceZona.get(a.zona) ?? 999) : (indiceOficio.get(a.oficio) ?? 999);
    const ib = porGremio ? (indiceZona.get(b.zona) ?? 999) : (indiceOficio.get(b.oficio) ?? 999);
    if (ia !== ib) return ia - ib;
    return String(a.creado || '').localeCompare(String(b.creado || ''));
  });
}

/**
 * Genera la hoja de reparto de una vivienda.
 *
 * `fotos` es un Map tareaId → { bytes, ancho, alto } con los JPEG ya
 * recortados (ver media.jpegParaPdf): aquí solo se pegan. `filtros` es
 * la frase de qué se filtró («Aluminio · Salón»), para que el papel
 * diga qué es y qué no es. `ejecutadas` van SIEMPRE al final.
 *
 * @returns {Blob} el PDF listo para bajar o compartir
 */
export function hojaDeReparto({
  vivienda, promocion, fecha, autor,
  tareas, ejecutadas = [], fotos = new Map(),
  orden = 'oficio', filtros = '',
}) {
  const anchoUtil = A4.ancho - MARGEN * 2;
  const paginas = [];
  const imagenes = new Map();
  let pag = new Pagina();
  let y = 0;

  /* Los grupos, con el mismo criterio que la hoja de siempre; dentro,
     en orden de paseo. Con un único gremio en juego —porque se filtró—
     agrupar por gremio sería un solo bloque que no dice nada: se
     agrupa por estancia directamente. */
  let comoAgrupar = orden;
  if (orden === 'oficio' && new Set(tareas.map((t) => t.oficio || '')).size === 1 && tareas.length > 2) {
    comoAgrupar = 'estancia';
  }
  const grupos = (agrupar(tareas, comoAgrupar) || [{ titulo: '', sub: '', tareas }])
    .map((g) => ({ ...g, tareas: ordenDePaseo(g.tareas, comoAgrupar === 'oficio') }));

  const SUELO = MARGEN + 18;

  /* La cabecera grande de la primera hoja: la banda negra con el
     nombre, como la app. En las siguientes, una línea que recuerda
     dónde estás. */
  const cabecera = (primera) => {
    if (primera) {
      const altoBanda = 118;
      pag.pastilla(MARGEN - 14, A4.alto - MARGEN - altoBanda + 14, anchoUtil + 28, altoBanda, 16, COLOR.tinta);
      let yy = A4.alto - MARGEN - 12;
      pag.texto(MARGEN + 6, yy, 'UNIK WORKS', { tam: 9, negrita: true, color: [0.72, 0.7, 0.67], espaciado: 1.2 });
      yy -= 34;
      pag.texto(MARGEN + 6, yy, vivienda, { tam: 27, negrita: true, color: [1, 1, 1] });
      yy -= 19;
      pag.texto(MARGEN + 6, yy, `${promocion} · Hoja de repasos`, { tam: 11.5, color: [0.78, 0.76, 0.73] });
      yy -= 18;
      pag.texto(MARGEN + 6, yy, `${fecha}  ·  ${autor}`, { tam: 9.5, color: [0.62, 0.6, 0.57] });
      y = A4.alto - MARGEN - altoBanda - 12;

      const resumen = `${tareas.length} ${tareas.length === 1 ? 'repaso pendiente' : 'repasos pendientes'}`
        + (ejecutadas.length ? `  ·  ${ejecutadas.length} ${ejecutadas.length === 1 ? 'ejecutado' : 'ejecutados'}` : '')
        + (filtros ? `  ·  Filtrado: ${filtros}` : '');
      pag.texto(MARGEN, y - 4, resumen, { tam: 10, negrita: true, gris: 0.4 });
      y -= 26;
    } else {
      y = A4.alto - MARGEN;
      pag.texto(MARGEN, y, `${vivienda}  ·  ${promocion}  ·  ${fecha}`, { tam: 9.5, negrita: true, gris: 0.45 });
      y -= 10;
      pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.8, 0.65);
      y -= 22;
    }
  };
  cabecera(true);

  const saltar = () => {
    paginas.push(pag);
    pag = new Pagina();
    cabecera(false);
    if (grupoEnCurso) franja(grupoEnCurso, true);
  };

  let grupoEnCurso = null;
  const franja = (g, seguida = false) => {
    if (!g.titulo) return;
    const conSub = !!g.sub && !seguida;
    const alto = conSub ? 34 : 24;
    pag.pastilla(MARGEN - 8, y - alto + 13, anchoUtil + 16, alto, 6, COLOR.beige);
    pag.texto(MARGEN + 2, y, g.titulo, { tam: 13, negrita: true, color: [0.2, 0.18, 0.15] });
    if (seguida) {
      const nota = '(sigue)';
      pag.texto(A4.ancho - MARGEN - anchoTexto(nota, 9) - 2, y, nota, { tam: 9, gris: 0.45 });
    }
    if (conSub) pag.texto(MARGEN + 2, y - 12, g.sub, { tam: 9.5, color: [0.42, 0.38, 0.32] });
    y -= alto + 10;
  };

  /* Una tarea: la foto grande —13,5 × 8,5 cm en papel, centrada— y
     debajo la casilla, el número, dónde, y el texto. Con este tamaño
     caben dos tareas por página: grande para verse desde el andamio,
     sin convertir la hoja de una villa en un tomo. */
  const ALTO_FOTO = 240;
  const ANCHO_FOTO = ALTO_FOTO * (8 / 5);  // el recorte de jpegParaPdf
  const TAM = 11.5;
  const INTERLINEA = 15;

  const pintarTarea = (t, n) => {
    const conFoto = fotos.has(t.id);
    const lineas = partir(t.texto || 'Sin descripción', anchoUtil - 44, TAM);
    const altoTexto = 22 + lineas.length * INTERLINEA + 14;
    const altoTarjeta = (conFoto ? ALTO_FOTO + 10 : 0) + altoTexto;

    if (y - altoTarjeta < SUELO) saltar();

    if (conFoto) {
      const nombre = `Im${imagenes.size + 1}`;
      imagenes.set(nombre, fotos.get(t.id));
      pag.fotoRecortada(nombre, MARGEN + (anchoUtil - ANCHO_FOTO) / 2, y - ALTO_FOTO, ANCHO_FOTO, ALTO_FOTO, 10);
      y -= ALTO_FOTO + 14;
    }

    // La casilla y el número, y a la derecha el dónde y el quién.
    pag.recuadro(MARGEN, y - 11, 12, 12, 1.1, 0.25);
    pag.texto(MARGEN + 20, y - 9, `${n}.`, { tam: 13, negrita: true });
    const sitio = [t.zona, oficio(t.oficio)?.nombre].filter(Boolean).join('  ·  ');
    if (sitio) {
      pag.texto(A4.ancho - MARGEN - anchoTexto(sitio, 9.5, true), y - 9, sitio,
        { tam: 9.5, negrita: true, color: [0.42, 0.38, 0.32] });
    }
    y -= 26;
    lineas.forEach((linea, i) => {
      pag.texto(MARGEN + 20, y - i * INTERLINEA, linea, { tam: TAM });
    });
    y -= (lineas.length - 1) * INTERLINEA + 12;
    if (t.estado && t.estado !== 'pendiente' && t.estado !== 'verificada') {
      pag.texto(MARGEN + 20, y, estado(t.estado).nombre.toUpperCase(), { tam: 8, negrita: true, gris: 0.5 });
      y -= 12;
    }
    pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.5, 0.85);
    y -= 16;
  };

  let n = 0;
  grupos.forEach((g, i) => {
    grupoEnCurso = null;
    if (i > 0) y -= 4;
    if (y - 90 < SUELO) saltar();
    franja(g);
    grupoEnCurso = g;
    for (const t of g.tareas) pintarTarea(t, ++n);
  });
  grupoEnCurso = null;

  /* Las ejecutadas, SIEMPRE al final y en lista apretada: constancia
     de lo hecho, no trabajo que repartir. Lo último ejecutado arriba. */
  if (ejecutadas.length) {
    const hechas = [...ejecutadas].sort((a, b) =>
      String(b.estadoEn || b.actualizado || '').localeCompare(String(a.estadoEn || a.actualizado || '')));
    if (y - 80 < SUELO) saltar();
    y -= 6;
    pag.pastilla(MARGEN - 8, y - 24 + 13, anchoUtil + 16, 24, 6, COLOR.verdeSuave);
    pag.texto(MARGEN + 2, y, 'Ejecutadas', { tam: 13, negrita: true, color: COLOR.verde });
    y -= 34;
    for (const t of hechas) {
      const lineas = partir(t.texto || 'Sin descripción', anchoUtil - 130, 9.5);
      const altoFila = Math.max(lineas.length * 12, 12) + 9;
      if (y - altoFila < SUELO) saltar();
      // El puntito verde de «hecho»: Helvetica no trae la marca de
      // visto, y una X delante de algo terminado se lee al revés.
      pag.pastilla(MARGEN, y - 1.5, 8, 8, 2.5, COLOR.verde);
      lineas.forEach((linea, i) => pag.texto(MARGEN + 16, y - i * 12, linea, { tam: 9.5, gris: 0.25 }));
      const sitio = [t.zona, oficio(t.oficio)?.corto].filter(Boolean).join(' · ');
      if (sitio) pag.texto(A4.ancho - MARGEN - anchoTexto(sitio, 8.5), y, sitio, { tam: 8.5, gris: 0.55 });
      y -= altoFila;
    }
  }

  paginas.push(pag);
  paginas.forEach((p, i) => {
    p.texto(MARGEN, MARGEN - 16,
      `UNIK Works  ·  ${vivienda}  ·  ${tareas.length} ${tareas.length === 1 ? 'pendiente' : 'pendientes'}`,
      { tam: 8.5, gris: 0.55 });
    const num = `Página ${i + 1} de ${paginas.length}`;
    p.texto(A4.ancho - MARGEN - anchoTexto(num, 8.5), MARGEN - 16, num, { tam: 8.5, gris: 0.55 });
  });

  return ensamblar(paginas, imagenes);
}

export function nombreDeFichero(vivienda, fecha) {
  const limpio = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `repasos-${limpio(vivienda)}-${limpio(fecha)}.pdf`.toLowerCase();
}
