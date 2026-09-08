/* La home del rediseño 2026, calcada del Figma de Fran.

   De arriba a abajo: la cara de quien mira (que lleva a Ajustes), las
   tres bolas de navegación, el saludo del día, los tres banners de
   estado, el módulo de Brassie con su anillo, y el muro de comentarios
   y feedback coloreado por estado, con su caja de escribir.

   Los tres banners cuentan LO QUE HAY AHORA MISMO, no lo que ha pasado
   desde que uno miró: beige, las completadas que esperan visto bueno;
   verde, todas las verificadas de la obra —que va subiendo sola salvo
   que a alguna se le cambie el estado—; rojo, las que están rechazadas
   en este momento y que se vacía según se van rehaciendo. Las tres
   salen de la misma cuenta, así que ninguna puede contradecir a otra.

   La misma pantalla para técnicos y para constructora: solo cambia el
   saludo, que al jefe de obra no le baila con los días. */
import { h, icon, avatar, toast, fechaCorta, hora } from '../ui.js';
import * as store from '../store.js';
import * as api from '../api.js';
import { PROMOCIONES, unidad, estado } from '../catalog.js';
import { avisoLocal, barraSync, bannerMordido as banner, cabecera, tarjetaVilla, cuandoVilla } from '../piezas.js';
import { tarjetaReunionViva } from '../piezasObra.js';
import { ir, conFiltros, refrescar } from '../app.js';

/* El saludo de cazar repasos se retiró en agosto de 2026, cuando la
   portada dejó de ser solo de repasos: desde entonces el que manda es
   el nombre del proyecto, decidido por Fran sobre la maqueta. */

/* El banner con el mordisco se mudó a piezas.js: lo comparte con el
   aviso de recorrido a medias de la ficha de la vivienda. Aquí llega
   con el nombre de siempre. */

/* Cuántos minutos seguidos cuentan como la misma tanda de trabajo. */
const RAFAGA = 10 * 60 * 1000;

/**
 * Junta las ráfagas. Verificar veinte repasos de una vivienda es una
 * sola cosa que ha pasado, y contarla veinte veces tapa todo lo demás:
 * los rechazos del día anterior, lo que escribió alguien, la tarea que
 * acaba de entrar. Se juntan las entradas seguidas que comparten
 * persona, vivienda y estado y caen en el mismo rato.
 */
function juntarRafagas(muro) {
  const salida = [];
  for (const n of muro) {
    const previa = salida[salida.length - 1];
    const misma = previa && previa.tipo === 'tarea' && n.tipo === 'tarea'
      && previa.estado === n.estado && previa.quien === n.quien
      && previa.unidadId === n.unidadId
      && Math.abs(new Date(previa.cuando) - new Date(n.cuando)) <= RAFAGA;
    if (misma) {
      previa.cuantas += 1;
      // Si los textos no coinciden no se enseña ninguno: poner el de
      // uno solo haría creer que ese es el motivo de los demás.
      if (previa.texto !== n.texto) previa.mismoTexto = false;
      continue;
    }
    salida.push({ ...n, cuantas: 1, mismoTexto: true });
  }
  return salida;
}

/* La tarjeta de la última reunión vive ahora en piezasObra.js
   (tarjetaReunionViva): la comparte con el «Hoy» de la pantalla de
   reuniones, porque la misma reunión no puede vestir dos trajes. */

/* Cómo se lee una tanda: «6 repasos rechazados». */
const PARTICIPIO = {
  rechazada: 'rechazados',
  verificada: 'verificados',
  resuelta: 'completados',
  pendiente: 'nuevos',
};

/** En el muro: «Andrea, ayer a las 11:40 h». */
function cuandoMuro(nombre, iso) {
  const pila = String(nombre || '').trim().split(/\s+/)[0] || 'Alguien';
  if (!iso) return pila;
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `${pila}, hoy a las ${hora(iso)} h`;
  if (d.toDateString() === ayer.toDateString()) return `${pila}, ayer a las ${hora(iso)} h`;
  return `${pila}, ${fechaCorta(iso)}`;
}

export async function render() {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas[0] || null;
  if (!p) {
    return { sinTabs: true, clase: 'pantalla-diseno', contenido: [
      h('p.d-epigrafe', null, 'No hay ninguna promoción activa.')] };
  }

  const yo = store.sesion();
  const d = await store.datosHome(p.id);
  const c = d.conteo;

  /* La obra en la portada: la última reunión y sus tareas pendientes.
     Se pregunta al servidor —la obra va siempre en línea— y, si no hay
     cobertura o todavía no hubo ninguna reunión, la portada sale sin
     este bloque: lo de repasos vive en el almacén local y no espera. */
  let obra = null;
  try { obra = await api.obraEstado(p.id); } catch { obra = null; }

  const pct = c.total ? Math.round((100 * c.hechas) / c.total) : 0;

  /* ─── La actividad reciente ─── */
  const actividad = juntarRafagas(d.muro).slice(0, 14);
  const muro = h('div.d-muro', null, actividad.length ? actividad.map((n) => {
    const e = n.estado ? estado(n.estado) : null;
    const clase = n.estado === 'rechazada' ? 'rechazada'
      : n.estado === 'verificada' ? 'verificada'
      : n.estado === 'resuelta' ? 'completada' : 'pendiente';
    const villa = n.unidadId ? (unidad(n.unidadId)?.nombre || '') : 'Brassie';
    const tanda = n.cuantas > 1;
    // Una tanda no puede abrir «la» tarea, porque son varias: lleva a
    // la lista de ese estado, que es donde están todas.
    const abre = n.tipo !== 'tarea' ? null
      : tanda ? () => ir(`#/tareas/${n.estado}`)
        : () => ir(`#/l/${n.listaId}/t/${n.tareaId}`);
    return h(abre ? 'button.d-nota' : 'div.d-nota', { class: clase, onclick: abre },
      h('div.d-nota-cab', null,
        avatar(store.persona(n.quienId, n.quien), { tam: 36 }),
        h('div.d-nota-quien', null,
          h('div.d-nota-villa', null, villa),
          h('div.d-nota-cuando', null, cuandoMuro(n.quien, n.cuando)),
        ),
        e && n.tipo === 'tarea' ? h('span.d-nota-estado', null, e.nombre) : null,
      ),
      tanda
        ? h('p.d-nota-texto', null,
            h('strong', null, `${n.cuantas} repasos ${PARTICIPIO[n.estado] || 'movidos'}`),
            n.mismoTexto && n.texto ? ` · ${n.texto}` : '')
        : h('p.d-nota-texto', null, n.texto || 'Sin texto.'),
    );
  }) : h('p.d-nota', null,
    h('p.d-nota-texto', { style: { margin: '0', color: 'var(--d-gris)' } },
      'Aquí va apareciendo lo que pasa en la obra: repasos nuevos, '
      + 'completados, verificados y rechazados, y lo que se escriba aquí abajo.')));

  /* ─── Escribir en el muro ─── */
  const caja = h('input', { type: 'text', placeholder: 'Escribe lo que quieras contar…', autocapitalize: 'sentences' });
  const mandar = async () => {
    const texto = caja.value.trim();
    if (!texto) return;
    await store.escribirMensaje('general:' + p.id, p.id, texto);
    caja.value = '';
    toast('Publicado en el muro');
    refrescar();
  };
  caja.addEventListener('keydown', (e) => { if (e.key === 'Enter') mandar(); });
  // Apagado mientras la caja está vacía: un avión encendido sobre una
  // caja en blanco promete algo que al pulsarlo no pasa.
  const botonMandar = h('button.d-escribir-mandar',
    { 'aria-label': 'Publicar', disabled: true, onclick: mandar }, icon('avionPapel'));
  caja.addEventListener('input', () => { botonMandar.disabled = !caja.value.trim(); });

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      /* La cabecera del diseño: la cara y las tres bolas. */
      cabecera({ seccion: 'inicio' }),

      h('h1.d-saludo', null, p.nombre),
      avisoLocal() || barraSync(),

      // Desplegado a mano: el pintor no aplana listas anidadas.
      ...(obra && obra.ultima ? [
        h('p.d-epigrafe', null, 'Última reunión de obra'),
        tarjetaReunionViva(obra.ultima, obra.hoy),
      ] : []),
      ...(obra && obra.pendientes ? [
        banner({
          clase: 'negro',
          // El texto lo fijó Fran: «órdenes» porque aquí caerán también
          // las del libro de órdenes cuando exista.
          rotulo: 'Tareas y órdenes pendientes',
          cifra: obra.pendientes,
          adonde: '#/obra',
        }),
      ] : []),

      h('p.d-epigrafe', null, 'Pendiente de revisión por la DF'),
      banner({
        clase: 'beige',
        rotulo: 'Repasos completados por verificar',
        cifra: c.esperando,
        adonde: '#/tareas/resuelta',
      }),

      h('p.d-epigrafe', null, 'Repasos revisados por la DF'),
      banner({
        clase: 'verde',
        rotulo: 'Repasos verificados',
        cifra: c.hechas,
        adonde: '#/tareas/verificada',
      }),
      banner({
        clase: 'rojo',
        rotulo: 'Repasos rechazados',
        cifra: c.rechazadas,
        adonde: '#/tareas/rechazada',
      }),

      h('p.d-epigrafe', null, p.nombre),
      // «Por cerrar» y no «pendientes»: la cifra suma TODO lo que aún
      // no tiene el visto bueno de la DF (pendientes + completados +
      // rechazados), que es lo mismo que cuentan el 1/3, el anillo y
      // el color de la propia tarjeta. Llamarla «pendientes» chocaba
      // con la lista estricta de Pendientes: prometía 2 y enseñaba 1
      // (lo cazó Fran el primer día). La tarjeta aterriza en la
      // vista-suma, que enseña exactamente lo que la cifra promete.
      tarjetaVilla({
        titulo: `${d.sinVerificar} ${d.sinVerificar === 1 ? 'repaso por cerrar' : 'repasos por cerrar'}`,
        cuando: cuandoVilla(d.ultimaSinVerificar),
        caras: d.caras,
        hechas: c.hechas,
        total: c.total,
        pct,
        alPinchar: () => ir('#/tareas/por-cerrar'),
      }),

      h('p.d-epigrafe', null, 'Actividad reciente'),
      muro,
      h('div.d-escribir', null,
        caja,
        botonMandar,
      ),
    ],
  };
}
