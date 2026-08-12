/* ═══════════════════════════════════════════════════════════════
   api.js — Capa de datos.

   Hoy sirve JSON estático; mañana, un backend real. Para conectar
   el backend basta con definir antes de cargar la app:

     window.APOLO_API = {
       unitsUrl:        'https://api.midominio.com/api/units',
       availabilityUrl: 'https://api.midominio.com/api/availability',
       leadUrl:         'https://api.midominio.com/api/leads',
     };

   Contratos esperados (ver README.md):
   - GET unitsUrl        → [{ id, planta, dorm, orientacion, supViv,
                              terraza, supTotal, precio }, ...]
   - GET availabilityUrl → { "101": "disponible|reservada|vendida", ... }
   - POST leadUrl        → { unitId, nombre, email, telefono }
   ═══════════════════════════════════════════════════════════════ */

const cfg = () => window.APOLO_API || {};

export async function fetchUnits() {
  const url = cfg().unitsUrl || 'data/units.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar el listado de viviendas (${res.status})`);
  return res.json();
}

export async function fetchAvailability() {
  const url = cfg().availabilityUrl || 'data/availability.json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (e) {
    console.warn('[apolo] Disponibilidad no disponible, se asume todo "disponible":', e.message);
    return {};
  }
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
