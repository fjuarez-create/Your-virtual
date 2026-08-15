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
 * Los tres estados de una tarea, y el vocabulario de toda la app.
 *
 * El circuito de una tarea tiene tres manos y por eso hay tres estados,
 * ni uno más:
 *
 *   ABIERTA   la pone un arquitecto o la propiedad al encontrar el
 *             defecto. Está en el tejado de la constructora.
 *   REVISAR   el jefe de obra dice que ya está arreglada. No cierra
 *             nada: pasa a nuestro tejado y hay que ir a mirarla.
 *   VALIDADA  un arquitecto o la propiedad la ha visto y la da por
 *             buena. Solo esto termina una tarea.
 *
 * Estas tres palabras son las únicas que se usan en pantalla —chips de
 * estado, filtros, etiquetas de las tarjetas y el informe—, y salen
 * todas de aquí. Antes cada pantalla decía la suya («Pendiente» aquí,
 * «Cerradas» allá, «Terminadas» más allá) y no había manera de saber
 * si dos palabras distintas eran o no la misma cosa.
 *
 * «Abierta» y no «Pendiente» porque pendiente lo están las dos
 * primeras —una del constructor y otra nuestra—, y esa era justo la
 * ambigüedad. Abierta/validada es además el par que se usa en obra.
 *
 * OJO con los identificadores: siguen siendo `pendiente`, `resuelta` y
 * `verificada`, que es lo que hay escrito en las tareas ya subidas.
 * Al leer código, fíjate en el id; al leer pantalla, en el nombre.
 */
export const ESTADOS = [
  { id: 'pendiente', nombre: 'Abierta', plural: 'Abiertas', tag: '' },
  { id: 'resuelta', nombre: 'Revisar', plural: 'Revisar', tag: 'warn' },
  { id: 'verificada', nombre: 'Validada', plural: 'Validadas', tag: 'ink' },
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
export const OFICIOS = [
  { id: 'general', nombre: 'General', corto: 'General' },
  { id: 'aire', nombre: 'Aire acondicionado', corto: 'Aire' },
  { id: 'carp-aluminio', nombre: 'Aluminio', corto: 'Aluminio' },
  { id: 'barandillas', nombre: 'Barandillas', corto: 'Barandillas' },
  { id: 'barandillas-vidrio', nombre: 'Barandillas de vidrio', corto: 'Barandillas vidrio' },
  { id: 'cocinas', nombre: 'Cocinas', corto: 'Cocinas' },
  { id: 'electricidad', nombre: 'Electricidad', corto: 'Electricidad' },
  { id: 'fachada', nombre: 'Fachada', corto: 'Fachada' },
  { id: 'fontaneria', nombre: 'Fontanería', corto: 'Fontanería' },
  { id: 'jardines', nombre: 'Jardines', corto: 'Jardines' },
  { id: 'pavimentos', nombre: 'Pavimentos', corto: 'Pavimentos' },
  { id: 'pintura', nombre: 'Pintura', corto: 'Pintura' },
  { id: 'piscinas', nombre: 'Piscinas', corto: 'Piscinas' },
  { id: 'pladur', nombre: 'Pladur', corto: 'Pladur' },
  { id: 'carp-madera', nombre: 'Puertas y rodapiés', corto: 'Puertas y rodapiés' },
];

/** El que llevan las tareas creadas antes de que existiera el campo. */
export const OFICIO_POR_DEFECTO = 'general';

export function oficio(id) {
  return OFICIOS.find((o) => o.id === id) || OFICIOS[0];
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

/** Estados que puede poner un usuario concreto. */
export function estadosPermitidos(usuario) {
  return puedeVerificar(usuario) ? ESTADOS : ESTADOS.filter((e) => e.id !== 'verificada');
}

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
