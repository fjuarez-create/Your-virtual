/* ═══════════════════════════════════════════════════════════════
   api.js — Capa de datos.

   La disponibilidad la manda el panel de gestión
   (showroom.unikdi.com/gestion): el comercial marca una vivienda como
   vendida y el visor lo enseña en el siguiente refresco, sin deploy.
   El endpoint es /gestion/api/estado.php y devuelve

     { actualizado, sello, total, viviendas: { "101": "vendida", ... } }

   Si el endpoint no contesta —hosting sin PHP, panel todavía sin
   publicar, un corte— se cae a data/availability.json, que viaja en el
   repositorio. El visor nunca se queda sin datos por esto.

   Para apuntar a otro backend basta con definir, antes de cargar la app:

     window.APOLO_API = {
       unitsUrl:        'https://api.midominio.com/api/units',
       availabilityUrl: 'https://api.midominio.com/api/availability',
       leadUrl:         'https://api.midominio.com/api/leads',
     };

   Contratos esperados (ver README.md):
   - GET unitsUrl        → [{ id, planta, dorm, orientacion, supViv,
                              terraza, supTotal, precio }, ...]
   - GET availabilityUrl → { "101": "disponible|reservada|vendida", ... }
                           o { viviendas: { "101": ... } }
   - POST leadUrl        → { unitId, nombre, email, telefono }
   ═══════════════════════════════════════════════════════════════ */

const cfg = () => window.APOLO_API || {};

/* Fuente viva y copia de seguridad, en ese orden. */
const ESTADO_VIVO = 'gestion/api/estado.php';
const ESTADO_FIJO = 'data/availability.json';

export async function fetchUnits() {
  const url = cfg().unitsUrl || 'data/units.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar el listado de viviendas (${res.status})`);
  return res.json();
}

/* El panel devuelve el mapa dentro de `viviendas`; el JSON estático es el
   mapa pelado. Se aceptan los dos para que la misma función sirva a ambos. */
const mapaDeEstados = (dato) => {
  if (!dato || typeof dato !== 'object') return {};
  const mapa = dato.viviendas && typeof dato.viviendas === 'object' ? dato.viviendas : dato;
  return typeof mapa === 'object' ? mapa : {};
};

async function pedirEstados(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return mapaDeEstados(await res.json());
}

/* `respaldo` es el JSON estático al que caer si el panel no contesta. Cada
   edificio del catálogo puede traer el suyo (ver promotions.js); si no, el de
   Apolo. Un `window.APOLO_API.availabilityUrl` explícito manda sobre todo. */
export async function fetchAvailability(respaldo) {
  const fijado = cfg().availabilityUrl;
  const intentos = fijado ? [fijado] : [ESTADO_VIVO, respaldo || ESTADO_FIJO];
  let ultimo = null;
  for (const url of intentos) {
    try {
      const estados = await pedirEstados(url);
      /* Un endpoint que contesta con el mapa vacío no es una respuesta útil:
         se sigue probando con el siguiente antes de darlo por bueno. */
      if (Object.keys(estados).length) return estados;
      ultimo = new Error('respuesta vacía');
    } catch (e) {
      ultimo = e;
    }
  }
  console.warn('[apolo] Disponibilidad no disponible, se asume todo "disponible":', ultimo && ultimo.message);
  return {};
}

/** Refresco periódico de disponibilidad (polling sencillo, backend-ready). */
export function pollAvailability(onUpdate, intervalMs = 60_000) {
  const tick = async () => {
    try { onUpdate(await fetchAvailability()); } catch { /* silencioso */ }
  };
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}

export async function sendLead(lead) {
  const url = cfg().leadUrl;
  if (!url) {
    // Sin backend: fallback a mailto
    const body = encodeURIComponent(
      `Hola,\n\nMe interesa la vivienda ${lead.unitId} del Edificio Apolo (Serenea, Las Huesas).\n\nUn saludo.`
    );
    window.location.href = `mailto:info@serenea.es?subject=${encodeURIComponent(
      `Interés vivienda ${lead.unitId} · Edificio Apolo`
    )}&body=${body}`;
    return { ok: true, via: 'mailto' };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });
  return { ok: res.ok, via: 'api' };
}
