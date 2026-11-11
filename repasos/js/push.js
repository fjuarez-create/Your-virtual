/* ═══════════════════════════════════════════════════════════════
   push.js — los avisos en el móvil (Web Push).

   Cuando Ezequiel fija una revisión con el cliente o una firma, el
   servidor avisa a todos los móviles apuntados. Apuntarse es cosa de
   cada móvil: el navegador pide permiso, se suscribe con la clave
   pública del servidor y le manda la suscripción.

   En el iPhone solo funciona con la app puesta en la pantalla de
   inicio (es como Apple lo ha decidido): si se abre en Safari a secas,
   aquí se dice y no se intenta.
   ═══════════════════════════════════════════════════════════════ */
import * as api from './api.js';
import * as db from './db.js';

/** Cuánto se deja en paz a quien dijo «ahora no». */
const POSPONER_MS = 3 * 24 * 3600 * 1000;

export function soportado() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window;
}

function esIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function enPantallaDeInicio() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || navigator.standalone === true;
}

/**
 * En qué punto está este móvil:
 *   activados      permiso dado y suscripción viva
 *   pendiente      se puede pedir (todavía no se ha preguntado)
 *   pospuesto      se preguntó hace poco y no se contestó: se deja en paz
 *   apagados       se apagaron en Ajustes: no se vuelven a ofrecer solos
 *   denegados      el móvil los tiene bloqueados; se cambia en sus ajustes
 *   instalar       iPhone en Safari: hay que poner la app en la pantalla de inicio
 *   no-soportado   este navegador no los admite (o no hay servidor)
 */
export async function estado() {
  if (!api.HAY_SERVIDOR) return 'no-soportado';
  if (!soportado()) return esIos() && !enPantallaDeInicio() ? 'instalar' : 'no-soportado';
  if (Notification.permission === 'denied') return 'denegados';
  if (Notification.permission === 'granted' && await suscripcionActual()) return 'activados';
  if (await db.meta.get('push-apagado').catch(() => null)) return 'apagados';
  const pospuesto = await db.meta.get('push-pospuesto').catch(() => null);
  if (pospuesto && Date.now() - Number(pospuesto) < POSPONER_MS) return 'pospuesto';
  return 'pendiente';
}

/**
 * La suscripción de este navegador, si la hay. Mira el registro que
 * haya AHORA, sin esperar a que el service worker termine de instalarse:
 * esto lo pregunta la portada al pintarse, y la primera instalación
 * baja sesenta ficheros. Si todavía no hay registro, no hay suscripción.
 */
async function suscripcionActual() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch { return null; }
}

/** El service worker activo, o null si en diez segundos no lo hay. */
function registro() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((r) => setTimeout(() => r(null), 10000)),
  ]);
}

/** La clave pública VAPID (base64url) en los bytes que pide el navegador. */
function claveABytes(texto) {
  const relleno = '='.repeat((4 - (texto.length % 4)) % 4);
  const b64 = (texto + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(b64);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

/** ¿La suscripción está atada a esta clave pública? Si el navegador no
    la guarda, se da por buena. */
function conLaClave(sub, clave) {
  const atada = sub.options?.applicationServerKey;
  if (!atada) return true;
  const a = new Uint8Array(atada);
  if (a.length !== clave.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== clave[i]) return false;
  return true;
}

/**
 * La suscripción de este navegador atada a la clave ACTUAL del
 * servidor. Si el servidor cambió de pareja (base restaurada de una
 * copia, meta borrada), la suscripción vieja ya no sirve —el servicio
 * contesta 403 a todo— y se rehace; si no, el móvil se quedaría
 * «activado» sin que le llegara nada.
 */
async function suscribirConLaClave(reg) {
  const { publica } = await api.pushClave();
  const clave = claveABytes(publica);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !conLaClave(sub, clave)) {
    try { await sub.unsubscribe(); } catch { /* ya estaba */ }
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  return sub;
}

function aJson(sub) {
  const j = sub.toJSON();
  return { endpoint: j.endpoint, p256dh: j.keys?.p256dh || '', auth: j.keys?.auth || '' };
}

/**
 * Pide permiso y apunta el móvil. Devuelve el estado en que queda.
 * OJO: en iOS y en Safari el permiso solo se puede pedir al calor de
 * un toque, así que esto se llama desde el botón, no al arrancar.
 */
export async function activar() {
  if (!soportado()) return estado();
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    if (permiso === 'default') await db.meta.set('push-pospuesto', String(Date.now()));
    return permiso === 'denied' ? 'denegados' : 'pospuesto';
  }
  const reg = await registro();
  if (!reg) throw new Error('La aplicación no ha terminado de instalarse. Vuelve a intentarlo en un momento.');
  const sub = await suscribirConLaClave(reg);
  await api.pushSuscribir(aJson(sub));
  await db.meta.del('push-pospuesto').catch(() => {});
  await db.meta.del('push-apagado').catch(() => {});
  return 'activados';
}

/** Da de baja este móvil, en el servidor y en el navegador. */
export async function desactivar() {
  // Queda la marca: quien los apaga no quiere que la portada se los
  // vuelva a ofrecer en cada visita. Se encienden en Ajustes.
  await db.meta.set('push-apagado', '1').catch(() => {});
  const sub = await suscripcionActual();
  if (!sub) return;
  try { await api.pushBaja(sub.endpoint); } catch { /* el servidor lo borrará solo cuando falle */ }
  try { await sub.unsubscribe(); } catch { /* ya estaba */ }
}

/** «Ahora no»: se deja de ofrecer unos días. */
export async function posponer() {
  await db.meta.set('push-pospuesto', String(Date.now()));
}

/**
 * Al arrancar: si el móvil ya está apuntado se le vuelve a decir al
 * servidor con qué usuario, que en un móvil de obra entra hoy uno y
 * mañana otro, y el aviso no se manda a quien hizo el cambio.
 */
export async function reafirmar() {
  try {
    if (!api.HAY_SERVIDOR || !soportado() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !(await reg.pushManager.getSubscription())) return;
    // Y de paso se comprueba que siga atada a la clave actual del servidor.
    await api.pushSuscribir(aJson(await suscribirConLaClave(reg)));
  } catch { /* sin red se reintenta en el siguiente arranque */ }
}

/** Un aviso de prueba a los móviles de quien lo pide. */
export const prueba = () => api.pushPrueba();
