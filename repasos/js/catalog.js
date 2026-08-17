/* ═══════════════════════════════════════════════════════════════
   catalog.js — promociones y viviendas de UNIK.

   Para dar de alta una promoción nueva basta con añadir una entrada
   aquí: si `activa` es false aparece en la lista pero deshabilitada,
   igual que hace el showroom con los edificios que aún no tienen BIM.

   `unidades` describe cómo se numeran las viviendas. Con
   { desde: 1, hasta: 50, etiqueta: 'Villa' } salen «Villa 1 … Villa 50»;
   si alguna promoción numera por portal y planta, se puede pasar en su
   lugar un array `lista` con los identificadores literales.
   ═══════════════════════════════════════════════════════════════ */
export const PROMOCIONES = [
  {
    id: 'brassie',
    nombre: 'Brassie',
    ubicacion: '50 villas',
    activa: true,
    unidades: { desde: 1, hasta: 50, etiqueta: 'Villa' },
  },
  {
    // Desarrollo real de UNIK ya modelado en el showroom. Se deja
    // preparado y deshabilitado hasta que empiecen sus repasos:
    // basta poner activa: true.
    id: 'serenea-apolo',
    nombre: 'Serenea · Apolo',
    ubicacion: 'Las Huesas · Telde',
    activa: false,
    unidades: { lista: [] },
  },
];

/** Devuelve la promoción por su id. */
export function promocion(id) {
  return PROMOCIONES.find((p) => p.id === id) || null;
}

/** Lista de unidades de una promoción: [{ id, nombre, corto }] */
export function unidades(promoId) {
  const p = promocion(promoId);
  if (!p) return [];
  const u = p.unidades || {};
  if (Array.isArray(u.lista)) {
    return u.lista.map((nombre) => ({
      id: `${p.id}:${slug(nombre)}`,
      nombre,
      corto: String(nombre).replace(/\D+/g, '') || String(nombre),
    }));
  }
  const out = [];
  for (let n = u.desde; n <= u.hasta; n++) {
    // Dos dígitos siempre: «Villa 07», no «Villa 7». Con cincuenta
    // villas en una columna, la numeración pareja se lee de un barrido
    // y no baila según tenga una cifra o dos.
    const dd = String(n).padStart(2, '0');
    out.push({ id: `${p.id}:${dd}`, nombre: `${u.etiqueta || 'Vivienda'} ${dd}`, corto: dd });
  }
  return out;
}

/** Datos de una unidad concreta a partir de su id compuesto. */
export function unidad(unidadId) {
  const [promoId] = String(unidadId).split(':');
  return unidades(promoId).find((u) => u.id === unidadId) || null;
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Las actas ya no se dividen en pre-entrega y post-entrega. La idea es
 * que el cliente entre y esté todo bien, y se sigue trabajando hasta
 * que lo esté, entre antes o después: la etiqueta no cambiaba nada de
 * lo que había que hacer y solo servía para clasificar el papel.
 *
 * El campo sigue viajando a la base con este valor, porque está en el
 * esquema del servidor y en las actas ya firmadas. No se enseña, no se
 * pregunta y no se filtra por él.
 */
export const FASE_UNICA = 'pre';

/**
 * Los cuatro estados de una tarea, y el vocabulario de toda la app.
 *
 * El circuito tiene cuatro manos:
 *
 *   PENDIENTE   la pone un arquitecto o la propiedad al encontrar el
 *               defecto. Está en el tejado de la constructora.
 *   COMPLETADA  el jefe de obra dice que ya está arreglada. No cierra
 *               nada: pasa a nuestro tejado y hay que ir a mirarla.
 *   RECHAZADA   fuimos a mirarla y no valía. Vuelve al tejado de la
 *               constructora, pero con su propio nombre y su propio
 *               contador, que es lo que hace que se mire.
 *   VERIFICADA  un arquitecto o la propiedad la ha visto y la da por
 *               buena. Solo esto termina una tarea.
 *
 * Una rechazada vuelve a COMPLETADA cuando la arreglan, no a pendiente:
 * pendiente es trabajo que nadie ha tocado todavía, y confundir las dos
 * cosas borra que esa tarea ya rebotó una vez.
 *
 * Estas cuatro palabras son las únicas que se usan en pantalla —chips de
 * estado, filtros, etiquetas de las tarjetas y el informe—, y salen
 * todas de aquí. Antes cada pantalla decía la suya («Pendiente» aquí,
 * «Cerradas» allá, «Terminadas» más allá) y no había manera de saber
 * si dos palabras distintas eran o no la misma cosa.
 *
 * OJO con los identificadores: `resuelta` se llama en pantalla
 * COMPLETADA. El id se deja como estaba a propósito, porque es lo que
 * llevan escrito las tareas ya subidas y renombrarlo obligaría a migrar
 * base, API y todos los móviles a la vez. Al leer código, fíjate en el
 * id; al leer pantalla, en el nombre.
 */
export const ESTADOS = [
  { id: 'pendiente', nombre: 'Pendiente', plural: 'Pendientes', tag: '' },
  { id: 'resuelta', nombre: 'Completada', plural: 'Completadas', tag: 'warn' },
  { id: 'rechazada', nombre: 'Rechazada', plural: 'Rechazadas', tag: 'rojo' },
  { id: 'verificada', nombre: 'Verificada', plural: 'Verificadas', tag: 'ink' },
];

/**
 * Qué cuenta como hecha. Solo la validada: que el jefe de obra la dé
 * por arreglada no cierra nada hasta que alguien con permiso va y lo
 * comprueba en la vivienda.
 *
 * Vive aquí, en una sola línea, porque de esta decisión cuelgan todos
 * los porcentajes de la app, las barras de las viviendas, el verde de
 * una vivienda terminada y el filtro «Validadas». Cambiarla de opinión
 * es cambiar esta función y nada más.
 */
export const hecha = (t) => t?.estado === 'verificada';

/** Arreglada según el jefe de obra, sin validar todavía: nuestra cola. */
export const esperandoVisto = (t) => t?.estado === 'resuelta';

/**
 * Rebotada: la miramos y no valía. Cuenta como trabajo de la
 * constructora, igual que una pendiente, pero se distingue de ella
 * porque esta ya se dio por buena una vez y no coló.
 */
export const rebotada = (t) => t?.estado === 'rechazada';

/** Lo que está en el tejado de la constructora. */
export const enObra = (t) => t?.estado === 'pendiente' || t?.estado === 'rechazada';

/* ═══════════════════════════════════════════════════════════════
   Oficios

   El gremio de cada TAREA (no del acta: en una misma inspección hay
   remates de pintura y de carpintería). Es obligatorio al crearla,
   porque de él tiran los filtros de las pantallas de actas y de
   viviendas: una tarea sin oficio sería invisible al filtrar.

   «General» va primero y recoge lo que no es de un gremio concreto:
   recoger la obra, una limpieza de fin de tajo, un repaso suelto.
   ═══════════════════════════════════════════════════════════════ */
/**
 * Los gremios. «General» va primero por ser el cajón de lo que no cae
 * en ninguno; el resto, por orden alfabético, que es como se busca en
 * una lista de quince donde no hay jerarquía posible.
 *
 * OJO con los identificadores: `carp-aluminio` se llama ahora
 * «Aluminio» y `carp-madera`, «Puertas y rodapiés». Los ids se dejan
 * como estaban a propósito: son los que llevan escritos las tareas ya
 * subidas, y cambiarlos las dejaría con un gremio que no existe —
 * invisibles al filtrar y sin nombre en el informe. Al leer código,
 * fíjate en el id; al leer pantalla, en el nombre.
 */
/*
 * `empresa` es quién lleva ese gremio en Brassie. Como mucho una, y
 * puede quedarse vacía: hay gremios que todavía no están adjudicados y
 * uno sin empresa tiene que verse bien igual.
 *
 * `imagen` es el fichero de assets/gremios/. Sin él, la pantalla dibuja
 * la inicial del gremio sobre un fondo de color, así que no falta nada
 * mientras las fotos no estén puestas: se ven distintas entre sí y se
 * reconocen. Las definitivas salen del propio Figma.
 */
export const OFICIOS = [
  { id: 'general', nombre: 'General', corto: 'General', empresa: '', imagen: '' },
  { id: 'aire', nombre: 'Aire acondicionado', corto: 'Aire', empresa: '', imagen: '' },
  { id: 'carp-aluminio', nombre: 'Aluminio', corto: 'Aluminio', empresa: '', imagen: '' },
  { id: 'barandillas', nombre: 'Barandillas', corto: 'Barandillas', empresa: '', imagen: '' },
  { id: 'barandillas-vidrio', nombre: 'Barandillas de vidrio', corto: 'Barandillas vidrio', empresa: '', imagen: '' },
  { id: 'cocinas', nombre: 'Cocinas', corto: 'Cocinas', empresa: '', imagen: '' },
  { id: 'electricidad', nombre: 'Electricidad', corto: 'Electricidad', empresa: '', imagen: '' },
  { id: 'fachada', nombre: 'Fachada', corto: 'Fachada', empresa: '', imagen: '' },
  { id: 'fontaneria', nombre: 'Fontanería', corto: 'Fontanería', empresa: '', imagen: '' },
  { id: 'jardines', nombre: 'Jardines', corto: 'Jardines', empresa: '', imagen: '' },
  { id: 'pavimentos', nombre: 'Pavimentos', corto: 'Pavimentos', empresa: '', imagen: '' },
  { id: 'pintura', nombre: 'Pintura', corto: 'Pintura', empresa: '', imagen: '' },
  { id: 'piscinas', nombre: 'Piscinas', corto: 'Piscinas', empresa: '', imagen: '' },
  { id: 'pladur', nombre: 'Pladur', corto: 'Pladur', empresa: '', imagen: '' },
  { id: 'carp-madera', nombre: 'Puertas y rodapiés', corto: 'Puertas y rodapiés', empresa: '', imagen: '' },
];

/** El que llevan las tareas creadas antes de que existiera el campo. */
export const OFICIO_POR_DEFECTO = 'general';

export function oficio(id) {
  return OFICIOS.find((o) => o.id === id) || OFICIOS[0];
}

/** Dónde vive la foto de un gremio, o '' si todavía no tiene. */
export function imagenDeOficio(id) {
  const o = oficio(id);
  return o.imagen ? `assets/gremios/${o.imagen}` : '';
}

export function estado(id) {
  return ESTADOS.find((e) => e.id === id) || ESTADOS[0];
}

/* ═══════════════════════════════════════════════════════════════
   Usuarios: contraseña, permisos y roles
   ═══════════════════════════════════════════════════════════════ */

/** Quita tildes y todo lo que no sea letra o número. */
function llano(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Contraseña inicial de un usuario: su nombre completo seguido de la
 * primera palabra de su empresa o rol, todo en minúsculas, sin tildes y
 * sin espacios. «Alba García» + «Unik — Promotor» → albagarciaunik.
 *
 * Se calcula igual en el navegador y en el servidor, así que quien da de
 * alta a alguien puede dictarle la contraseña sin consultarla en ningún
 * sitio.
 */
export function contrasenaInicial(nombre, empresa) {
  const palabras = String(empresa || '').trim().split(/\s+/);
  const primera = palabras.map(llano).find((p) => p) || '';
  return llano(nombre) + primera;
}

/**
 * Quién puede validar una tarea. Es un permiso por usuario, no por
 * empresa: hay técnicos externos que no validan y gente de UNIK que sí.
 */
export function puedeVerificar(usuario) {
  return !!usuario && (usuario.verifica === true || usuario.rol === 'admin');
}

/**
 * Quién puede abrir una lista de repasos. El mismo permiso, y no por
 * pereza: un acta la firma quien tiene potestad para dar una vivienda
 * por revisada, que son los arquitectos y la propiedad. El jefe de obra
 * responde a las tareas de un acta, no la convoca.
 */
export const puedeCrearLista = puedeVerificar;

/**
 * Estados que puede poner un usuario concreto.
 *
 * Verificar y rechazar son las dos caras de lo mismo —ir a la vivienda y
 * decir si el arreglo vale—, así que las dos piden el mismo permiso. Al
 * jefe de obra le quedan pendiente y completada, que es su trabajo.
 */
export function estadosPermitidos(usuario) {
  return puedeVerificar(usuario)
    ? ESTADOS
    : ESTADOS.filter((e) => e.id !== 'verificada' && e.id !== 'rechazada');
}

/* ═══════════════════════════════════════════════════════════════
   Estancias

   Dónde está el remate dentro de la vivienda. No es una clasificación
   del trabajo —para eso está el gremio—: es para encontrarlo sin
   llamar por teléfono. «Repasar la junta del alicatado» en una villa
   con cuatro baños no le sirve a nadie.

   La lista es cerrada a propósito. Escrita a mano acabaría con «baño
   ppal», «Baño Principal» y «bño principal» conviviendo, y el filtro
   por estancia dejaría de funcionar el primer día.
   ═══════════════════════════════════════════════════════════════ */
export const ZONAS = [
  'Salón', 'Cocina', 'Lavadero', 'Aseo', 'Baño secundario', 'Baño principal',
  'Sótano', 'Pasillo', 'Escalera', 'Distribuidor', 'Entrada',
  'Dormitorio 1', 'Dormitorio 2', 'Dormitorio principal', 'Vestidor',
  'Acceso exterior', 'Jardín', 'Fachada', 'Cubierta',
];

/** Las tareas de antes de que existiera el campo no tienen estancia. */
export const ZONA_VACIA = '';

/* ═══════════════════════════════════════════════════════════════
   Fotos

   Son dos conjuntos distintos y no se mezclan nunca:

     de la tarea         el defecto. Las saca quien abre el acta.
     de verificación     la reparación. Las sube quien la completa.

   Que estén separadas es lo que hace que una discusión de obra se
   pueda resolver mirando la app: aquí está cómo estaba, aquí está
   cómo quedó, y las dos con su fecha y su firma. Mezcladas en un
   mismo carrete valdrían la mitad.

   Diez y diez. El diseño decía diez en uno y treinta en el otro; con
   diez sobra para las dos cosas y no hay que explicar por qué el tope
   cambia según dónde estés.
   ═══════════════════════════════════════════════════════════════ */
export const TOPE_FOTOS_TAREA = 10;
export const TOPE_FOTOS_VERIFICACION = 10;

/**
 * Empresas y roles que se ofrecen al dar de alta, para no tener que
 * escribirlos a mano cada vez. El campo admite cualquier texto: esto
 * son solo atajos.
 */
export const EMPRESAS = [
  { texto: 'Unik — Promotor', verifica: true },
  { texto: 'DO — Arquitecto', verifica: true },
  { texto: 'Arquitecto', verifica: true },
  { texto: 'Arquitecta', verifica: true },
  { texto: 'DEO Aparejador', verifica: false },
  { texto: 'Sinergia', verifica: false },
  { texto: 'Subcontrata', verifica: false },
];

/** Sugerencia de permiso de verificación a partir de la empresa/rol. */
export function verificaPorDefecto(empresa) {
  const conocida = EMPRESAS.find((e) => llano(e.texto) === llano(empresa));
  if (conocida) return conocida.verifica;
  // Ante lo desconocido, el permiso más restrictivo.
  return false;
}
