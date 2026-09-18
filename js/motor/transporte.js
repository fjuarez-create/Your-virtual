/* ═══════════════════════════════════════════════════════════════
   transporte.js — El cable entre la interfaz y quien pinta el 3D.

   La interfaz no sabe si debajo hay three.js o Unreal: habla con los
   mensajes de docs/PROTOCOLO_STREAMING.md —{ orden, valor } hacia fuera,
   { evento, valor } hacia dentro— y este módulo los lleva y los trae.

   Dos extremos posibles:

   · Web UI (Tracer Interactive), dentro del .exe. El plugin expone el
     objeto global `ue.interface`: la página habla con Blueprint llamando a
     `ue.interface.broadcast(nombre, jsonEnTexto)` (el widget lo recibe en
     «On Interface Event» con Name y Data) y, para la vuelta, Blueprint llama
     con el nodo «Call» a la función que la página haya definido en
     `ue.interface.<nombre>(datos)`. Aquí todo viaja por un único nombre,
     `apolo`, con el JSON del protocolo dentro: un manejador por lado y el
     resto se decide por `orden`/`evento`. Las versiones antiguas del plugin
     exponían además una función global `ue4(nombre, datos)`; se acepta
     también.

   · Simulador, en un navegador normal, para probar la interfaz sin Unreal:
     apunta lo que se envía en `window.__mensajes`, contesta `listo` al
     arrancar y deja `window.__simularEvento(evento, valor)` para meter
     eventos desde una prueba o desde la consola.

   Los nombres de Web UI vienen de su documentación (cdn.tracerinteractive.com/
   webui/documentation.pdf) y de proyectos que lo usan, no de una prueba
   dentro del .exe: la sesión que monte el widget los confirma aquí, en un
   solo sitio, y el resto de la interfaz no se entera.
   ═══════════════════════════════════════════════════════════════ */

const CANAL = 'apolo';
const ESPERA_ANFITRION_MS = 30_000;
const SONDEO_MS = 250;

/* Web UI puede no haber inyectado aún sus globales cuando corre este módulo:
   se vuelve a mirar, en cada envío y por sondeo, hasta dar con él. */
function anfitrion() {
  const ui = window.ue && window.ue.interface;
  if (ui && typeof ui.broadcast === 'function') return (m) => ui.broadcast(CANAL, m);
  if (typeof window.ue4 === 'function') return (m) => window.ue4(CANAL, m);
  return null;
}

/* Según la versión, Web UI entrega el JSON como objeto o como cadena. */
function normalizar(datos) {
  if (typeof datos === 'string') { try { return JSON.parse(datos); } catch { return null; } }
  return datos && typeof datos === 'object' ? datos : null;
}

export function crearTransporte({ simulador = false } = {}) {
  const oyentes = new Set();
  const repartir = (crudo) => {
    const mensaje = normalizar(crudo);
    if (!mensaje || typeof mensaje.evento !== 'string') return;
    for (const fn of oyentes) fn(mensaje);
  };

  /* Camino Blueprint → página: un único punto de entrada, registrado desde
     el principio para que el widget lo encuentre en cuanto llame. Si el
     plugin sustituyera `ue.interface` por el suyo después de esto, el sondeo
     de abajo lo vuelve a colgar. */
  const registrar = () => {
    window.ue = window.ue || {};
    window.ue.interface = window.ue.interface || {};
    if (window.ue.interface[CANAL] !== repartir) window.ue.interface[CANAL] = repartir;
  };
  registrar();

  const transporte = {
    tipo: simulador ? 'simulador' : 'webui',
    conectado: false,
    alRecibir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    enviar(mensaje) { /* se sustituye abajo según el extremo */ },
  };

  if (simulador) {
    window.__mensajes = [];
    window.__simularEvento = (evento, valor = null) => repartir({ evento, valor });
    transporte.conectado = true;
    transporte.enviar = (mensaje) => { window.__mensajes.push(mensaje); };
    setTimeout(() => repartir({ evento: 'listo', valor: null }), 300);
    console.info('[apolo] transporte: simulador (sin Unreal); mensajes en window.__mensajes');
    return transporte;
  }

  /* Web UI. Lo que se envíe antes de que el plugin exista se guarda y sale
     en orden en cuanto aparece; si no aparece en medio minuto, se avisa una
     vez y se sigue guardando por si acaso. */
  const cola = [];
  let enviarReal = anfitrion();
  let avisado = false;
  const inicio = Date.now();
  const buscar = () => {
    if (enviarReal) return true;
    registrar();
    enviarReal = anfitrion();
    transporte.conectado = !!enviarReal;
    if (enviarReal) {
      console.info('[apolo] transporte: Web UI conectado');
      while (cola.length) enviarReal(JSON.stringify(cola.shift()));
    } else if (!avisado && Date.now() - inicio > ESPERA_ANFITRION_MS) {
      avisado = true;
      console.warn('[apolo] transporte: no aparece ue.interface.broadcast (ni ue4); ¿está la página dentro de Web UI?');
    }
    return !!enviarReal;
  };
  transporte.conectado = !!enviarReal;
  const sondeo = setInterval(() => { if (buscar() || avisado) clearInterval(sondeo); }, SONDEO_MS);
  transporte.enviar = (mensaje) => {
    if (!buscar()) { cola.push(mensaje); return; }
    enviarReal(JSON.stringify(mensaje));
  };
  return transporte;
}
