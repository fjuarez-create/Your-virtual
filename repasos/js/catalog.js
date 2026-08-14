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
    out.push({
      id: `${p.id}:${String(n).padStart(2, '0')}`,
      nombre: `${u.etiqueta || 'Vivienda'} ${n}`,
      corto: String(n),
    });
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

/** Fases de repaso. El orden define el de los selectores. */
export const FASES = [
  { id: 'pre', nombre: 'Pre-entrega', corto: 'Pre' },
  { id: 'post', nombre: 'Post-entrega', corto: 'Post' },
];

export const ESTADOS = [
  { id: 'pendiente', nombre: 'Pendiente', tag: 'accent' },
  { id: 'resuelta', nombre: 'Resuelta', tag: 'ok' },
  { id: 'verificada', nombre: 'Verificada', tag: 'ink' },
];

export function estado(id) {
  return ESTADOS.find((e) => e.id === id) || ESTADOS[0];
}
export function fase(id) {
  return FASES.find((f) => f.id === id) || FASES[0];
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
 * Quién puede marcar una tarea como verificada. Es un permiso por
 * usuario, no por empresa: hay técnicos externos que no verifican y
 * gente de UNIK que sí.
 */
export function puedeVerificar(usuario) {
  return !!usuario && (usuario.verifica === true || usuario.rol === 'admin');
}

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
