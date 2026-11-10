/* ═══════════════════════════════════════════════════════════════════
   pdfConstancia.js — el «Reconocimiento de repasos pendientes» en PDF

   El documento que la parte compradora firma en la notaría: lo que
   queda por repasar en su vivienda, agrupado por zonas, cómo se va a
   coordinar, y una hoja en blanco para la visita conjunta.

   Es una copia medida al milímetro del modelo que aprobó Fran, que
   estaba hecho con otra herramienta. Por eso este módulo NO se apoya
   en js/pdf.js: aquí cada línea parte por el mismo sitio y cae en el
   mismo punto que en el modelo, y eso exige su propio motor.

   Tres cosas hay que saber antes de tocar nada:

   · Las medidas están todas en GEOMETRIA y los textos en TEXTOS_FIJOS.
     Fuera de esas dos tablas no hay ni un número ni una frase suelta.
   · medirConstancia() y pdfConstancia() usan el MISMO motor. Lo que
     una dice que cabe es lo que la otra pinta.
   · No usa red (salvo cargarTipografia, que baja la letra una vez), ni
     librerías, ni nada del navegador: vale igual en un iPhone que en
     las pruebas de node.
   ═══════════════════════════════════════════════════════════════════ */

import { TIPOGRAFIA_CONSTANCIA } from './tipografiaConstancia.js';

function congelar(cosa) {
  if (cosa && typeof cosa === 'object' && !Object.isFrozen(cosa)) {
    Object.freeze(cosa);
    for (const clave of Object.keys(cosa)) congelar(cosa[clave]);
  }
  return cosa;
}

/* ───────────────────────────────────────────────────────────────────
   Las medidas del modelo, en puntos. El origen está abajo a la
   izquierda, como en todo PDF. Una «base» es la línea sobre la que se
   apoyan las letras.
   ─────────────────────────────────────────────────────────────────── */

export const GEOMETRIA = congelar({
  pagina: { ancho: 595.2756, alto: 841.8898 },
  // La caja donde corre el texto de las páginas numeradas.
  caja: { izquierda: 88, derecha: 507.2756, ancho: 419.2756, techo: 763.8898, suelo: 83.8898 },
  // «hueco» es el aire mínimo entre el rótulo de la izquierda y la fecha.
  cabecera: { cuerpo: 9, base: 802.8898, izquierda: 82, derecha: 513.2756, hueco: 12 },
  pie: { cuerpo: 9, base: 35, centro: 297.6378 },
  titulo: { cuerpo: 13, interlinea: 19, antes: 0, despues: 19, centro: 297.6378 },
  parrafo: { cuerpo: 11.5, interlinea: 17, antes: 10, despues: 10 },
  epigrafe: { cuerpo: 11.5, interlinea: 17, antes: 10, despues: 13 },
  // Cuánto se deja estrechar cada espacio antes de pasar una palabra a la
  // línea siguiente, y la holgura de las cuentas con decimales.
  corte: { tolerancia: 0.05, holgura: 1e-6 },
  // La hoja de repasos del final.
  hoja: {
    techo: 763.8898,
    suelo: 36,
    titulo: { cuerpo: 13, centro: 297.6378, bases: [750.8898, 731.8898] },
    datos: {
      techo: 706.8898, izquierda: 88, derecha: 507.2756, columna: 188,
      filas: [25, 34, 29], cuerpo: 10.5, interlinea: 14,
      xEtiqueta: 97, xValor: 197, anchoValor: 301.2756, relleno: 3,
    },
    explicacion: { cuerpo: 10.5, interlinea: 14, x: 88, base: 594.3898, ancho: 419.2756, lineas: 3 },
    ejemplo: { cuerpo: 9.5, x: 88.6, base: 540.8898, cizalla: 0.2 },
    repasos: {
      techo: 531.8898, izquierda: 88, derecha: 507.2756,
      cabecera: 26, fila: 32, filas: 12, filasMinimas: 3, columnas: [117, 222],
      numero: { cuerpo: 9.5, x: 95, base: 515.8898 },
      estancia: { cuerpo: 10.5, x: 124, base: 515.3898 },
      descripcion: { cuerpo: 10.5, x: 229, base: 515.3898 },
      cifras: { cuerpo: 10, centro: 102.5, base: 485.8898 },
    },
    nota: { cuerpo: 9.5, interlinea: 13, x: 88, ancho: 419.2756, separacion: 12 },
    filete: { grosor: 0.5 },
  },
});

/* ───────────────────────────────────────────────────────────────────
   Los textos, letra a letra los del modelo aprobado. Lo que va entre
   llaves se rellena con los datos de la vivienda.
   ─────────────────────────────────────────────────────────────────── */

export const TEXTOS_FIJOS = congelar({
  titulo1: 'RECONOCIMIENTO DE REPASOS PENDIENTES',
  titulo2: 'VIVIENDA {vivienda}',
  // El título que guarda el fichero por dentro (el que enseña el lector de PDF).
  tituloInfo: 'Vivienda {vivienda} · Reconocimiento de repasos pendientes · {fecha}',
  cabecera: 'VIVIENDA {vivienda} · {promocion}',
  cabeceraSinPromocion: 'VIVIENDA {vivienda}',
  // Lo que se pone al final del rótulo de la cabecera cuando hay que cortarlo.
  recorte: '…',
  pie: '{pagina} de {paginas}',
  intro: 'En el marco del proceso de entrega de la vivienda, se deja constancia de las actuaciones de terminación, ajuste y repaso pendientes. La finalidad de este documento es facilitar a la parte compradora una información clara y transparente sobre su estado y sobre la coordinación prevista para completar estos trabajos.',
  referencia: 'La relación toma como referencia el registro de seguimiento de {fecha} y agrupa las actuaciones pendientes por zonas.',
  primero: 'PRIMERO. ACTUACIONES PENDIENTES',
  apartados: [
    {
      epigrafe: 'SEGUNDO. COORDINACIÓN Y SEGUIMIENTO',
      parrafos: [
        'Durante los próximos días iremos completando las actuaciones recogidas en este documento, en coordinación con el equipo técnico de obra.',
        'Una vez finalizados estos trabajos, les entregaremos la hoja de repasos y Ezequiel coordinará con ustedes una visita conjunta a la vivienda con los arquitectos y el equipo técnico de obra. En esa visita comprobaremos que las actuaciones previstas se han realizado y recogeremos en la hoja cualquier repaso adicional que se observe, para coordinar su revisión y subsanación.',
        'Para evitar duplicar gestiones, la hoja se cumplimentará durante esa visita posterior. Si lo desean, pueden ir anotando sus observaciones para revisarlas conjuntamente en ese momento. Ezequiel conservará copia del documento para su seguimiento.',
      ],
    },
    {
      epigrafe: 'TERCERO. PISCINA: PUESTA EN MARCHA Y MANTENIMIENTO',
      parrafos: [
        'En caso de que su vivienda disponga de piscina, la puesta en marcha se realizará conjuntamente con PISCINAS ZURITA, el instalador autorizado responsable de su instalación, que les explicará su funcionamiento y las pautas básicas de uso y cuidado.',
        'Como cortesía, disfrutarán de un mes de mantenimiento a cargo de PISCINAS ZURITA desde la puesta en marcha, para acompañarles durante las primeras semanas y facilitar que se familiaricen con su funcionamiento.',
      ],
    },
    {
      epigrafe: 'CUARTO. ALTA DE LOS SUMINISTROS DE AGUA Y ELECTRICIDAD',
      parrafos: [
        'Tras la firma de la compraventa, se solicitará al instalador la documentación correspondiente a su vivienda necesaria para tramitar el alta de los suministros de agua y electricidad a su nombre.',
        'La gestión se coordinará con el equipo de comercialización, que les remitirá esta documentación y las indicaciones para que puedan tramitar las altas lo antes posible.',
      ],
    },
  ],
  hoja: {
    titulo1: 'HOJA DE REPASOS',
    titulo2: 'VISITA CONJUNTA A LA VIVIENDA',
    vivienda: 'Vivienda',
    compradores: 'Compradores',
    fechaFirma: 'Fecha de firma',
    huecoFecha: '________ / ________ / ______________',
    explicacion: 'Esta hoja se cumplimentará en la visita conjunta posterior a la finalización de los trabajos ya comunicados. La visita será coordinada por Ezequiel con ustedes y el equipo técnico de obra.',
    ejemplo: 'Ejemplo: estancia: dormitorio; descripción: el interruptor no funciona.',
    numero: 'N.º',
    estancia: 'Estancia',
    descripcion: 'Descripción de la tarea',
    nota: 'Ezequiel conservará copia de esta hoja para coordinar el seguimiento y la subsanación de los repasos anotados.',
  },
});

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ───────────────────────────────────────────────────────────────────
   Limpieza del texto que viene de fuera

   El PDF escribe con un byte por letra (la tabla WinAnsi, la de Windows
   para Europa occidental). Todo lo que llega —nombres, zonas, lo que
   redacta la IA— se pasa a esa tabla: lo que tiene equivalente se
   cambia por él, lo que no (un emoji) se quita sin dejar hueco raro.
   ─────────────────────────────────────────────────────────────────── */

// Los 27 caracteres de WinAnsi que no están en su sitio de Unicode.
const ALTOS = {
  0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134,
  0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140,
  0x017D: 142, 0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149,
  0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155,
  0x0153: 156, 0x017E: 158, 0x0178: 159,
};

// Parecidos razonables para lo que no está en la tabla.
const EQUIVALENCIAS = {
  0x2032: "'", 0x2033: '"', 0x02BC: "'", 0x02B9: "'",
  0x2010: '-', 0x2011: '-', 0x2012: '-', 0x2212: '-', 0x2043: '-',
  0x2015: '—', 0x2044: '/', 0x2215: '/', 0x2236: ':',
  0x03BC: 'µ', 0x039C: 'M', 0x0191: 'F',
  0x2264: '<=', 0x2265: '>=', 0x2260: '!=', 0x2248: '~',
  0x2192: '->', 0x2190: '<-', 0x21D2: '=>',
  0x0142: 'l', 0x0141: 'L', 0x0131: 'i', 0x0111: 'd', 0x0110: 'Ð',
  0x2713: 'x', 0x2714: 'x', 0x25CF: '•', 0x25E6: '•', 0x2023: '•',
  0x25AA: '•', 0x2219: '·', 0x22C5: '·',
};

// Marca provisional de «aquí había algo que no se puede escribir».
const CENTINELA = '\uE000';
const CIERRES = '.,;:!?)]»';
const APERTURAS = '([«¿¡';

function codigoWinAnsi(punto) {
  if (punto >= 32 && punto <= 126) return punto;
  if (punto >= 161 && punto <= 255 && punto !== 173) return punto;
  return ALTOS[punto] || 0;
}

function esBlanco(punto) {
  return (punto >= 9 && punto <= 13) || punto === 32 || punto === 0x85 || punto === 0xA0
    || punto === 0x1680 || (punto >= 0x2000 && punto <= 0x200A) || punto === 0x2028
    || punto === 0x2029 || punto === 0x202F || punto === 0x205F || punto === 0x3000;
}

function esInvisible(punto) {
  return punto < 32 || (punto >= 127 && punto <= 159) || punto === 0xAD
    || (punto >= 0x0300 && punto <= 0x036F) || (punto >= 0x200B && punto <= 0x200F)
    || (punto >= 0x202A && punto <= 0x202E) || (punto >= 0x2060 && punto <= 0x2064)
    || punto === 0xFEFF || (punto >= 0xFE00 && punto <= 0xFE0F)
    || (punto >= 0xE0000 && punto <= 0xE007F) || (punto >= 0xE0100 && punto <= 0xE01EF);
}

// Letra o cifra (lo que forma palabras), frente a signos y espacios.
function esDePalabra(letra) {
  return (letra >= '0' && letra <= '9') || letra.toLowerCase() !== letra.toUpperCase();
}

function cabeEnWinAnsi(texto) {
  for (const letra of texto) {
    if (!codigoWinAnsi(letra.codePointAt(0))) return false;
  }
  return true;
}

// Una letra con adornos que la tabla no tiene («ń», «ﬁ», «①») → sin ellos.
function descomponer(letra) {
  let suelta = '';
  try { suelta = letra.normalize('NFKD'); } catch { return ''; }
  suelta = suelta.replace(/[\u0300-\u036F]/g, '');
  if (!suelta.trim() || !cabeEnWinAnsi(suelta)) return '';
  return suelta;
}

function limpiar(valor) {
  // Solo se escriben cadenas y números: de una lista o de un objeto
  // saldría un «[object Object]» en un papel que se firma.
  if (typeof valor !== 'string' && !(typeof valor === 'number' && Number.isFinite(valor))) return '';
  let texto = String(valor);
  try { texto = texto.normalize('NFC'); } catch { /* se queda como está */ }
  let limpio = '';
  for (const letra of texto) {
    const punto = letra.codePointAt(0);
    if (esBlanco(punto)) limpio += ' ';
    else if (codigoWinAnsi(punto)) limpio += letra;
    else if (esInvisible(punto)) continue;
    else if (EQUIVALENCIAS[punto]) limpio += EQUIVALENCIAS[punto];
    else limpio += descomponer(letra) || CENTINELA;
  }
  // Donde había algo imposible de escribir no se deja ni doble espacio ni
  // un espacio colgando delante de una coma.
  limpio = limpio.replace(/( *)\uE000(?:[ \uE000]*\uE000)?( *)/g, (todo, antes, despues, lugar, entero) => {
    const previo = entero[lugar - 1];
    const siguiente = entero[lugar + todo.length];
    if (previo === undefined || siguiente === undefined) return '';
    if (CIERRES.indexOf(siguiente) >= 0 || APERTURAS.indexOf(previo) >= 0) return '';
    if (antes || despues) return ' ';
    // Pegado por los dos lados: dos palabras no se funden en una.
    return esDePalabra(previo) && esDePalabra(siguiente) ? ' ' : '';
  });
  return limpio.replace(/ +/g, ' ').trim();
}

function enMayusculas(valor) {
  return limpiar(limpiar(valor).toUpperCase());
}

function rellenar(plantilla, datos) {
  const relleno = String(plantilla === null || plantilla === undefined ? '' : plantilla)
    .replace(/\{(\w+)\}/g, (todo, clave) => (
      Object.prototype.hasOwnProperty.call(datos, clave) ? String(datos[clave]) : todo
    ));
  return limpiar(relleno);
}

/* ───────────────────────────────────────────────────────────────────
   Medir y partir en líneas

   Se cuenta en las unidades de la fuente (2048 por cuadratín), que son
   enteras: así no hay decimales que hagan saltar una palabra de línea.
   La regla de corte es la de la herramienta con que se hizo el modelo:
   una palabra entra si, estrechando cada espacio de la línea hasta un
   5 %, cabe.
   ─────────────────────────────────────────────────────────────────── */

const ANCHOS = TIPOGRAFIA_CONSTANCIA.anchos;
const EM = TIPOGRAFIA_CONSTANCIA.unidadesPorEm;
const PRIMER_CODIGO = TIPOGRAFIA_CONSTANCIA.primerCodigo;
const ESPACIO = ANCHOS[32 - PRIMER_CODIGO];

function unidadesDe(texto) {
  let total = 0;
  for (const letra of texto) {
    total += ANCHOS[codigoWinAnsi(letra.codePointAt(0)) - PRIMER_CODIGO] || 0;
  }
  return total;
}

function anchoDe(texto, cuerpo) {
  return unidadesDe(texto) * cuerpo / EM;
}

// Una palabra más ancha que la caja se trocea letra a letra.
function trocear(palabra, ocupado, maximo) {
  const trozos = [];
  let trozo = '';
  let ancho = ocupado;
  for (const letra of palabra) {
    const anchoLetra = unidadesDe(letra);
    let nuevo = ancho + anchoLetra;
    if (nuevo > maximo && (trozo || anchoLetra <= maximo)) {
      trozos.push(trozo);
      trozo = '';
      nuevo = anchoLetra;
    }
    trozo += letra;
    ancho = nuevo;
  }
  trozos.push(trozo);
  return trozos;
}

// → [ { texto, unidades, espacios } ], una entrada por línea. «cede» dice si
// los espacios pueden estrecharse una pizca para que entre una palabra más:
// vale para lo que luego se ajusta a su caja, no para lo que se escribe tal
// cual, que así nunca pasa de su ancho.
function partir(texto, cuerpo, ancho, cede = true) {
  const palabras = limpiar(texto).split(' ').filter(Boolean);
  const maximo = ancho * EM / cuerpo;
  const cesion = cede ? GEOMETRIA.corte.tolerancia * ESPACIO : 0;
  const lineas = [];
  let linea = [];
  let anchoLinea = -ESPACIO;

  const anotar = (trozos) => {
    const escrito = trozos.join(' ');
    lineas.push({ texto: escrito, unidades: unidadesDe(escrito), espacios: trozos.length - 1 });
  };
  const cerrar = () => {
    if (linea.length) anotar(linea);
    linea = [];
    anchoLinea = -ESPACIO;
  };

  for (const palabra of palabras) {
    const anchoPalabra = unidadesDe(palabra);
    const nuevo = anchoLinea + ESPACIO + anchoPalabra;
    const limite = maximo + cesion * linea.length;
    if (nuevo <= limite) {
      linea.push(palabra);
      anchoLinea = nuevo;
      continue;
    }
    if (anchoPalabra > maximo) {
      const trozos = trocear(palabra, anchoLinea + ESPACIO, maximo);
      const ultimo = trozos.length > 1 ? trozos.pop() : '';
      const primero = trozos.shift();
      if (primero) linea.push(primero);
      cerrar();
      for (const trozo of trozos) if (trozo) anotar([trozo]);
      if (ultimo) {
        linea = [ultimo];
        anchoLinea = unidadesDe(ultimo);
      }
      continue;
    }
    if (linea.length === 0) {
      linea.push(palabra);
      anchoLinea = nuevo;
      continue;
    }
    cerrar();
    linea = [palabra];
    anchoLinea = anchoPalabra;
  }
  cerrar();
  return lineas;
}

/* ───────────────────────────────────────────────────────────────────
   Los datos de la vivienda, ya limpios
   ─────────────────────────────────────────────────────────────────── */

function esObjetoLlano(cosa) {
  return !!cosa && typeof cosa === 'object' && !Array.isArray(cosa);
}

// Los textos de la casa con lo que se quiera cambiar (solo para pruebas).
function mezclarTextos(cambios) {
  const textos = { ...TEXTOS_FIJOS };
  if (esObjetoLlano(cambios)) {
    for (const clave of Object.keys(cambios)) {
      const nuevo = cambios[clave];
      if (nuevo === undefined || nuevo === null) continue;
      if (esObjetoLlano(nuevo) && esObjetoLlano(TEXTOS_FIJOS[clave])) {
        textos[clave] = { ...TEXTOS_FIJOS[clave], ...nuevo };
      } else {
        textos[clave] = nuevo;
      }
    }
  }
  if (!Array.isArray(textos.apartados)) textos.apartados = TEXTOS_FIJOS.apartados;
  if (!esObjetoLlano(textos.hoja)) textos.hoja = TEXTOS_FIJOS.hoja;
  return textos;
}

// '2026-11-09' → { corta: '2026-11-09', larga: '9 de noviembre de 2026' }.
// Sin Date de por medio: así no hay husos horarios que muevan el día.
function leerFecha(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec((typeof valor === 'string' ? valor : '').trim());
  if (!partes) return null;
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1) return null;
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dia > dias[mes - 1]) return null;
  return {
    corta: `${partes[1]}-${partes[2]}-${partes[3]}`,
    larga: `${dia} de ${MESES[mes - 1]} de ${anio}`,
  };
}

// Cada zona, en un solo párrafo: «Cocina y lavadero. Ajuste de…».
function parrafoDeZona(zona) {
  if (typeof zona === 'string' || typeof zona === 'number') return limpiar(zona);
  if (!esObjetoLlano(zona)) return '';
  const titulo = limpiar(zona.titulo).replace(/[.:;,\s]+$/, '');
  const texto = limpiar(zona.texto);
  if (titulo && texto) return `${titulo}. ${texto}`;
  if (titulo) return `${titulo}.`;
  return texto;
}

function leerDatos(doc) {
  const origen = esObjetoLlano(doc) ? doc : {};
  const fecha = leerFecha(origen.fecha);
  const zonas = (Array.isArray(origen.zonas) ? origen.zonas : []).map(parrafoDeZona).filter(Boolean);
  return {
    // «07» y «7» son la misma vivienda: sin ceros delante.
    vivienda: limpiar(origen.vivienda).replace(/^0+(?=\d)/, ''),
    promocion: enMayusculas(origen.promocion),
    fecha,
    fechaLarga: fecha ? fecha.larga : '',
    compradores: limpiar(origen.compradores),
    zonas,
    realizadas: limpiar(origen.realizadas),
  };
}

/* ───────────────────────────────────────────────────────────────────
   El flujo: qué cae en cada página

   Cada trozo de texto es un «bloque» con su letra, su interlínea y el
   aire que pide por arriba y por abajo. Entre dos bloques se deja el
   mayor de los dos aires, no la suma. Un párrafo que no cabe se parte
   entre páginas, pero nunca deja una sola línea al pie; un título o un
   epígrafe pasan enteros.
   ─────────────────────────────────────────────────────────────────── */

function bloqueDe(tipo, texto, estilo, alineacion, extras) {
  return {
    tipo,
    lineas: partir(texto, estilo.cuerpo, GEOMETRIA.caja.ancho),
    cuerpo: estilo.cuerpo,
    interlinea: estilo.interlinea,
    antes: estilo.antes,
    despues: estilo.despues,
    alineacion,
    partible: tipo === 'parrafo',
    ...extras,
  };
}

// La primera página: título, presentación, referencia y las zonas.
function bloquesDeZonas(datos, textos) {
  const relleno = {
    vivienda: enMayusculas(datos.vivienda),
    promocion: datos.promocion,
    fecha: datos.fechaLarga,
  };
  const bloques = [];
  const titulo = bloqueDe('titulo', '', GEOMETRIA.titulo, 'centro');
  for (const clave of ['titulo1', 'titulo2']) {
    const lineas = partir(rellenar(textos[clave], relleno), GEOMETRIA.titulo.cuerpo, GEOMETRIA.caja.ancho);
    for (const linea of lineas) titulo.lineas.push(linea);
  }
  bloques.push(titulo);
  bloques.push(bloqueDe('parrafo', rellenar(textos.intro, relleno), GEOMETRIA.parrafo, 'justo'));
  let referencia = rellenar(textos.referencia, relleno);
  if (datos.realizadas) referencia = `${referencia} ${datos.realizadas}`;
  bloques.push(bloqueDe('parrafo', referencia, GEOMETRIA.parrafo, 'justo'));
  bloques.push(bloqueDe('epigrafe', rellenar(textos.primero, relleno), GEOMETRIA.epigrafe, 'izquierda', { primero: true }));
  for (const zona of datos.zonas) {
    bloques.push(bloqueDe('parrafo', zona, GEOMETRIA.parrafo, 'justo', { zona: true }));
  }
  return bloques;
}

// La página fija: coordinación, piscina y suministros.
function bloquesDeApartados(datos, textos) {
  const relleno = {
    vivienda: enMayusculas(datos.vivienda),
    promocion: datos.promocion,
    fecha: datos.fechaLarga,
  };
  const bloques = [];
  for (const apartado of textos.apartados) {
    if (!esObjetoLlano(apartado)) continue;
    bloques.push(bloqueDe('epigrafe', rellenar(apartado.epigrafe, relleno), GEOMETRIA.epigrafe, 'izquierda'));
    const parrafos = Array.isArray(apartado.parrafos) ? apartado.parrafos : [];
    for (const parrafo of parrafos) {
      bloques.push(bloqueDe('parrafo', rellenar(parrafo, relleno), GEOMETRIA.parrafo, 'justo'));
    }
  }
  return bloques;
}

// → una lista por página con lo colocado: { bloque, lineas, techo, entera }.
// «entera» dice que el párrafo sigue en la página siguiente, y por eso su
// última línea de aquí también va justificada.
function fluir(bloques) {
  const { techo, suelo } = GEOMETRIA.caja;
  const holgura = GEOMETRIA.corte.holgura;
  const utiles = bloques.filter((bloque) => bloque.lineas.length > 0);
  const paginas = [[]];
  let y = techo;
  let arriba = true;
  let aireAnterior = 0;

  const pasarPagina = () => {
    paginas.push([]);
    y = techo;
    arriba = true;
    aireAnterior = 0;
  };
  const colocar = (bloque, lineas, inicio, entera) => {
    paginas[paginas.length - 1].push({ bloque, lineas, techo: inicio, entera });
    y = inicio - lineas.length * bloque.interlinea;
    arriba = false;
    aireAnterior = bloque.despues;
  };

  for (let i = 0; i < utiles.length; i++) {
    const bloque = utiles[i];
    let lineas = bloque.lineas;
    let resto = false;
    while (lineas.length) {
      const aire = arriba ? 0 : Math.max(aireAnterior, resto ? 0 : bloque.antes);
      const inicio = y - aire;
      const libre = inicio - suelo;
      const alto = lineas.length * bloque.interlinea;
      // Un epígrafe no se queda solo al pie: detrás tienen que caber al
      // menos dos líneas de lo que encabeza.
      let compania = 0;
      const siguiente = utiles[i + 1];
      if (bloque.tipo === 'epigrafe' && siguiente && !arriba) {
        compania = Math.max(bloque.despues, siguiente.antes)
          + Math.min(2, siguiente.lineas.length) * siguiente.interlinea;
      }
      if (alto + compania <= libre + holgura) {
        colocar(bloque, lineas, inicio, false);
        break;
      }
      if (arriba && alto <= libre + holgura) {
        colocar(bloque, lineas, inicio, false);
        break;
      }
      let caben = Math.floor((libre + holgura) / bloque.interlinea);
      if (arriba) caben = Math.max(1, caben);
      else if (!bloque.partible || caben <= 1) caben = 0;
      if (caben === 0) {
        pasarPagina();
        continue;
      }
      colocar(bloque, lineas.slice(0, caben), inicio, true);
      lineas = lineas.slice(caben);
      resto = true;
      pasarPagina();
    }
  }
  return paginas;
}

const TOPE_DE_SOBRAN = 200;

// La parte que cambia de una vivienda a otra, ya repartida en páginas, y
// las cuentas de si cabe en una sola.
function componerZonas(datos, textos) {
  const { suelo } = GEOMETRIA.caja;
  const { interlinea, antes } = GEOMETRIA.parrafo;
  const bloques = bloquesDeZonas(datos, textos);
  const paginas = fluir(bloques);
  const zonas = bloques.filter((bloque) => bloque.zona && bloque.lineas.length > 0);
  let lineasZonas = 0;
  for (const zona of zonas) lineasZonas += zona.lineas.length;

  // Dónde arranca (o arrancaría) la primera zona en la página 1.
  let techoZonas = null;
  for (const puesto of paginas[0]) {
    if (puesto.bloque.zona) {
      techoZonas = puesto.techo;
      break;
    }
    if (puesto.bloque.primero && zonas.length === 0 && !puesto.entera) {
      techoZonas = puesto.techo - puesto.lineas.length * puesto.bloque.interlinea
        - Math.max(puesto.bloque.despues, antes);
    }
  }
  let lineasCaben = 0;
  if (techoZonas !== null) {
    const alto = techoZonas - suelo - antes * Math.max(zonas.length - 1, 0);
    lineasCaben = Math.max(0, Math.floor((alto + GEOMETRIA.corte.holgura) / interlinea));
  }
  const cabe = paginas.length === 1;
  // «sobran» son las líneas que hay que QUITAR de las zonas para que todo
  // quepa en la página 1: es lo que se le pide a la IA cuando ajusta. No es
  // lo mismo que las líneas que se ven en la página siguiente: un párrafo no
  // deja una línea suelta al pie (bajan más) y el aire entre las zonas que
  // bajan ya no se gasta en la primera (bajan menos). Nunca más de 200, que
  // es lo más que admite el servidor al ajustar, y nunca 0 si no cabe.
  let sobran = Math.min(TOPE_DE_SOBRAN, Math.max(0, lineasZonas - lineasCaben));
  if (cabe) sobran = 0;
  else if (sobran < 1) sobran = 1;
  return { paginas, lineasZonas, lineasCaben, cabe, sobran };
}

/* ───────────────────────────────────────────────────────────────────
   De lo colocado a lo que se pinta

   Cada página acaba siendo una lista de órdenes sencillas: un texto en
   un punto, o un puñado de filetes.
   ─────────────────────────────────────────────────────────────────── */

function texto(ordenes, x, y, cuerpo, escrito, extras) {
  if (!escrito) return;
  ordenes.push({ tipo: 'texto', x, y, cuerpo, texto: escrito, tw: 0, cizalla: 0, ...extras });
}

function pintarColocado(ordenes, colocado) {
  const { izquierda, ancho } = GEOMETRIA.caja;
  for (const puesto of colocado) {
    const bloque = puesto.bloque;
    puesto.lineas.forEach((linea, i) => {
      const y = puesto.techo - bloque.cuerpo - i * bloque.interlinea;
      const natural = linea.unidades * bloque.cuerpo / EM;
      const sobra = ancho - natural;
      let x = izquierda;
      let tw = 0;
      if (bloque.alineacion === 'centro') {
        x = izquierda + sobra / 2;
      } else if (bloque.alineacion === 'justo' && linea.espacios > 0) {
        const ultima = i === puesto.lineas.length - 1 && !puesto.entera;
        // La última línea de un párrafo va a la izquierda, salvo que se
        // pase un pelo de la caja: entonces se aprieta como las demás.
        if (ultima ? sobra < -1e-8 : Math.abs(sobra) > 1e-8) tw = sobra / linea.espacios;
      }
      texto(ordenes, x, y, bloque.cuerpo, linea.texto, { tw });
    });
  }
}

// Un texto de una sola línea que no puede pasar de «maximo» (en unidades
// de la fuente): si pasa, se corta por el final y se le pone la marca, sin
// dejar un espacio ni un signo colgando delante de ella.
function recortar(escrito, maximo, marca) {
  if (unidadesDe(escrito) <= maximo) return escrito;
  const cola = unidadesDe(marca) <= maximo ? marca : '';
  const tope = maximo - unidadesDe(cola);
  let cabe = '';
  let ancho = 0;
  for (const letra of escrito) {
    ancho += unidadesDe(letra);
    if (ancho > tope) break;
    cabe += letra;
  }
  let fin = cabe.length;
  while (fin > 0 && !esDePalabra(cabe[fin - 1])) fin -= 1;
  return cabe.slice(0, fin) + cola;
}

// El rótulo de la izquierda de la cabecera, el mismo en todas las páginas.
// Se mide: si una promoción (o una vivienda) de nombre muy largo llegara
// hasta la fecha, se corta por el final —el lado de la promoción— dejando
// el hueco de la casa. La fecha no se mueve ni se corta nunca.
function textoCabecera(datos, textos) {
  const { cuerpo, izquierda, derecha, hueco } = GEOMETRIA.cabecera;
  const relleno = { vivienda: enMayusculas(datos.vivienda), promocion: datos.promocion, fecha: datos.fechaLarga };
  const entero = rellenar(datos.promocion ? textos.cabecera : textos.cabeceraSinPromocion, relleno);
  let sitio = derecha - izquierda;
  if (datos.fechaLarga) sitio -= anchoDe(datos.fechaLarga, cuerpo) + hueco;
  return recortar(entero, sitio * EM / cuerpo, rellenar(textos.recorte, {}));
}

// Una página numerada: cabecera, fecha a la derecha, pie y el texto.
function paginaNumerada(colocado, numero, total, datos, textos) {
  const { cabecera, pie } = GEOMETRIA;
  const ordenes = [];
  texto(ordenes, cabecera.izquierda, cabecera.base, cabecera.cuerpo, textoCabecera(datos, textos));
  texto(ordenes, cabecera.derecha - anchoDe(datos.fechaLarga, cabecera.cuerpo), cabecera.base, cabecera.cuerpo, datos.fechaLarga);
  const cuenta = rellenar(textos.pie, { pagina: numero, paginas: total });
  texto(ordenes, pie.centro - anchoDe(cuenta, pie.cuerpo) / 2, pie.base, pie.cuerpo, cuenta);
  pintarColocado(ordenes, colocado);
  return ordenes;
}

/* ───────────────────────────────────────────────────────────────────
   La hoja de repasos del final

   No lleva fecha en la cabecera ni número de página. La casilla de los
   compradores crece si hace falta: nunca se corta un nombre ni se
   encoge la letra, y lo que hay debajo baja lo que ella crezca.
   ─────────────────────────────────────────────────────────────────── */

function filetes(ordenes, lineas) {
  if (lineas.length) ordenes.push({ tipo: 'trazos', lineas });
}

// La tabla de arriba: vivienda, compradores y fecha de firma.
// Devuelve cuánto ha crecido respecto al modelo.
function pintarDatosDeHoja(ordenes, datos, textos) {
  const medidas = GEOMETRIA.hoja.datos;
  const rotulos = textos.hoja;
  const filas = [
    { etiqueta: rotulos.vivienda, valor: datos.vivienda },
    { etiqueta: rotulos.compradores, valor: datos.compradores },
    { etiqueta: rotulos.fechaFirma, valor: rellenar(rotulos.huecoFecha, {}) },
  ];
  const rayas = [];
  let techo = medidas.techo;
  let crecido = 0;
  filas.forEach((fila, i) => {
    const lineas = partir(fila.valor, medidas.cuerpo, medidas.anchoValor, false);
    const cuantas = Math.max(1, lineas.length);
    const alto = Math.max(medidas.filas[i], medidas.interlinea * cuantas + 2 * medidas.relleno);
    const centro = techo - alto / 2;
    // Etiqueta y valor van centrados en vertical dentro de su casilla.
    texto(ordenes, medidas.xEtiqueta, centro + medidas.interlinea / 2 - medidas.cuerpo,
      medidas.cuerpo, rellenar(fila.etiqueta, {}));
    const techoValor = centro + medidas.interlinea * cuantas / 2;
    lineas.forEach((linea, n) => {
      texto(ordenes, medidas.xValor, techoValor - medidas.cuerpo - medidas.interlinea * n,
        medidas.cuerpo, linea.texto);
    });
    crecido += alto - medidas.filas[i];
    techo -= alto;
    if (i < filas.length - 1) rayas.push([medidas.izquierda, techo, medidas.derecha, techo]);
  });
  const fondo = techo;
  filetes(ordenes, [
    [medidas.izquierda, medidas.techo, medidas.derecha, medidas.techo],
    [medidas.izquierda, fondo, medidas.derecha, fondo],
    [medidas.izquierda, fondo, medidas.izquierda, medidas.techo],
    [medidas.derecha, fondo, medidas.derecha, medidas.techo],
    ...rayas,
    [medidas.columna, fondo, medidas.columna, medidas.techo],
  ]);
  return crecido;
}

// Lo que va debajo: explicación, ejemplo, la tabla en blanco y la nota.
// «bajada» es cuánto se desplaza todo hacia abajo respecto al modelo.
function pintarRepasosDeHoja(ordenes, textos, bajada, filas) {
  const hoja = GEOMETRIA.hoja;
  const rotulos = textos.hoja;
  const explicacion = partir(rellenar(rotulos.explicacion, {}), hoja.explicacion.cuerpo, hoja.explicacion.ancho);
  explicacion.forEach((linea, i) => {
    texto(ordenes, hoja.explicacion.x, hoja.explicacion.base - bajada - hoja.explicacion.interlinea * i,
      hoja.explicacion.cuerpo, linea.texto);
  });
  // Si la explicación cambiara de tamaño, lo de debajo se mueve con ella.
  const baja = bajada + hoja.explicacion.interlinea * (Math.max(1, explicacion.length) - hoja.explicacion.lineas);
  texto(ordenes, hoja.ejemplo.x, hoja.ejemplo.base - baja, hoja.ejemplo.cuerpo,
    rellenar(rotulos.ejemplo, {}), { cizalla: hoja.ejemplo.cizalla });

  const tabla = hoja.repasos;
  texto(ordenes, tabla.numero.x, tabla.numero.base - baja, tabla.numero.cuerpo, rellenar(rotulos.numero, {}));
  texto(ordenes, tabla.estancia.x, tabla.estancia.base - baja, tabla.estancia.cuerpo, rellenar(rotulos.estancia, {}));
  texto(ordenes, tabla.descripcion.x, tabla.descripcion.base - baja, tabla.descripcion.cuerpo, rellenar(rotulos.descripcion, {}));
  for (let i = 0; i < filas; i++) {
    const cifra = String(i + 1);
    texto(ordenes, tabla.cifras.centro - anchoDe(cifra, tabla.cifras.cuerpo) / 2,
      tabla.cifras.base - baja - tabla.fila * i, tabla.cifras.cuerpo, cifra);
  }
  const techo = tabla.techo - baja;
  const fondo = techo - tabla.cabecera - tabla.fila * filas;
  const rayas = [];
  for (let i = 0; i < filas; i++) {
    const y = techo - tabla.cabecera - tabla.fila * i;
    rayas.push([tabla.izquierda, y, tabla.derecha, y]);
  }
  filetes(ordenes, [
    [tabla.izquierda, techo, tabla.derecha, techo],
    [tabla.izquierda, fondo, tabla.derecha, fondo],
    [tabla.izquierda, fondo, tabla.izquierda, techo],
    [tabla.derecha, fondo, tabla.derecha, techo],
    ...rayas,
    ...tabla.columnas.map((x) => [x, fondo, x, techo]),
  ]);

  const nota = partir(rellenar(rotulos.nota, {}), hoja.nota.cuerpo, hoja.nota.ancho);
  nota.forEach((linea, i) => {
    texto(ordenes, hoja.nota.x, fondo - hoja.nota.separacion - hoja.nota.cuerpo - hoja.nota.interlinea * i,
      hoja.nota.cuerpo, linea.texto);
  });
}

// Dónde queda la última línea de la nota con ese número de filas.
function fondoDeHoja(textos, bajada, filas) {
  const hoja = GEOMETRIA.hoja;
  const explicacion = partir(rellenar(textos.hoja.explicacion, {}), hoja.explicacion.cuerpo, hoja.explicacion.ancho);
  const nota = partir(rellenar(textos.hoja.nota, {}), hoja.nota.cuerpo, hoja.nota.ancho);
  const baja = bajada + hoja.explicacion.interlinea * (Math.max(1, explicacion.length) - hoja.explicacion.lineas);
  const fondo = hoja.repasos.techo - baja - hoja.repasos.cabecera - hoja.repasos.fila * filas;
  return fondo - hoja.nota.separacion - hoja.nota.cuerpo - hoja.nota.interlinea * Math.max(0, nota.length - 1);
}

// → { paginas, cabe }: las páginas de la hoja (casi siempre una sola) y si
// la tabla de datos entra en la suya.
function componerHoja(datos, textos) {
  const hoja = GEOMETRIA.hoja;
  const cabecera = GEOMETRIA.cabecera;
  const relleno = { vivienda: enMayusculas(datos.vivienda), promocion: datos.promocion, fecha: datos.fechaLarga };
  const nueva = () => {
    const ordenes = [];
    texto(ordenes, cabecera.izquierda, cabecera.base, cabecera.cuerpo, textoCabecera(datos, textos));
    return ordenes;
  };

  const primera = nueva();
  [textos.hoja.titulo1, textos.hoja.titulo2].forEach((titulo, i) => {
    const escrito = rellenar(titulo, relleno);
    texto(primera, hoja.titulo.centro - anchoDe(escrito, hoja.titulo.cuerpo) / 2, hoja.titulo.bases[i],
      hoja.titulo.cuerpo, escrito);
  });
  const crecido = pintarDatosDeHoja(primera, datos, textos);
  let fondoDatos = hoja.datos.techo - crecido;
  for (const fila of hoja.datos.filas) fondoDatos -= fila;
  const cabe = fondoDatos >= hoja.suelo;

  // Si los compradores ocupan mucho, se sacrifican filas en blanco del
  // final; y si ni así, la tabla en blanco pasa entera a otra página.
  let filas = hoja.repasos.filas;
  while (filas > hoja.repasos.filasMinimas && fondoDeHoja(textos, crecido, filas) < hoja.suelo) filas -= 1;
  if (fondoDeHoja(textos, crecido, filas) >= hoja.suelo) {
    pintarRepasosDeHoja(primera, textos, crecido, filas);
    return { paginas: [primera], cabe };
  }
  const segunda = nueva();
  // Arriba del todo: la explicación sube hasta el techo de la página.
  const subida = (hoja.techo - hoja.explicacion.cuerpo) - hoja.explicacion.base;
  pintarRepasosDeHoja(segunda, textos, -subida, hoja.repasos.filas);
  return { paginas: [primera, segunda], cabe };
}

// El documento entero, página a página, y las cuentas de cabida.
function componer(doc, cambios) {
  const textos = mezclarTextos(cambios);
  const datos = leerDatos(doc);
  const zonas = componerZonas(datos, textos);
  const apartados = fluir(bloquesDeApartados(datos, textos)).filter((pagina) => pagina.length > 0);
  const numeradas = zonas.paginas.concat(apartados);
  const paginas = numeradas.map((colocado, i) => paginaNumerada(colocado, i + 1, numeradas.length, datos, textos));
  const hoja = componerHoja(datos, textos);
  for (const pagina of hoja.paginas) paginas.push(pagina);
  return { datos, textos, paginas, zonas, hojaCabe: hoja.cabe };
}

/* ───────────────────────────────────────────────────────────────────
   Escribir el fichero PDF

   A mano y sin comprimir: son tres páginas de texto y pesa poco. Todo
   es ASCII salvo la fuente, así que contar posiciones es contar letras.
   ─────────────────────────────────────────────────────────────────── */

function numero(valor, decimales) {
  let escrito = Number(valor).toFixed(decimales === undefined ? 4 : decimales);
  if (escrito.indexOf('.') >= 0) escrito = escrito.replace(/0+$/, '').replace(/\.$/, '');
  return escrito === '-0' ? '0' : escrito;
}

function octal(codigo) {
  return `\\${(`000${codigo.toString(8)}`).slice(-3)}`;
}

// Un texto ya limpio → cadena del PDF en WinAnsi, con sus escapes.
function cadenaDeTexto(escrito) {
  let cadena = '(';
  for (const letra of escrito) {
    const codigo = codigoWinAnsi(letra.codePointAt(0));
    if (!codigo) continue;
    if (codigo === 40 || codigo === 41 || codigo === 92) cadena += `\\${String.fromCharCode(codigo)}`;
    else if (codigo > 126) cadena += octal(codigo);
    else cadena += String.fromCharCode(codigo);
  }
  return `${cadena})`;
}

// Una cadena de la ficha del documento: simple si se puede, y si no en
// UTF-16 (por ejemplo, si lleva comillas tipográficas o un «€»).
function cadenaDeFicha(escrito) {
  let simple = true;
  for (let i = 0; i < escrito.length; i++) {
    const codigo = escrito.charCodeAt(i);
    if (!((codigo >= 32 && codigo <= 126) || (codigo >= 161 && codigo <= 255))) simple = false;
  }
  if (simple) {
    let cadena = '(';
    for (let i = 0; i < escrito.length; i++) {
      const codigo = escrito.charCodeAt(i);
      if (codigo === 40 || codigo === 41 || codigo === 92) cadena += `\\${escrito[i]}`;
      else if (codigo > 126) cadena += octal(codigo);
      else cadena += escrito[i];
    }
    return `${cadena})`;
  }
  let hex = 'FEFF';
  for (let i = 0; i < escrito.length; i++) {
    hex += (`0000${escrito.charCodeAt(i).toString(16).toUpperCase()}`).slice(-4);
  }
  return `<${hex}>`;
}

function flujoDePagina(ordenes) {
  const filete = GEOMETRIA.hoja.filete;
  const partes = ['0 0 0 rg'];
  for (const orden of ordenes) {
    if (orden.tipo === 'texto') {
      const matriz = orden.cizalla ? `1 0 ${numero(orden.cizalla)} 1` : '1 0 0 1';
      const espaciado = orden.tw ? `${numero(orden.tw, 6)} Tw ` : '';
      const vuelta = orden.tw ? ' 0 Tw' : '';
      partes.push(`BT /F1 ${numero(orden.cuerpo)} Tf ${matriz} ${numero(orden.x)} ${numero(orden.y)} Tm `
        + `${espaciado}${cadenaDeTexto(orden.texto)} Tj${vuelta} ET`);
    } else if (orden.tipo === 'trazos') {
      const rayas = orden.lineas.map((raya) => (
        `${numero(raya[0])} ${numero(raya[1])} m ${numero(raya[2])} ${numero(raya[3])} l S`
      ));
      partes.push(`q 1 J 1 j 0 0 0 RG ${numero(filete.grosor)} w`);
      for (const raya of rayas) partes.push(raya);
      partes.push('Q');
    }
  }
  return `${partes.join('\n')}\n`;
}

// Para que copiar y buscar texto en el PDF devuelva las letras de verdad.
function tablaDeLetras() {
  const sueltas = Object.keys(ALTOS).map((punto) => [ALTOS[punto], Number(punto)]).sort((a, b) => a[0] - b[0]);
  const hex = (valor, cifras) => (`0000${valor.toString(16).toUpperCase()}`).slice(-cifras);
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    '2 beginbfrange',
    '<20> <7E> <0020>',
    '<A0> <FF> <00A0>',
    'endbfrange',
    `${sueltas.length} beginbfchar`,
    ...sueltas.map((par) => `<${hex(par[0], 2)}> <${hex(par[1], 4)}>`),
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
    '',
  ].join('\n');
}

function octetosDe(cadena) {
  const octetos = new Uint8Array(cadena.length);
  for (let i = 0; i < cadena.length; i++) octetos[i] = cadena.charCodeAt(i) & 0xFF;
  return octetos;
}

// Un fichero TrueType empieza con una ficha de 12 octetos (su marca y
// cuántas tablas trae) y sigue con un índice de 16 octetos por tabla que
// dice dónde empieza cada una y cuánto ocupa.
const TRUETYPE = { marca: [0, 1, 0, 0], ficha: 12, entrada: 16, cuantas: 4, comienzo: 8, largo: 12 };

function entero32(octetos, lugar) {
  return ((octetos[lugar] << 24) | (octetos[lugar + 1] << 16) | (octetos[lugar + 2] << 8) | octetos[lugar + 3]) >>> 0;
}

// La fuente, como octetos, o null si no es un TrueType de verdad Y ENTERO:
// tiene que traer completas todas las tablas que anuncia su índice. Una
// descarga cortada a medias empieza igual que la buena, pero incrustada
// dejaría la página en blanco; así no pasa y el PDF sale con la de reserva.
function fuenteValida(fuente) {
  let octetos = null;
  if (fuente instanceof Uint8Array) octetos = fuente;
  else if (fuente instanceof ArrayBuffer) octetos = new Uint8Array(fuente);
  else if (fuente && fuente.buffer instanceof ArrayBuffer) {
    octetos = new Uint8Array(fuente.buffer, fuente.byteOffset || 0, fuente.byteLength);
  }
  if (!octetos || octetos.length < TRUETYPE.ficha) return null;
  if (TRUETYPE.marca.some((octeto, i) => octetos[i] !== octeto)) return null;
  const tablas = (octetos[TRUETYPE.cuantas] << 8) | octetos[TRUETYPE.cuantas + 1];
  const finDelIndice = TRUETYPE.ficha + TRUETYPE.entrada * tablas;
  if (tablas < 1 || finDelIndice > octetos.length) return null;
  for (let lugar = TRUETYPE.ficha; lugar < finDelIndice; lugar += TRUETYPE.entrada) {
    const comienzo = entero32(octetos, lugar + TRUETYPE.comienzo);
    const largo = entero32(octetos, lugar + TRUETYPE.largo);
    if (comienzo < finDelIndice || comienzo + largo > octetos.length) return null;
  }
  return octetos;
}

function sello(fecha) {
  const dos = (valor) => (`0${valor}`).slice(-2);
  return `D:${fecha.getUTCFullYear()}${dos(fecha.getUTCMonth() + 1)}${dos(fecha.getUTCDate())}`
    + `${dos(fecha.getUTCHours())}${dos(fecha.getUTCMinutes())}${dos(fecha.getUTCSeconds())}+00'00'`;
}

// Una huella corta para el identificador del fichero.
function huella(cadena) {
  let hex = '';
  for (let semilla = 0; semilla < 4; semilla++) {
    let h = (0x811C9DC5 ^ (semilla * 0x9E3779B1)) >>> 0;
    for (let i = 0; i < cadena.length; i++) {
      h ^= cadena.charCodeAt(i) & 0xFF;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex += (`00000000${h.toString(16)}`).slice(-8);
  }
  return hex;
}

function escribirPdf(paginas, ficha, fuente) {
  const tipografia = TIPOGRAFIA_CONSTANCIA;
  const incrustada = fuenteValida(fuente);
  const anchos = tipografia.anchos.map((unidades) => numero(unidades * 1000 / tipografia.unidadesPorEm)).join(' ');
  const ultimoCodigo = tipografia.primerCodigo + tipografia.anchos.length - 1;

  // Cada objeto: su texto y, si lo tiene, su flujo de octetos.
  const objetos = [null];
  const reservar = () => objetos.push(null) - 1;
  const catalogo = reservar();
  const arbol = reservar();
  const letra = reservar();
  const descriptor = reservar();
  const fichero = incrustada ? reservar() : 0;
  const tabla = reservar();
  const info = reservar();
  const hojas = paginas.map(() => ({ pagina: reservar(), flujo: reservar() }));

  objetos[catalogo] = { cuerpo: `<< /Type /Catalog /Pages ${arbol} 0 R /PageMode /UseNone /Lang (es-ES) >>` };
  objetos[arbol] = {
    cuerpo: `<< /Type /Pages /Count ${hojas.length} /Kids [${hojas.map((hoja) => `${hoja.pagina} 0 R`).join(' ')}] >>`,
  };
  const medidas = `/Encoding /WinAnsiEncoding /FirstChar ${tipografia.primerCodigo} /LastChar ${ultimoCodigo} `
    + `/Widths [${anchos}] /FontDescriptor ${descriptor} 0 R /ToUnicode ${tabla} 0 R`;
  if (incrustada) {
    const nombre = `WINANS+${tipografia.nombre}`;
    objetos[letra] = { cuerpo: `<< /Type /Font /Subtype /TrueType /BaseFont /${nombre} ${medidas} >>` };
    objetos[descriptor] = {
      cuerpo: `<< /Type /FontDescriptor /FontName /${nombre} /Flags 32 /FontBBox [${tipografia.caja.join(' ')}] `
        + `/ItalicAngle 0 /Ascent ${tipografia.ascendente} /Descent ${tipografia.descendente} `
        + `/CapHeight ${tipografia.mayusculas} /StemV ${tipografia.tallo} /FontFile2 ${fichero} 0 R >>`,
    };
    objetos[fichero] = {
      cuerpo: `<< /Length ${incrustada.length} /Length1 ${incrustada.length} >>`,
      flujo: incrustada,
    };
  } else {
    // Sin la letra de la casa: la Helvetica que trae todo lector de PDF,
    // con los mismos anchos, para que nada cambie de sitio.
    objetos[letra] = { cuerpo: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${medidas} >>` };
    objetos[descriptor] = {
      cuerpo: '<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [-166 -225 1000 931] '
        + '/ItalicAngle 0 /Ascent 718 /Descent -207 /CapHeight 718 /StemV 88 >>',
    };
  }
  const letras = octetosDe(tablaDeLetras());
  objetos[tabla] = { cuerpo: `<< /Length ${letras.length} >>`, flujo: letras };

  const ahora = sello(new Date());
  const campos = [`/Title ${cadenaDeFicha(ficha.titulo)}`];
  if (ficha.autor) campos.push(`/Author ${cadenaDeFicha(ficha.autor)}`);
  campos.push('/Producer (UNIK Works)', `/CreationDate (${ahora})`, `/ModDate (${ahora})`, '/Trapped /False');
  objetos[info] = { cuerpo: `<< ${campos.join(' ')} >>` };

  const { ancho, alto } = GEOMETRIA.pagina;
  let largoTotal = 0;
  hojas.forEach((hoja, i) => {
    const flujo = octetosDe(flujoDePagina(paginas[i]));
    largoTotal += flujo.length;
    objetos[hoja.pagina] = {
      cuerpo: `<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${numero(ancho)} ${numero(alto)}] `
        + `/Resources << /Font << /F1 ${letra} 0 R >> /ProcSet [/PDF /Text] >> /Contents ${hoja.flujo} 0 R >>`,
    };
    objetos[hoja.flujo] = { cuerpo: `<< /Length ${flujo.length} >>`, flujo };
  });

  // A escribir, apuntando dónde empieza cada objeto.
  const trozos = [];
  let escrito = 0;
  const poner = (cosa) => {
    const octetos = typeof cosa === 'string' ? octetosDe(cosa) : cosa;
    trozos.push(octetos);
    escrito += octetos.length;
  };
  const comienzos = [0];
  poner('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  for (let n = 1; n < objetos.length; n++) {
    comienzos[n] = escrito;
    poner(`${n} 0 obj\n${objetos[n].cuerpo}\n`);
    if (objetos[n].flujo) {
      poner('stream\n');
      poner(objetos[n].flujo);
      poner('\nendstream\n');
    }
    poner('endobj\n');
  }
  const indice = escrito;
  let entradas = `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objetos.length; n++) {
    entradas += `${(`0000000000${comienzos[n]}`).slice(-10)} 00000 n \n`;
  }
  poner(entradas);
  const identidad = huella(`${ficha.titulo}|${ficha.autor}|${ahora}|${largoTotal}|${escrito}`);
  poner(`trailer\n<< /Size ${objetos.length} /Root ${catalogo} 0 R /Info ${info} 0 R `
    + `/ID [<${identidad}> <${identidad}>] >>\nstartxref\n${indice}\n%%EOF\n`);

  const todo = new Uint8Array(escrito);
  let lugar = 0;
  for (const trozo of trozos) {
    todo.set(trozo, lugar);
    lugar += trozo.length;
  }
  return todo;
}

/* ───────────────────────────────────────────────────────────────────
   Lo que usa la app
   ─────────────────────────────────────────────────────────────────── */

let tipografiaGuardada = null;
let descargaEnCurso = null;

async function bajarTipografia() {
  try {
    const direccion = new URL('../assets/fonts/liberation-sans-pdf.ttf', import.meta.url).href;
    const respuesta = await fetch(direccion);
    if (!respuesta || !respuesta.ok) return null;
    return fuenteValida(new Uint8Array(await respuesta.arrayBuffer()));
  } catch {
    return null;
  }
}

// Baja la letra del documento y la guarda en memoria para las siguientes
// veces. Si no puede (sin cobertura, por ejemplo) devuelve null y el PDF
// sale igual, con la letra de reserva.
export async function cargarTipografia() {
  if (tipografiaGuardada) return tipografiaGuardada;
  if (!descargaEnCurso) {
    descargaEnCurso = bajarTipografia().then((octetos) => {
      descargaEnCurso = null;
      if (octetos) tipografiaGuardada = octetos;
      return octetos;
    });
  }
  return descargaEnCurso;
}

// Cuántas líneas ocupan las zonas, cuántas caben en la primera página y
// cuántas hay que quitar para que quepan.
// → { lineasZonas, lineasCaben, cabe, sobran, paginas }. No lanza nunca.
//   · sobran: las líneas que hay que quitar de las zonas para que quepan en
//     la primera página (no las que se ven en la segunda, que pueden ser más
//     o menos). 0 si ya cabe; si no, entre 1 y 200.
//   · paginas: todas las del PDF, con la hoja de repasos.
export function medirConstancia(doc, opciones = {}) {
  try {
    const compuesto = componer(doc, opciones ? opciones.textos : null);
    return {
      lineasZonas: compuesto.zonas.lineasZonas,
      lineasCaben: compuesto.zonas.lineasCaben,
      cabe: compuesto.zonas.cabe,
      sobran: compuesto.zonas.sobran,
      paginas: compuesto.paginas.length,
    };
  } catch {
    return { lineasZonas: 0, lineasCaben: 0, cabe: true, sobran: 0, paginas: 3 };
  }
}

// El PDF, como Blob. No usa red: la letra se le pasa ya bajada en «fuente»
// (lo que devuelve cargarTipografia); sin ella sale con la de reserva.
export function pdfConstancia(doc, opciones = {}) {
  // Las opciones son { fuente, textos }; sin ellas (o con null) vale igual.
  const { fuente, textos } = opciones || {};
  const compuesto = componer(doc, textos);
  const datos = compuesto.datos;
  if (!datos.vivienda) throw new Error('Falta el número de la vivienda.');
  if (!datos.fecha) throw new Error('La fecha del documento no es válida.');
  // Antes que dejar un nombre fuera del papel sin que nadie lo vea.
  if (!compuesto.hojaCabe) throw new Error('Los compradores no caben en la hoja de repasos.');
  const ficha = {
    titulo: rellenar(compuesto.textos.tituloInfo, {
      vivienda: datos.vivienda, promocion: datos.promocion, fecha: datos.fechaLarga,
    }),
    autor: datos.promocion,
  };
  const octetos = escribirPdf(compuesto.paginas, ficha, fuente);
  return new Blob([octetos], { type: 'application/pdf' });
}

// 'BRASSIE_Villa_22_Reconocimiento_Repasos_Pendientes_2026-11-09.pdf'
export function nombreDeConstancia(doc) {
  let datos;
  try { datos = leerDatos(doc); } catch { datos = leerDatos(null); }
  const sanear = (parte) => {
    let limpia = String(parte);
    try { limpia = limpia.normalize('NFD'); } catch { /* se queda como está */ }
    return limpia.replace(/[\u0300-\u036F]/g, '').replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  };
  const partes = [
    datos.promocion, 'Villa', datos.vivienda, 'Reconocimiento', 'Repasos', 'Pendientes',
    datos.fecha ? datos.fecha.corta : '',
  ].map(sanear).filter(Boolean);
  return `${partes.join('_')}.pdf`;
}
