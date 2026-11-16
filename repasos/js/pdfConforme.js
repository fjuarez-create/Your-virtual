/* ═══════════════════════════════════════════════════════════════════
   pdfConforme.js — el «Conforme de la visita» en PDF

   El papel que la parte compradora firma con el dedo al acabar la visita
   de repasos de una vivienda ya entregada: qué visita fue, quién la hizo,
   qué repasos se anotaron, para cuándo (una sola fecha, y ORIENTATIVA),
   las observaciones y la firma, dibujada dentro del propio fichero.

   Es hermano del «Reconocimiento de repasos pendientes»: misma letra
   incrustada, mismos márgenes y el mismo motor (js/pdfConstancia.js), que
   escribe el PDF a mano, sin librerías ni nada del navegador. Por eso vale
   igual en un iPhone sin cobertura que en las pruebas de node.

   Cuatro cosas hay que saber antes de tocar nada:

   · Plantilla FIJA, la que aprobó Fran (la «B»): aquí no redacta nadie.
     Los textos están todos en TEXTOS_CONFORME y las medidas en
     MEDIDAS_CONFORME. Ni «acta» ni «tarea» en nada que se lea.
   · El papel y la pantalla dicen LO MISMO: el PDF se pinta con las frases
     de frasesDeConforme(), que son las que la pantalla enseña antes de
     firmar. No hay una segunda copia de los textos en ningún sitio.
   · Se niega antes que mentir: si falta algo que un papel firmado no
     puede dejar en blanco, pdfConforme() lanza un Error con su frase.
     pegasDeConforme() dice lo mismo sin lanzar, para avisar ANTES de
     pedirle la firma a nadie.
   · No hay negrita. La letra viaja en un solo peso, y la que se fabrica
     repasando el contorno la engorda cada lector de PDF a su manera. Lo
     que destaca, destaca por tamaño.

   ───────────────────────────────────────────────────────────────────
   LA FORMA DE «doc» (lo que le pasa la pantalla)

   {
     sociedad:         'Brassie Villas, S.L.'   si falta, la de TEXTOS_CONFORME
     promocion:        'Brassie'
     vivienda:         '12'                     «07» sale «7»
     fechaVisita:      '2026-11-17'             AAAA-MM-DD, sin Date de por medio
     horaVisita:       '09:30'                  o '' si no se sabe
     compradores:      'Lucía Roca y Daniel Vera'   el texto de la ficha
     fechaEscritura:   '2026-10-02'             o ''; si es posterior a la
                                                visita, la fila no sale
     realizadaPor:     'Marta Vidal'            quién hace la visita
     repasos:          [{ texto }, …]           o ['texto', …]; en el orden
                                                en que se apuntaron. NINGUNO
                                                lleva fecha propia.
     fechaOrientativa: '2027-05-25'             un DÍA. Obligatoria si hay
                                                repasos; sin repasos no existe
     observaciones:    'texto libre'            respeta los puntos y aparte;
                                                vacío → el apartado no sale
     contactos:        { piscina, clima, domotica, armarios, dados }
                                                solo se nombra lo que venga a
                                                `true`; con `dados: false` (o
                                                sin nada a `true`) la línea no
                                                sale. Vale también `tiene` y
                                                `climatizacion`, que es como
                                                los llamaba la muestra.
     firmas:           [{ nombre, trazos, firmadoEn }, …]
                                                lo que devuelve pedirFirma()
                                                de js/firma.js, una o dos.
                                                Solo se imprime quien firma:
                                                una entrada con nombre y sin
                                                trazos no deja hueco.
     lugar:            ''                       '' → «la propia vivienda»
     fecha:            '2026-11-17'             la del «En …, a …»; '' → el
                                                día de la primera firma y, si
                                                aún no hay, el de la visita
   }

   De cada firma: `trazos` es [[[x, y], …], …] en la rejilla que sea (se
   mide su caja y se dibuja a escala y centrada en su recuadro); y cuándo
   se firmó sale de `fecha` ('AAAA-MM-DD') y `hora` ('HH:MM') si vienen
   —son las del reloj del móvil que firmó— y, si no, de `firmadoEn`: un
   instante con huso («…Z») se pasa a la hora del móvil; sin huso
   ('2026-11-17T10:12') se escribe tal cual.
   ═══════════════════════════════════════════════════════════════════ */

/* TODO lo que se usa del motor entra por esta única sentencia. Si un día
   hubiera que separar los dos papeles, se cambia esta línea y nada más. */
import {
  GEOMETRIA, cargarTipografia, limpiar, pierdeLetras, enMayusculas, rellenar, partir, anchoDe, leerFecha, escribirPdf, numero,
} from './pdfConstancia.js';

// La letra del documento: se baja una vez y se le pasa a pdfConforme() en
// `fuente`. Va aquí para que la pantalla no tenga que saber de dónde sale.
export { cargarTipografia };

function congelar(cosa) {
  if (cosa && typeof cosa === 'object' && !Object.isFrozen(cosa)) {
    Object.freeze(cosa);
    for (const clave of Object.keys(cosa)) congelar(cosa[clave]);
  }
  return cosa;
}

// La plantilla que eligió Fran el 16-11-2026. Es el dato que se apunta
// con cada conforme, por si algún día hubiera otra.
export const VARIANTE_CONFORME = 'B';

// Los topes que la pantalla tiene que respetar al recoger los datos.
export const TOPES_CONFORME = congelar({ observaciones: 1000, firmas: 2 });

/* ───────────────────────────────────────────────────────────────────
   Los textos. Lo que va entre llaves se rellena con los datos.
   ─────────────────────────────────────────────────────────────────── */

export const TEXTOS_CONFORME = congelar({
  sociedad: 'Brassie Villas, S.L.',
  titulo1: 'CONFORME DE LA VISITA',
  titulo2: 'VIVIENDA {vivienda}',
  // El título que guarda el fichero por dentro (el que enseña el lector de PDF).
  tituloInfo: 'Vivienda {vivienda} · Conforme de la visita · {fecha}',
  cabecera: 'Vivienda {vivienda} · {promocion}',
  cabeceraSinPromocion: 'Vivienda {vivienda}',
  pie: '{pagina} de {paginas}',
  datos: {
    visita: 'Visita de repasos',
    compradores: 'Compradores',
    escritura: 'Firma de la escritura',
    // No «Por la promotora»: la visita la puede hacer el comercial o la
    // dirección facultativa, y un papel firmado no puede decir otra cosa.
    realizadaPor: 'Visita realizada por',
  },
  visitaConHora: '{fecha}, a las {hora}',
  repasos: 'Repasos anotados en la visita',
  sinRepasos: 'En la visita no se ha anotado ningún repaso.',
  fechaOrientativa: 'Fecha orientativa de finalización',
  aclaracion: 'La fecha de finalización es orientativa. Si por causas ajenas a la promotora —el plazo de entrega de un material, la disponibilidad de un oficio o una causa de fuerza mayor— alguna actuación necesitara más tiempo, se lo comunicaremos y la reprogramaremos a la mayor brevedad.',
  // La línea de los contactos se monta con lo que se le diga que hay.
  contactos: {
    todo: 'En la visita se han facilitado a los compradores los contactos para la puesta en marcha de {puestas} y para coordinar el montaje de los armarios.',
    soloPuestasVarias: 'En la visita se han facilitado a los compradores los contactos para la puesta en marcha de {puestas}.',
    soloPuestaUna: 'En la visita se ha facilitado a los compradores el contacto para la puesta en marcha de {puestas}.',
    soloArmarios: 'En la visita se ha facilitado a los compradores el contacto para coordinar el montaje de los armarios.',
    piscina: 'la piscina',
    clima: 'la climatización',
    domotica: 'la domótica',
    y: 'y',
  },
  observaciones: 'Observaciones',
  // En singular, para que valga con un comprador, con dos o con una sociedad.
  conformidad: 'La parte compradora manifiesta que la visita de repasos de la vivienda se ha realizado en la fecha indicada, que ha sido informada de los repasos anotados en este documento y de su fecha orientativa de finalización, y firma en prueba de conformidad con la revisión.',
  conformidadSinRepasos: 'La parte compradora manifiesta que la visita de repasos de la vivienda se ha realizado en la fecha indicada y que no se ha anotado ningún repaso, y firma en prueba de conformidad con la revisión.',
  lugarYFecha: 'En {lugar}, a {fecha}.',
  lugarPorDefecto: 'la propia vivienda',
  firma: 'Firma',
  firmado: 'Firmado en pantalla el {fecha} a las {hora}',
  firmadoSinHora: 'Firmado en pantalla el {fecha}',
  // Por qué no hay papel, cuando no lo hay. Cada frase dice qué hacer.
  pegas: {
    sinVivienda: 'Falta el número de la vivienda.',
    sinVisita: 'La fecha de la visita no es válida.',
    sinOrientativa: 'Falta la fecha orientativa de finalización: con repasos anotados, hay que poner un día.',
    orientativaAntes: 'La fecha orientativa de finalización no puede ser anterior al día de la visita.',
    repasoVacio: 'El repaso {n} no tiene texto. Escríbele una descripción antes de firmar.',
    repasoLetras: 'El repaso {n} lleva letras que el documento no sabe escribir. Escríbelo con letras latinas.',
    compradoresLetras: 'El nombre de los compradores lleva letras que el documento no sabe escribir. Escríbelo con letras latinas.',
    realizadaPorLetras: 'El nombre de quien hace la visita lleva letras que el documento no sabe escribir. Escríbelo con letras latinas.',
    observacionesLetras: 'Las observaciones llevan letras que el documento no sabe escribir. Escríbelas con letras latinas.',
    firmanteLetras: 'El nombre de quien firma lleva letras que el documento no sabe escribir. Escríbelo con letras latinas.',
    datoLetras: 'Algún dato de la vivienda lleva letras que el documento no sabe escribir.',
    sinFirma: 'Falta la firma: el conforme no se guarda sin firmar.',
    sinNombre: 'Falta el nombre de quien firma.',
    sinCuando: 'Falta el día en que se firmó.',
  },
});

/* ───────────────────────────────────────────────────────────────────
   Las medidas, en puntos. Los márgenes y el pie son los del
   reconocimiento (GEOMETRIA); lo de aquí es lo propio de este papel.
   ─────────────────────────────────────────────────────────────────── */

const CAJA = GEOMETRIA.caja;

export const MEDIDAS_CONFORME = congelar({
  // Hasta dónde baja lo escrito. El número de página va en la base 35.
  suelo: 60,
  holgura: 1e-6,
  texto: { cuerpo: 10, interlinea: 14 },
  nota: { cuerpo: 9, interlinea: 12.5, gris: 0.22 },
  // «enteras»: hasta cuántos renglones un repaso no se parte entre páginas.
  lista: { cuerpo: 10, interlinea: 14, entre: 1.5, sangria: 24, columna: 15, grisCifra: 0.36, enteras: 4 },
  firma: { grosor: 0.95, tinta: 0.07, hueco: 36, nombre: 10, hora: 8, grisHora: 0.4 },
  cabecera: { base: 800, cuerpo: 14.5, cuerpoDerecha: 9, grisDerecha: 0.3, filete: 789.5, grosor: 1.1, grisPie: 0.3 },
  titulo: { cuerpo: 15, tc: 0.9, interlinea: 20, cuerpo2: 10.5, tc2: 1.2, gris2: 0.3, antes: 0 },
  cuadro: {
    antes: 20, relleno: 9, rotulo: 6.8, tcRotulo: 0.55, grisRotulo: 0.36,
    cuerpo: 10, interlinea: 13, arriba: 13.5, entre: 14, abajo: 8.5, filete: 0.5, grisFilete: 0.55,
  },
  epigrafe: { cuerpo: 8, tc: 0.75, alto: 15, antes: 20, filete: 0.5 },
  listaAntes: 8,
  fecha: {
    antes: 12, alto: 27, relleno: 10, fondo: [0.945, 0.935, 0.920],
    rotulo: 8, tcRotulo: 0.75, cuerpo: 13,
  },
  notaAntes: 7,
  parrafoAntes: 11,
  observacionesAntes: 7,
  entreParrafos: 2,
  cierreAntes: 15,
  lugarAntes: 11,
  firmasAntes: 8,
  recuadro: { alto: 58, filete: 0.5, gris: 0.45, rotulo: 6.2, tcRotulo: 0.6, grisRotulo: 0.45 },
  /* El juego PRIETO: lo mismo con menos aire. Solo se usa cuando con el
     de arriba el documento no cabe en una página y con este sí (de nueve
     a unos quince repasos). Con más, vuelve al holgado y ocupa dos. */
  prieto: {
    lista: { interlinea: 13.5, entre: 0.5 },
    cuadro: { antes: 15, arriba: 12, abajo: 7 },
    epigrafe: { antes: 15 },
    listaAntes: 6,
    fecha: { antes: 9, alto: 24 },
    notaAntes: 5,
    parrafoAntes: 8,
    observacionesAntes: 5,
    cierreAntes: 12,
    lugarAntes: 8,
    firmasAntes: 6,
    recuadro: { alto: 50 },
  },
});

// Las medidas con que se compone: las holgadas o, encima, las prietas.
function mezclar(base, parche) {
  if (!parche) return base;
  const mezcla = { ...base };
  for (const clave of Object.keys(parche)) {
    const nuevo = parche[clave];
    mezcla[clave] = nuevo && typeof nuevo === 'object' && !Array.isArray(nuevo) ? mezclar(base[clave], nuevo) : nuevo;
  }
  return mezcla;
}

function medidasDe(prieto) {
  const { prieto: parche, ...holgadas } = MEDIDAS_CONFORME;
  return prieto ? mezclar(holgadas, parche) : holgadas;
}

/* ───────────────────────────────────────────────────────────────────
   Los datos, ya limpios
   ─────────────────────────────────────────────────────────────────── */

function esObjetoLlano(cosa) {
  return !!cosa && typeof cosa === 'object' && !Array.isArray(cosa);
}

const dosCifras = (valor) => (`0${valor}`).slice(-2);

// '9:05' y '09:05' valen si son una hora de verdad; se devuelven tal cual.
function leerHora(valor) {
  const partes = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((typeof valor === 'string' ? valor : '').trim());
  if (!partes) return '';
  if (Number(partes[1]) > 23 || Number(partes[2]) > 59) return '';
  return `${partes[1]}:${partes[2]}`;
}

// Cuándo se firmó → { fecha: { corta, larga }, hora: 'HH:MM' o '' }, o null.
function leerCuando(firma) {
  // Lo que apuntó el reloj del móvil que firmó manda: no hay huso que valga.
  const suelta = leerFecha(firma.fecha);
  if (suelta) return { fecha: suelta, hora: leerHora(firma.hora) };
  const deReloj = (instante) => {
    if (Number.isNaN(instante.getTime())) return null;
    const fecha = leerFecha(`${(`000${instante.getFullYear()}`).slice(-4)}-${dosCifras(instante.getMonth() + 1)}-${dosCifras(instante.getDate())}`);
    return fecha ? { fecha, hora: `${dosCifras(instante.getHours())}:${dosCifras(instante.getMinutes())}` } : null;
  };
  const valor = firma.firmadoEn;
  if (typeof valor === 'number' && Number.isFinite(valor)) return deReloj(new Date(valor));
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  // Un instante con huso («…Z», «…+01:00») se lee en la hora del móvil.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(texto)) {
    return deReloj(new Date(texto));
  }
  const fecha = leerFecha(texto);
  if (!fecha) return null;
  const partes = /^\d{4}-\d{2}-\d{2}[T ](\d{1,2}:\d{2})/.exec(texto);
  return { fecha, hora: partes ? leerHora(partes[1]) : '' };
}

// La caja de unos trazos: dónde empiezan y cuánto ocupan, en su rejilla.
function cajaDe(trazos) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const trazo of trazos) {
    for (const punto of trazo) {
      x0 = Math.min(x0, punto[0]);
      y0 = Math.min(y0, punto[1]);
      x1 = Math.max(x1, punto[0]);
      y1 = Math.max(y1, punto[1]);
    }
  }
  return { x0, y0, ancho: x1 - x0, alto: y1 - y0 };
}

function leerFirma(firma) {
  const origen = esObjetoLlano(firma) ? firma : {};
  const trazos = (Array.isArray(origen.trazos) ? origen.trazos : [])
    .map((trazo) => (Array.isArray(trazo) ? trazo : [])
      .filter((punto) => Array.isArray(punto) && Number.isFinite(punto[0]) && Number.isFinite(punto[1])))
    .filter((trazo) => trazo.length > 0);
  const puntos = trazos.reduce((suma, trazo) => suma + trazo.length, 0);
  return {
    nombre: limpiar(origen.nombre),
    faltanLetras: pierdeLetras(origen.nombre),
    trazos,
    // Ni vacía ni un punto suelto: eso no es una firma.
    firmada: puntos >= 2,
    caja: puntos ? cajaDe(trazos) : null,
    cuando: leerCuando(origen),
  };
}

// De qué se han dado contactos. Solo cuenta lo que venga a `true`: un
// papel firmado no puede decir algo que nadie le ha dicho que pasó.
function leerContactos(origen) {
  const dicho = esObjetoLlano(origen.contactos) ? origen.contactos : (esObjetoLlano(origen.tiene) ? origen.tiene : {});
  const clima = dicho.clima !== undefined ? dicho.clima : dicho.climatizacion;
  return {
    dados: dicho.dados !== false,
    piscina: dicho.piscina === true,
    clima: clima === true,
    domotica: dicho.domotica === true,
    armarios: dicho.armarios === true,
  };
}

function leerConforme(doc) {
  const origen = esObjetoLlano(doc) ? doc : {};
  const visita = leerFecha(origen.fechaVisita);
  const escritura = leerFecha(origen.fechaEscritura);
  const repasos = (Array.isArray(origen.repasos) ? origen.repasos : []).map((repaso) => {
    const escrito = esObjetoLlano(repaso) ? repaso.texto : repaso;
    return { texto: limpiar(escrito), faltanLetras: pierdeLetras(escrito) };
  });
  // La fecha orientativa solo existe si hay algún repaso.
  const orientativa = repasos.length ? leerFecha(origen.fechaOrientativa) : null;
  // Las observaciones respetan los puntos y aparte de quien las escribe.
  const observado = typeof origen.observaciones === 'string' ? origen.observaciones : '';
  const firmas = (Array.isArray(origen.firmas) ? origen.firmas : []).map(leerFirma);
  return {
    sociedad: limpiar(origen.sociedad) || rellenar(TEXTOS_CONFORME.sociedad, {}),
    promocion: limpiar(origen.promocion),
    // «07» y «7» son la misma vivienda: sin ceros delante.
    vivienda: limpiar(origen.vivienda).replace(/^0+(?=\d)/, ''),
    visita,
    hora: leerHora(origen.horaVisita),
    compradores: limpiar(origen.compradores),
    // Una escritura con fecha posterior a la visita es un dato sin
    // corregir: la fila no sale, que este papel se firma.
    escritura: escritura && visita && escritura.corta <= visita.corta ? escritura : null,
    realizadaPor: limpiar(origen.realizadaPor),
    repasos,
    orientativa,
    observaciones: observado.split(/\r?\n/).map(limpiar).filter(Boolean),
    contactos: leerContactos(origen),
    lugar: limpiar(origen.lugar),
    fecha: leerFecha(origen.fecha),
    firmas,
    // Las que se imprimen: las que traen garabato, una o dos.
    firmadas: firmas.filter((firma) => firma.firmada).slice(0, TOPES_CONFORME.firmas),
    letras: {
      compradores: pierdeLetras(origen.compradores),
      realizadaPor: pierdeLetras(origen.realizadaPor),
      observaciones: pierdeLetras(observado),
      dato: pierdeLetras(origen.sociedad) || pierdeLetras(origen.promocion)
        || pierdeLetras(origen.vivienda) || pierdeLetras(origen.lugar),
    },
  };
}

// Lo que venga, sin lanzar nunca: de un dato imposible sale un papel vacío
// (al que pegasDeConforme le encuentra todas las faltas).
function leerSinLanzar(doc) {
  try { return leerConforme(doc); } catch { return leerConforme(null); }
}

/* ───────────────────────────────────────────────────────────────────
   Las pegas: lo que impide que haya papel
   ─────────────────────────────────────────────────────────────────── */

function pegasDe(datos, faltaFirmar) {
  const textos = TEXTOS_CONFORME.pegas;
  const pegas = [];
  const pega = (campo, plantilla, relleno = {}) => pegas.push({ campo, frase: rellenar(plantilla, relleno) });
  if (!datos.vivienda) pega('vivienda', textos.sinVivienda);
  if (!datos.visita) pega('fechaVisita', textos.sinVisita);
  if (datos.repasos.length && !datos.orientativa) pega('fechaOrientativa', textos.sinOrientativa);
  else if (datos.orientativa && datos.visita && datos.orientativa.corta < datos.visita.corta) {
    pega('fechaOrientativa', textos.orientativaAntes);
  }
  // Antes que dejar un repaso fuera, o un nombre a medias, en un papel
  // que se firma.
  datos.repasos.forEach((repaso, i) => {
    if (!repaso.texto) pega('repasos', textos.repasoVacio, { n: i + 1 });
    else if (repaso.faltanLetras) pega('repasos', textos.repasoLetras, { n: i + 1 });
  });
  if (datos.letras.compradores) pega('compradores', textos.compradoresLetras);
  if (datos.letras.realizadaPor) pega('realizadaPor', textos.realizadaPorLetras);
  if (datos.letras.observaciones) pega('observaciones', textos.observacionesLetras);
  if (datos.letras.dato) pega('vivienda', textos.datoLetras);
  if (datos.firmas.some((firma) => firma.faltanLetras)) pega('firmas', textos.firmanteLetras);
  if (!faltaFirmar) {
    if (!datos.firmadas.length) pega('firmas', textos.sinFirma);
    else if (datos.firmadas.some((firma) => !firma.nombre)) pega('firmas', textos.sinNombre);
    else if (datos.firmadas.some((firma) => !firma.cuando)) pega('firmas', textos.sinCuando);
  }
  return pegas;
}

/* ───────────────────────────────────────────────────────────────────
   Las frases: lo que se lee, igual en la pantalla que en el papel
   ─────────────────────────────────────────────────────────────────── */

// «la piscina, la climatización y la domótica», con lo que se le diga.
function fraseDeContactos(contactos, textos) {
  if (!contactos.dados) return '';
  const rotulos = textos.contactos;
  const puestas = ['piscina', 'clima', 'domotica'].filter((clave) => contactos[clave]).map((clave) => rotulos[clave]);
  let lista = puestas.join(', ');
  if (puestas.length > 1) {
    lista = `${puestas.slice(0, -1).join(', ')} ${rotulos.y} ${puestas[puestas.length - 1]}`;
  }
  if (puestas.length && contactos.armarios) return rellenar(rotulos.todo, { puestas: lista });
  if (puestas.length > 1) return rellenar(rotulos.soloPuestasVarias, { puestas: lista });
  if (puestas.length === 1) return rellenar(rotulos.soloPuestaUna, { puestas: lista });
  if (contactos.armarios) return rellenar(rotulos.soloArmarios, {});
  return '';
}

// '2026-11-07' → '07-11-2026'.
function diaConCifras(fecha) {
  const [anio, mes, dia] = fecha.corta.split('-');
  return `${dia}-${mes}-${anio}`;
}

function textoDeFirmado(firma, textos) {
  if (!firma.firmada || !firma.cuando) return '';
  const fecha = diaConCifras(firma.cuando.fecha);
  if (!firma.cuando.hora) return rellenar(textos.firmadoSinHora, { fecha });
  const [hora, minuto] = firma.cuando.hora.split(':');
  return rellenar(textos.firmado, { fecha, hora: `${dosCifras(hora)}:${minuto}` });
}

function frasesDe(datos) {
  const textos = TEXTOS_CONFORME;
  const hayRepasos = datos.repasos.length > 0;
  const visitaLarga = datos.visita ? datos.visita.larga : '';
  const relleno = { vivienda: datos.vivienda, promocion: datos.promocion };
  const valorDeVisita = datos.hora && visitaLarga
    ? rellenar(textos.visitaConHora, { fecha: visitaLarga, hora: datos.hora }) : visitaLarga;
  // Las filas de datos; la que no tiene valor no sale.
  const filas = [
    [rellenar(textos.datos.visita, {}), valorDeVisita],
    [rellenar(textos.datos.compradores, {}), datos.compradores],
    [rellenar(textos.datos.escritura, {}), datos.escritura ? datos.escritura.larga : ''],
    [rellenar(textos.datos.realizadaPor, {}), datos.realizadaPor],
  ].filter((fila) => fila[1]);
  // Dónde y cuándo se firma: el día que se le diga; si no, el de la
  // primera firma; y si aún no hay ninguna, el de la visita.
  const firmada = datos.firmadas.find((firma) => firma.cuando);
  const diaDelCierre = datos.fecha || (firmada ? firmada.cuando.fecha : datos.visita);
  const lugarYFecha = diaDelCierre ? rellenar(textos.lugarYFecha, {
    lugar: datos.lugar || rellenar(textos.lugarPorDefecto, {}),
    fecha: diaDelCierre.larga,
  }) : '';
  // Antes de firmar se enseña a quien va a firmar; después, solo a quien firmó.
  const firmantes = datos.firmadas.length ? datos.firmadas
    : datos.firmas.filter((firma) => firma.nombre).slice(0, TOPES_CONFORME.firmas);
  const contactos = fraseDeContactos(datos.contactos, textos);
  const frases = {
    sociedad: datos.sociedad,
    cabecera: rellenar(datos.promocion ? textos.cabecera : textos.cabeceraSinPromocion, relleno),
    titulo1: rellenar(textos.titulo1, relleno),
    titulo2: rellenar(textos.titulo2, { vivienda: enMayusculas(datos.vivienda) }),
    datos: filas,
    epigrafeRepasos: rellenar(textos.repasos, {}),
    repasos: datos.repasos.map((repaso, i) => ({ n: i + 1, texto: repaso.texto })),
    sinRepasos: hayRepasos ? '' : rellenar(textos.sinRepasos, {}),
    rotuloFecha: hayRepasos ? rellenar(textos.fechaOrientativa, {}) : '',
    fecha: hayRepasos && datos.orientativa ? datos.orientativa.larga : '',
    aclaracion: hayRepasos ? rellenar(textos.aclaracion, {}) : '',
    contactos,
    rotuloObservaciones: datos.observaciones.length ? rellenar(textos.observaciones, {}) : '',
    observaciones: datos.observaciones.join('\n'),
    parrafosDeObservaciones: datos.observaciones.slice(),
    conformidad: rellenar(hayRepasos ? textos.conformidad : textos.conformidadSinRepasos, {}),
    lugarYFecha,
    rotuloFirma: rellenar(textos.firma, {}),
    firmas: firmantes.map((firma) => ({
      nombre: firma.nombre, firmado: textoDeFirmado(firma, textos), firmada: firma.firmada,
    })),
  };
  // Lo mismo, de arriba abajo, para quien solo quiera pintarlo en orden.
  const enOrden = [
    { parte: 'sociedad', texto: frases.sociedad },
    { parte: 'cabecera', texto: frases.cabecera },
    { parte: 'titulo', texto: frases.titulo1 },
    { parte: 'subtitulo', texto: frases.titulo2 },
    ...filas.map((fila) => ({ parte: 'dato', rotulo: fila[0], texto: fila[1] })),
    { parte: 'epigrafe', texto: frases.epigrafeRepasos },
    ...frases.repasos.map((repaso) => ({ parte: 'repaso', n: repaso.n, texto: repaso.texto })),
    { parte: 'sinRepasos', texto: frases.sinRepasos },
    { parte: 'fecha', rotulo: frases.rotuloFecha, texto: frases.fecha },
    { parte: 'aclaracion', texto: frases.aclaracion },
    { parte: 'contactos', texto: frases.contactos },
    { parte: 'epigrafe', texto: frases.rotuloObservaciones },
    ...datos.observaciones.map((parrafo) => ({ parte: 'observacion', texto: parrafo })),
    { parte: 'conformidad', texto: frases.conformidad },
    { parte: 'lugarYFecha', texto: frases.lugarYFecha },
    ...frases.firmas.map((firma) => ({
      parte: 'firma', rotulo: frases.rotuloFirma, texto: firma.nombre, firmado: firma.firmado,
    })),
  ].filter((trozo) => trozo.texto || trozo.parte === 'repaso' || trozo.parte === 'firma');
  frases.enOrden = enOrden;
  return frases;
}

/* ───────────────────────────────────────────────────────────────────
   Pintar: las órdenes de una página

   «texto» es la orden de siempre del motor. Lo demás (gris, espaciado
   entre letras, filetes, la banda de fondo y la firma) va con la orden
   «crudo». Cada texto se escribe UNA vez y sin trazo: nada de negritas
   fabricadas.
   ─────────────────────────────────────────────────────────────────── */

const n = (valor) => numero(valor, 3);

function crudo(ordenes, escrito) {
  ordenes.push({ tipo: 'crudo', ordenes: escrito });
}

// Lo que mide un texto con su espaciado entre letras.
function anchoCon(escrito, cuerpo, tc = 0) {
  return anchoDe(escrito, cuerpo) + tc * Math.max(0, [...escrito].length - 1);
}

function escribir(ordenes, x, y, cuerpo, escrito, estilo = {}) {
  if (!escrito) return;
  const { gris = 0, tc = 0, tw = 0 } = estilo;
  const antes = [];
  const despues = [];
  if (gris) { antes.push(`${n(gris)} g`); despues.push('0 g'); }
  if (tc) { antes.push(`${n(tc)} Tc`); despues.push('0 Tc'); }
  if (antes.length) crudo(ordenes, antes.join(' '));
  ordenes.push({ tipo: 'texto', x, y, cuerpo, texto: escrito, tw, cizalla: 0 });
  if (despues.length) crudo(ordenes, despues.join(' '));
}

function filete(ordenes, x1, y1, x2, y2, grosor = 0.5, gris = 0) {
  crudo(ordenes, `q ${n(grosor)} w ${n(gris)} G ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S Q`);
}

function marco(ordenes, x, y, ancho, alto, grosor = 0.5, gris = 0) {
  crudo(ordenes, `q ${n(grosor)} w ${n(gris)} G ${n(x)} ${n(y)} ${n(ancho)} ${n(alto)} re S Q`);
}

function fondo(ordenes, x, y, ancho, alto, color) {
  crudo(ordenes, `q ${color.map(n).join(' ')} rg ${n(x)} ${n(y)} ${n(ancho)} ${n(alto)} re f Q`);
}

/* La firma, DIBUJADA: los trazos del dedo pasan al PDF como líneas curvas,
   con las mismas órdenes con que se pinta un filete. Sale nítida a
   cualquier tamaño, sin fondo, y pesa un par de KB. Se mide la caja del
   garabato y se lleva a su recuadro a escala (sin deformar) y centrada.
   Las curvas del lienzo son cuadráticas y el PDF solo tiene cúbicas:
   regla de los dos tercios. En el PDF la «y» crece hacia arriba; en la
   pantalla, hacia abajo. */
function pintarFirma(ordenes, firma, x, y, ancho, alto, medidas) {
  if (!firma.firmada || !firma.caja) return;
  const caja = firma.caja;
  // Un garabato sin anchura (una raya de arriba abajo) o sin altura no
  // puede dividir por cero: se le da un mínimo en proporción a su otro lado.
  const mayor = Math.max(caja.ancho, caja.alto, 1e-9);
  const escala = Math.min(ancho / Math.max(caja.ancho, mayor * 0.02), alto / Math.max(caja.alto, mayor * 0.02));
  const dx = x + (ancho - caja.ancho * escala) / 2;
  const dy = y + (alto - caja.alto * escala) / 2;
  const px = (punto) => dx + (punto[0] - caja.x0) * escala;
  const py = (punto) => dy + (caja.alto - (punto[1] - caja.y0)) * escala;
  const c = (valor) => numero(valor, 2);
  const partes = [`q 1 J 1 j ${n(medidas.tinta)} G ${n(medidas.grosor)} w`];
  for (const trazo of firma.trazos) {
    let ax = px(trazo[0]);
    let ay = py(trazo[0]);
    if (trazo.length === 1) {
      // El punto de una «i»: una raya mínima con las puntas redondas.
      partes.push(`${c(ax)} ${c(ay)} m ${c(ax + 0.05)} ${c(ay)} l S`);
      continue;
    }
    partes.push(`${c(ax)} ${c(ay)} m`);
    for (let i = 1; i < trazo.length - 1; i++) {
      const cx = px(trazo[i]);
      const cy = py(trazo[i]);
      const bx = (cx + px(trazo[i + 1])) / 2;
      const by = (cy + py(trazo[i + 1])) / 2;
      partes.push(`${c(ax + (2 / 3) * (cx - ax))} ${c(ay + (2 / 3) * (cy - ay))} `
        + `${c(bx + (2 / 3) * (cx - bx))} ${c(by + (2 / 3) * (cy - by))} ${c(bx)} ${c(by)} c`);
      ax = bx;
      ay = by;
    }
    const fin = trazo[trazo.length - 1];
    partes.push(`${c(px(fin))} ${c(py(fin))} l S`);
  }
  partes.push('Q');
  crudo(ordenes, partes.join('\n'));
}

/* ───────────────────────────────────────────────────────────────────
   Las piezas y su reparto en páginas

   Una pieza es un trozo del documento que no se parte: sabe cuánto
   mide, cuánto aire pide por arriba y cómo pintarse desde su techo.
   «pegada» quiere decir que no se queda sola al pie: va con la que la
   sigue (un epígrafe con su primer renglón).
   ─────────────────────────────────────────────────────────────────── */

// Un renglón justificado: cuánto hay que abrir cada espacio.
function espaciadoDe(linea, cuerpo, ancho, ultima) {
  const sobra = ancho - anchoDe(linea.texto, cuerpo);
  if (linea.espacios <= 0) return 0;
  // El último renglón va a la izquierda, salvo que se pase un pelo.
  return (ultima ? sobra < -1e-8 : Math.abs(sobra) > 1e-8) ? sobra / linea.espacios : 0;
}

// Un párrafo entero como una pieza.
function piezaParrafo(escrito, estilo, opciones = {}) {
  const { alineacion = 'justo', antes = 0, pegada = false } = opciones;
  const x = CAJA.izquierda;
  const ancho = CAJA.ancho;
  const lineas = partir(escrito, estilo.cuerpo, ancho, alineacion === 'justo');
  return {
    alto: lineas.length * estilo.interlinea,
    antes,
    pegada,
    pintar(ordenes, techo) {
      lineas.forEach((linea, i) => {
        const tw = alineacion === 'justo' ? espaciadoDe(linea, estilo.cuerpo, ancho, i === lineas.length - 1) : 0;
        escribir(ordenes, x, techo - estilo.cuerpo - i * estilo.interlinea, estilo.cuerpo, linea.texto,
          { tw, gris: estilo.gris || 0 });
      });
    },
  };
}

// Un párrafo que SÍ se puede partir entre páginas: una pieza por renglón.
// No deja un renglón suelto ni al pie ni arriba de la página siguiente.
function piezasDeParrafo(escrito, estilo, antes) {
  const ancho = CAJA.ancho;
  const lineas = partir(escrito, estilo.cuerpo, ancho, true);
  return lineas.map((linea, i) => ({
    alto: estilo.interlinea,
    antes: i ? 0 : antes,
    pegada: lineas.length > 1 && (i === 0 || i === lineas.length - 2),
    pintar(ordenes, techo) {
      const tw = espaciadoDe(linea, estilo.cuerpo, ancho, i === lineas.length - 1);
      escribir(ordenes, CAJA.izquierda, techo - estilo.cuerpo, estilo.cuerpo, linea.texto, { tw });
    },
  }));
}

// Varias piezas que van siempre juntas (la conformidad con sus firmas).
function juntar(piezas, antes) {
  let alto = 0;
  piezas.forEach((pieza, i) => { alto += (i ? pieza.antes : 0) + pieza.alto; });
  return {
    alto,
    antes,
    pegada: false,
    pintar(ordenes, techo) {
      let y = techo;
      piezas.forEach((pieza, i) => {
        if (i) y -= pieza.antes;
        pieza.pintar(ordenes, y);
        y -= pieza.alto;
      });
    },
  };
}

// → una lista por página con lo colocado: { pieza, techo }.
function repartir(piezas, m) {
  const techo = CAJA.techo;
  const paginas = [[]];
  let y = techo;
  let arriba = true;
  for (let i = 0; i < piezas.length; i++) {
    const pieza = piezas[i];
    let junto = pieza.alto;
    for (let j = i; piezas[j].pegada && piezas[j + 1]; j++) junto += piezas[j + 1].antes + piezas[j + 1].alto;
    let aire = arriba ? 0 : pieza.antes;
    if (!arriba && y - aire - junto < m.suelo - m.holgura) {
      paginas.push([]);
      y = techo;
      aire = 0;
    }
    paginas[paginas.length - 1].push({ pieza, techo: y - aire });
    y -= aire + pieza.alto;
    arriba = false;
  }
  return paginas;
}

// El título, centrado: grande, y la vivienda debajo, en gris.
function piezaTitulo(frases, m) {
  const t = m.titulo;
  return {
    alto: t.interlinea + t.cuerpo2 + 4,
    antes: t.antes,
    pegada: true,
    pintar(ordenes, techo) {
      const centro = CAJA.izquierda + CAJA.ancho / 2;
      escribir(ordenes, centro - anchoCon(frases.titulo1, t.cuerpo, t.tc) / 2, techo - t.cuerpo, t.cuerpo,
        frases.titulo1, { tc: t.tc });
      escribir(ordenes, centro - anchoCon(frases.titulo2, t.cuerpo2, t.tc2) / 2, techo - t.interlinea - t.cuerpo2,
        t.cuerpo2, frases.titulo2, { tc: t.tc2, gris: t.gris2 });
    },
  };
}

// El cuadro de los datos: dos columnas, y tantas filas como haga falta.
function piezaCuadro(frases, m) {
  const c = m.cuadro;
  const columna = CAJA.ancho / 2;
  const filas = [];
  for (let i = 0; i < frases.datos.length; i += 2) {
    const par = frases.datos.slice(i, i + 2).map((celda) => ({
      rotulo: enMayusculas(celda[0]),
      lineas: partir(celda[1], c.cuerpo, columna - 2 * c.relleno, false),
    }));
    const lineas = Math.max(...par.map((celda) => Math.max(1, celda.lineas.length)));
    filas.push({ par, alto: c.arriba + c.entre + (lineas - 1) * c.interlinea + c.abajo });
  }
  const alto = filas.reduce((suma, fila) => suma + fila.alto, 0);
  return {
    alto,
    antes: c.antes,
    pegada: true,
    pintar(ordenes, techo) {
      if (!filas.length) return;
      let y = techo;
      filas.forEach((fila, f) => {
        fila.par.forEach((celda, k) => {
          const x = CAJA.izquierda + k * columna + c.relleno;
          const baseRotulo = y - c.arriba;
          escribir(ordenes, x, baseRotulo, c.rotulo, celda.rotulo, { tc: c.tcRotulo, gris: c.grisRotulo });
          celda.lineas.forEach((linea, i) => {
            escribir(ordenes, x, baseRotulo - c.entre - i * c.interlinea, c.cuerpo, linea.texto);
          });
        });
        y -= fila.alto;
        if (f < filas.length - 1) filete(ordenes, CAJA.izquierda, y, CAJA.derecha, y, c.filete, c.grisFilete);
      });
      marco(ordenes, CAJA.izquierda, techo - alto, CAJA.ancho, alto, c.filete, c.grisFilete);
      filete(ordenes, CAJA.izquierda + columna, techo - alto, CAJA.izquierda + columna, techo, c.filete, c.grisFilete);
    },
  };
}

function piezaEpigrafe(escrito, antes, m) {
  const e = m.epigrafe;
  return {
    alto: e.alto,
    antes,
    pegada: true,
    pintar(ordenes, techo) {
      escribir(ordenes, CAJA.izquierda, techo - e.cuerpo - 1, e.cuerpo, enMayusculas(escrito), { tc: e.tc });
      filete(ordenes, CAJA.izquierda, techo - e.alto + 1, CAJA.derecha, techo - e.alto + 1, e.filete, 0);
    },
  };
}

// Un repaso de la lista: su número, en gris, y su texto con sangría. Uno
// corto no se parte entre páginas; uno muy largo sí, renglón a renglón,
// sin dejar un renglón suelto (así ninguno se sale nunca de la hoja).
function piezasDeRepaso(repaso, antes, sangria, m) {
  const l = m.lista;
  const x = CAJA.izquierda + sangria;
  const lineas = partir(repaso.texto, l.cuerpo, CAJA.ancho - sangria, false).map((linea) => linea.texto);
  if (!lineas.length) lineas.push('');
  const cifra = String(repaso.n);
  const pintarCifra = (ordenes, techo) => {
    escribir(ordenes, x - (l.sangria - l.columna) - anchoDe(cifra, l.cuerpo) - 2, techo - l.cuerpo, l.cuerpo, cifra,
      { gris: l.grisCifra });
  };
  if (lineas.length <= l.enteras) {
    return [{
      alto: lineas.length * l.interlinea,
      antes,
      pegada: false,
      pintar(ordenes, techo) {
        pintarCifra(ordenes, techo);
        lineas.forEach((linea, i) => escribir(ordenes, x, techo - l.cuerpo - i * l.interlinea, l.cuerpo, linea));
      },
    }];
  }
  return lineas.map((linea, i) => ({
    alto: l.interlinea,
    antes: i ? 0 : antes,
    pegada: i === 0 || i === lineas.length - 2,
    pintar(ordenes, techo) {
      if (i === 0) pintarCifra(ordenes, techo);
      escribir(ordenes, x, techo - l.cuerpo, l.cuerpo, linea);
    },
  }));
}

// La fecha orientativa, en su banda: el rótulo a la izquierda y el día,
// grande, a la derecha.
function piezaFecha(frases, m) {
  const f = m.fecha;
  return {
    alto: f.alto,
    antes: f.antes,
    pegada: true,
    pintar(ordenes, techo) {
      fondo(ordenes, CAJA.izquierda, techo - f.alto, CAJA.ancho, f.alto, f.fondo);
      const centro = techo - f.alto / 2;
      escribir(ordenes, CAJA.izquierda + f.relleno, centro - f.rotulo * 0.36, f.rotulo,
        enMayusculas(frases.rotuloFecha), { tc: f.tcRotulo });
      escribir(ordenes, CAJA.derecha - f.relleno - anchoDe(frases.fecha, f.cuerpo),
        centro - f.cuerpo * 0.36, f.cuerpo, frases.fecha);
    },
  };
}

// Las firmas, cada una en su recuadro, una al lado de la otra. Debajo, el
// nombre de quien firma y cuándo. Solo hay recuadro para quien firma.
function piezaFirmas(frases, firmadas, m) {
  const medidas = m.firma;
  const recuadro = m.recuadro;
  const rotulos = frases.firmas.length ? frases.firmas : [{ nombre: '', firmado: '' }];
  const anchoHueco = (CAJA.ancho - medidas.hueco) / 2;
  const conHora = rotulos.some((firma) => firma.firmado);
  // Un nombre largo no pisa la firma de al lado: baja a otro renglón.
  const nombres = rotulos.map((firma) => partir(firma.nombre, medidas.nombre, anchoHueco, false));
  const renglones = Math.max(1, ...nombres.map((lineas) => lineas.length));
  const altoNombre = medidas.nombre + (renglones - 1) * (medidas.nombre + 2.5);
  return {
    alto: recuadro.alto + 4 + altoNombre + 3 + (conHora ? medidas.hora + 3 : 0),
    antes: m.firmasAntes,
    pegada: false,
    pintar(ordenes, techo) {
      rotulos.forEach((firma, i) => {
        const x = CAJA.izquierda + i * (anchoHueco + medidas.hueco);
        const base = techo - recuadro.alto;
        marco(ordenes, x, base, anchoHueco, recuadro.alto, recuadro.filete, recuadro.gris);
        escribir(ordenes, x + 7, techo - 6 - recuadro.rotulo, recuadro.rotulo,
          enMayusculas(frases.rotuloFirma), { tc: recuadro.tcRotulo, gris: recuadro.grisRotulo });
        if (firmadas[i]) pintarFirma(ordenes, firmadas[i], x + 16, base + 6, anchoHueco - 32, recuadro.alto - 15, medidas);
        const baseNombre = base - 4 - medidas.nombre;
        nombres[i].forEach((linea, k) => {
          escribir(ordenes, x, baseNombre - k * (medidas.nombre + 2.5), medidas.nombre, linea.texto);
        });
        escribir(ordenes, x, base - 4 - altoNombre - 3 - medidas.hora, medidas.hora, firma.firmado,
          { gris: medidas.grisHora });
      });
    },
  };
}

// El documento, de arriba abajo, en piezas.
function piezasDe(frases, firmadas, m) {
  const { texto, nota, lista } = m;
  const piezas = [piezaTitulo(frases, m), piezaCuadro(frases, m)];

  // Los repasos de la visita, numerados. No se queda uno suelto ni al pie,
  // bajo el epígrafe, ni arriba de la página siguiente: el primero y el
  // penúltimo van pegados al que los sigue.
  piezas.push(piezaEpigrafe(frases.epigrafeRepasos, m.epigrafe.antes, m));
  const cuantos = frases.repasos.length;
  if (cuantos) {
    // Con cien repasos o más, el número necesita una cifra más de sitio.
    const sangria = lista.sangria + (cuantos >= 100 ? 6 : 0);
    frases.repasos.forEach((repaso, i) => {
      const suyas = piezasDeRepaso(repaso, i ? lista.entre : m.listaAntes, sangria, m);
      if (cuantos > 1 && (i === 0 || i === cuantos - 2)) suyas[suyas.length - 1].pegada = true;
      piezas.push(...suyas);
    });
    // La fecha orientativa, que es siempre un día, y su aclaración.
    piezas.push(piezaFecha(frases, m));
    piezas.push(piezaParrafo(frases.aclaracion, nota, { antes: m.notaAntes }));
  } else {
    piezas.push(piezaParrafo(frases.sinRepasos, texto, { alineacion: 'izquierda', antes: m.listaAntes }));
  }

  // Los contactos facilitados, si se dieron.
  if (frases.contactos) piezas.push(piezaParrafo(frases.contactos, texto, { antes: m.parrafoAntes }));

  // Las observaciones, si las hay: sin ellas no hay ni apartado.
  if (frases.parrafosDeObservaciones.length) {
    piezas.push(piezaEpigrafe(frases.rotuloObservaciones, m.epigrafe.antes - 4, m));
    frases.parrafosDeObservaciones.forEach((parrafo, i) => {
      piezas.push(...piezasDeParrafo(parrafo, texto, i ? m.entreParrafos : m.observacionesAntes));
    });
  }

  // El cierre no se separa: lo que se firma, dónde y cuándo, y las firmas.
  piezas.push(juntar([
    piezaParrafo(frases.conformidad, texto),
    piezaParrafo(frases.lugarYFecha, texto, { alineacion: 'izquierda', antes: m.lugarAntes }),
    piezaFirmas(frases, firmadas, m),
  ], m.cierreAntes));
  return piezas;
}

// Lo que se repite en cada página: la sociedad con su filete, y el pie.
function vestir(ordenes, numeroDePagina, total, frases, m) {
  const c = m.cabecera;
  const { pie } = GEOMETRIA;
  escribir(ordenes, CAJA.izquierda, c.base, c.cuerpo, frases.sociedad);
  escribir(ordenes, CAJA.derecha - anchoDe(frases.cabecera, c.cuerpoDerecha), c.base, c.cuerpoDerecha,
    frases.cabecera, { gris: c.grisDerecha });
  filete(ordenes, CAJA.izquierda, c.filete, CAJA.derecha, c.filete, c.grosor, 0);
  const cuenta = rellenar(TEXTOS_CONFORME.pie, { pagina: numeroDePagina, paginas: total });
  escribir(ordenes, pie.centro - anchoDe(cuenta, pie.cuerpo) / 2, pie.base, pie.cuerpo, cuenta, { gris: c.grisPie });
}

function componer(datos) {
  const frases = frasesDe(datos);
  const armar = (prieto) => {
    const m = medidasDe(prieto);
    return { m, prieto, repartidas: repartir(piezasDe(frases, datos.firmadas, m), m) };
  };
  // Con su aire de siempre; si así no cabe en una página, se prueba con
  // el juego prieto, y solo se queda con él si con él sí cabe.
  let armado = armar(false);
  if (armado.repartidas.length > 1) {
    const apretado = armar(true);
    if (apretado.repartidas.length === 1) armado = apretado;
  }
  const { m, repartidas } = armado;
  const paginas = repartidas.map((colocado, i) => {
    const ordenes = [];
    vestir(ordenes, i + 1, repartidas.length, frases, m);
    for (const puesto of colocado) puesto.pieza.pintar(ordenes, puesto.techo);
    return ordenes;
  });
  // Dónde acaba lo escrito en la última página (para las cuentas de cabida).
  const ultima = repartidas[repartidas.length - 1];
  const final = ultima[ultima.length - 1];
  return { frases, paginas, prieto: armado.prieto, sobra: final.techo - final.pieza.alto - m.suelo };
}

/* ───────────────────────────────────────────────────────────────────
   Lo que usa la app
   ─────────────────────────────────────────────────────────────────── */

/**
 * Los textos del papel, ya rellenos, para enseñarlos en pantalla ANTES de
 * firmar (y para que nadie los escriba dos veces). No lanza nunca.
 *
 * → { sociedad, cabecera, titulo1, titulo2, datos: [[rótulo, valor], …],
 *     epigrafeRepasos, repasos: [{ n, texto }], sinRepasos, rotuloFecha,
 *     fecha, aclaracion, contactos, rotuloObservaciones, observaciones,
 *     parrafosDeObservaciones: [..], conformidad, lugarYFecha, rotuloFirma,
 *     firmas: [{ nombre, firmado, firmada }], enOrden: [{ parte, texto, … }] }
 *
 * Lo que no toca va en '' (o en lista vacía). `observaciones` son los
 * párrafos unidos con saltos de línea. En el papel van en mayúsculas los
 * rótulos de los datos, los dos epígrafes, `rotuloFecha` y `rotuloFirma`;
 * lo demás, tal cual. `enOrden` es lo mismo de arriba abajo, sin huecos:
 * `parte` es sociedad, cabecera, titulo, subtitulo, dato (con `rotulo`),
 * epigrafe, repaso (con `n`), sinRepasos, fecha (con `rotulo`), aclaracion,
 * contactos, observacion, conformidad, lugarYFecha o firma (con `rotulo` y
 * `firmado`).
 */
export function frasesDeConforme(doc) {
  return frasesDe(leerSinLanzar(doc));
}

/**
 * Por qué no habría papel: [{ campo, frase }], vacía si todo está bien.
 * No lanza nunca. Con `faltaFirmar: true` no cuenta que aún no esté
 * firmado: es lo que se mira antes de pedirle la firma a nadie.
 * `campo` es vivienda, fechaVisita, fechaOrientativa, repasos, compradores,
 * realizadaPor, observaciones o firmas.
 */
export function pegasDeConforme(doc, { faltaFirmar = false } = {}) {
  return pegasDe(leerSinLanzar(doc), faltaFirmar);
}

/**
 * Cuántas páginas saldrían, cuánto sitio queda en la última (en puntos) y
 * si ha hecho falta apretar el aire: { paginas, sobra, prieto }. No lanza
 * nunca, y vale antes de firmar.
 */
export function medirConforme(doc) {
  try {
    const compuesto = componer(leerSinLanzar(doc));
    return { paginas: compuesto.paginas.length, sobra: compuesto.sobra, prieto: compuesto.prieto };
  } catch {
    return { paginas: 1, sobra: 0, prieto: false };
  }
}

/**
 * El PDF, como octetos (Uint8Array). No usa red: la letra se le pasa ya
 * bajada en `opciones.fuente` (lo que devuelve cargarTipografia()); sin
 * ella sale igual, con la de reserva.
 *
 * Lanza un Error con su frase en español si falta algo que un papel
 * firmado no puede dejar en blanco (las mismas de pegasDeConforme).
 */
export function pdfConforme(doc, opciones = {}) {
  const datos = leerSinLanzar(doc);
  const pegas = pegasDe(datos, false);
  if (pegas.length) throw new Error(pegas[0].frase);
  const compuesto = componer(datos);
  const ficha = {
    titulo: rellenar(TEXTOS_CONFORME.tituloInfo, { vivienda: datos.vivienda, fecha: datos.visita.larga }),
    autor: datos.sociedad,
  };
  return escribirPdf(compuesto.paginas, ficha, opciones ? opciones.fuente : null);
}

/**
 * El nombre del fichero: 'BRASSIE_Villa_12_Conforme_Visita_2026-11-17_1012.pdf'.
 * Lleva el día de la visita y la hora de la primera firma (dos conformes
 * no se firman en el mismo minuto, así que dos visitas del mismo día no se
 * llaman igual); si aún no hay firma, la hora de la visita. No lanza nunca.
 */
export function nombreDeConforme(doc) {
  const datos = leerSinLanzar(doc);
  const sanear = (parte) => {
    let limpia = String(parte);
    try { limpia = limpia.normalize('NFD'); } catch { /* se queda como está */ }
    return limpia.replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  };
  const firmada = datos.firmadas.find((firma) => firma.cuando && firma.cuando.hora);
  const hora = (firmada ? firmada.cuando.hora : datos.hora).split(':');
  const partes = [
    enMayusculas(datos.promocion), 'Villa', datos.vivienda, 'Conforme', 'Visita',
    datos.visita ? datos.visita.corta : '',
    hora.length === 2 ? `${dosCifras(hora[0])}${hora[1]}` : '',
  ].map(sanear).filter(Boolean);
  return `${partes.join('_')}.pdf`;
}
