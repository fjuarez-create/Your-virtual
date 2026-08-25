/* OBRA — las reuniones de cada día, con su acta.

   De arriba a abajo: la cabecera con la bola de la grúa, el día de hoy
   —la reunión en marcha, o el botón de empezarla—, las tareas de obra
   que siguen pendientes vengan de la reunión que vengan, y el archivo
   de reuniones anteriores, cada una con su gente y sus cuentas.

   Todo lo de aquí vive en el servidor y se pide al entrar: sin outbox.
   Una reunión se lleva estando presente y con cobertura; a cambio, el
   sello de las 23:59 lo decide el reloj del servidor y no se puede
   esquivar atrasando el del móvil. */
import { h, icon, toast, grupoAvatares } from '../ui.js';
import * as api from '../api.js';
import * as store from '../store.js';
import { PROMOCIONES, puedeVerificar } from '../catalog.js';
import { cabecera, avisoLocal, barraSync } from '../piezas.js';
import { fechaDeActa, diaDeLaSemana } from './historial.js';
import { lineaDeGente, filaEncargo, tacharEncargo } from '../piezasObra.js';
import { ir, refrescar } from '../app.js';

/* Cuántas tareas pendientes se enseñan de primeras: las demás quedan
   detrás del botón de ver todas, para que el archivo de reuniones no
   se vaya al fondo de la pantalla. */
const DE_PRIMERAS = 5;

export async function render() {
  const p = PROMOCIONES.filter((x) => x.activa)[0] || null;
  if (!p) {
    return { sinTabs: true, clase: 'pantalla-diseno', contenido: [
      h('p.d-epigrafe', null, 'No hay ninguna promoción activa.')] };
  }

  let datos = null;
  let error = null;
  try {
    datos = await api.obraReuniones(p.id);
  } catch (e) {
    // Tres males distintos, tres verdades distintas: sin cobertura; el
    // servidor renqueando (pasa unos segundos mientras se publica una
    // versión); o un error con nombre. «Sin conexión · Error 404» era
    // mentira a medias y asustaba con la WiFi perfecta.
    error = e.codigo === 'red'
      ? { titulo: 'Sin conexión',
          texto: 'Las reuniones de obra se llevan en directo con el servidor: hace falta cobertura para verlas.' }
      : (e.status === 404 || e.status >= 500)
        ? { titulo: 'El servidor no contesta',
            texto: 'Suele ser cosa de unos segundos (por ejemplo, mientras se publica una versión nueva). Vuelve a intentarlo ahora mismo.' }
        : { titulo: 'No se ha podido', texto: e.message };
  }

  const contenido = [
    cabecera({ seccion: 'obra' }),
    h('h1.d-saludo', null, 'Reuniones de obra'),
    avisoLocal() || barraSync(),
  ];

  if (error) {
    contenido.push(
      h('p.d-epigrafe', null, error.titulo),
      h('p.d-nota-pie', { style: { whiteSpace: 'normal' } }, error.texto),
      h('button.d-fantasma', { style: { marginTop: '14px' }, onclick: () => refrescar() },
        'Volver a intentarlo'),
    );
    return { sinTabs: true, clase: 'pantalla-diseno', contenido };
  }

  const hoy = datos.hoy;
  const deHoy = datos.reuniones.find((r) => r.fecha === hoy) || null;
  const anteriores = datos.reuniones.filter((r) => r.fecha !== hoy);
  const df = puedeVerificar(store.sesion());

  /* ─── Hoy ─── */
  contenido.push(h('p.d-epigrafe', null, 'Hoy'));
  if (deHoy) {
    // Sin el «Hoy ·» delante: el epígrafe de arriba ya lo dice.
    contenido.push(tarjetaReunion(deHoy, { esHoy: true }));
  } else if (df) {
    // Sin tarjeta de «Sin empezar»: la quitó Fran en agosto de 2026
    // porque no contaba nada que el epígrafe «Hoy» no dijera ya. Los
    // días sin reunión, aquí solo vive el botón.
    const empezar = h('button.d-boton-negro', {
      onclick: async () => {
        empezar.disabled = true;
        try {
          const r = await api.empezarReunion(p.id);
          ir(`#/obra/r/${r.reunion.id}`);
        } catch (e) {
          empezar.disabled = false;
          toast(e.codigo === 'red' ? 'Sin conexión: la obra se lleva en directo' : e.message, 'err');
        }
      },
    }, 'Comenzar reunión');
    contenido.push(empezar);
  } else {
    contenido.push(h('p.d-nota-pie', null,
      'La reunión la empieza la dirección facultativa o el administrador; en cuanto arranque, aparecerá aquí.'));
  }

  /* ─── Lo pendiente de toda la obra ─── */
  const pendientes = datos.tareasPendientes || [];
  if (pendientes.length) {
    contenido.push(h('p.d-epigrafe', null,
      pendientes.length === 1 ? 'Una tarea de obra pendiente' : `${pendientes.length} tareas de obra pendientes`));
    const lista = h('div');
    let todas = false;
    const tachar = async (e) => { if (await tacharEncargo(e)) refrescar(); };
    const pintar = () => {
      const visibles = todas ? pendientes : pendientes.slice(0, DE_PRIMERAS);
      // La fila abre el acta de la que salió la tarea: el contexto
      // completo —quién estaba, qué más se acordó— vive allí.
      const nodos = visibles.map((e) => filaEncargo(e, {
        alTachar: tachar,
        alAbrir: () => ir(`#/obra/r/${e.reunionId}`),
        origen: true,
      }));
      // A replaceChildren no le valen los nulos como a h(): pintaría
      // la palabra «null» en mitad de la pantalla.
      if (pendientes.length > DE_PRIMERAS && !todas) {
        nodos.push(h('button.d-fantasma', {
          style: { marginTop: '8px' },
          onclick: () => { todas = true; pintar(); },
        }, `Ver las ${pendientes.length} pendientes`));
      }
      lista.replaceChildren(...nodos);
    };
    pintar();
    contenido.push(lista);
  }

  /* ─── El archivo ─── */
  contenido.push(h('p.d-epigrafe', null, 'Reuniones anteriores'));
  if (anteriores.length) {
    contenido.push(h('div.d-actas-dias', null, anteriores.map((r) => tarjetaReunion(r, { esHoy: false }))));
  } else {
    contenido.push(h('p.d-nota-pie', null,
      'Aquí se irá guardando el acta de cada día, con su gente y sus tareas.'));
  }

  return { sinTabs: true, clase: 'pantalla-diseno', contenido };
}

/** La tarjeta de una reunión, con la misma piel que los partes por
    día. La portada tuvo su propia copia hasta agosto de 2026; desde
    entonces allí viste de tarjeta de vivienda y esta queda solo aquí. */
function tarjetaReunion(r, { esHoy }) {
  const chip = (n, texto, clase) => (n ? h('span.d-chip', { class: clase }, `${n} ${texto}`) : null);
  const estado = r.terminada ? 'terminada' : 'en marcha';
  const cuando = esHoy
    ? estado.charAt(0).toUpperCase() + estado.slice(1)
    : diaDeLaSemana(r.fecha, { mayuscula: true });

  // En la pila salen también los invitados: la línea de abajo los
  // cuenta, y que las caras dijeran tres donde el texto dice cuatro
  // descuadraba al que cuenta cabezas.
  const gente = [
    ...(r.asistentes || []).map((id) => store.persona(id)),
    ...(r.invitados || []).map((nombre) => ({ nombre })),
  ];

  const hechas = r.encargos - r.pendientes;
  return h('button.d-acta-dia', {
    class: esHoy ? 'hoy' : '',
    onclick: () => ir(`#/obra/r/${r.id}`),
  },
    h('div.d-acta-dia-cab', null,
      h('div.grow', null,
        h('p.d-acta-dia-cuando', null, cuando),
        h('p.d-acta-dia-fecha', null, fechaDeActa(r.fecha)),
      ),
      grupoAvatares(gente, { tam: 40, max: 3, solape: 13 }),
    ),
    h('p.d-acta-dia-villas', null, lineaDeGente(r)),
    // Pendientes y hechas bastan: el total es la suma y no añade nada.
    h('div.d-acta-dia-chips', null,
      chip(r.pendientes, r.pendientes === 1 ? 'pendiente' : 'pendientes', 'ambar'),
      chip(hechas, hechas === 1 ? 'hecha' : 'hechas', 'verde'),
      r.encargos === 0 ? h('span.d-chip', null, 'sin tareas') : null,
    ),
  );
}
