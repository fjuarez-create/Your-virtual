/* Piezas del mundo de la obra: las filas de tareas de reunión y la
   hoja de crearlas o editarlas. Las comparten la pantalla de Obra y la
   de cada reunión.

   OJO con el diccionario de la casa: en pantalla estas son las
   «tareas» —las que nacen de una reunión de obra, con responsable y
   fecha límite—, y por dentro se llaman ENCARGOS para no chocar jamás
   con la tabla `tareas`, que guarda repasos (ver CLAUDE.md).

   Todo lo de la obra va en línea, sin outbox: cada botón habla con el
   servidor en el momento y, si no hay cobertura, lo dice en vez de
   fingir que guardó. */
import { h, icon, toast, sheet, confirmSheet, hora, anillo, grupoAvatares } from './ui.js';
import * as api from './api.js';
import * as store from './store.js';
import { unidades, unidad } from './catalog.js';
import { menuFlotante, filaMenu, hojaFecha, tramoAvance } from './piezas.js';
import { fechaDeActa, diaDeLaSemana } from './views/historial.js';
import { ir } from './app.js';

/**
 * La tarjeta VIVA de una reunión, con la misma piel que las tarjetas
 * de vivienda: el cuándo arriba (sin icono: lo quitó Fran el día del
 * estreno), las caras de la mesa, los dos chips con las cuentas de sus
 * tareas y el anillo del avance asomando por la esquina. La comparten
 * la portada («Última reunión de obra») y el «Hoy» de la pantalla de
 * reuniones, porque la misma reunión no puede vestir dos trajes (lo
 * pidió Fran al ver las dos a la vez). El archivo de reuniones
 * anteriores no la usa: lo pasado viste de parte.
 */
export function tarjetaReunionViva(r, hoy) {
  // En las caras van también los invitados —la mesa es la mesa, tenga
  // cuenta o no—, pero recortadas a tres ANTES de pintar: así nunca
  // sale la bolita «+n», que esta piel no lleva y que en un móvil
  // estrecho choca con el cuándo.
  const gente = [
    ...(r.asistentes || []).map((id) => store.persona(id)),
    ...(r.invitados || []).map((nombre) => ({ nombre })),
  ].slice(0, 3);
  const hechas = r.encargos - r.pendientes;
  const pct = r.encargos ? Math.round((100 * hechas) / r.encargos) : 0;
  const t = tramoAvance(pct);
  const chipPct = pct === 100 && r.encargos ? 'macizo' : t.clase;
  const esDeHoy = r.fecha === hoy;
  // La hora que se enseña es la de EMPEZAR, decidido por Fran: el
  // acta se cierra siempre a las 23:59 (salvo la cortesía), así que
  // la hora de cierre no cuenta nada. «Comenzada», con el verbo de su
  // propio botón («Comenzar reunión»).
  const cuando = esDeHoy
    ? `Comenzada hoy a las ${hora(r.empezada)} h`
    : `Comenzada a las ${hora(r.empezada)} h`;
  // El punto vivo va solo en la de hoy: terminada o no, hasta las
  // 23:59 sigue abierta, y eso es justo lo que la luz cuenta. Es
  // hermano del título, no hijo: dentro lo recortaría el overflow de
  // los puntos suspensivos y el aura saldría rebanada.
  return h(`button.d-tarjeta.tramo-${t.clase}${esDeHoy ? '.viva' : ''}`,
    { onclick: () => ir(`#/obra/r/${r.id}`) },
    h('span.d-mordida'),
    h('span.d-mordida-esquina'),
    h('div.d-tarjeta-cab', null,
      h('span', null, cuando),
      h('span.d-tarjeta-caras', null, grupoAvatares(gente, { tam: 36, max: 3, solape: 12 })),
    ),
    esDeHoy ? h('span.d-punto-vivo') : null,
    // La de hoy se llama por su nombre; una pasada, por su día: lo
    // que uno se pregunta al verla es de cuándo es. Eligió Fran la
    // fecha de título entre cinco nombres (agosto de 2026).
    h('div.d-tarjeta-titulo', null, esDeHoy
      ? 'Reunión de obra'
      : `${diaDeLaSemana(r.fecha, { mayuscula: true })} ${fechaDeActa(r.fecha)}`),
    h('div.d-tarjeta-pie', null,
      // En minúscula, como el mismo chip de la pantalla de obra: la
      // misma reunión no puede decir la misma palabra con dos cajas.
      r.encargos
        ? h('span.d-chip.grande', null, icon('listaChecks'), `${hechas} / ${r.encargos}`)
        : h('span.d-chip.grande', null, 'sin tareas'),
      r.encargos
        ? h('span.d-chip.grande', { class: chipPct }, icon('fuego'), `${pct}%`)
        : null,
    ),
    h('span.d-tarjeta-anillo', null, anillo(pct, { tam: 55, grosor: 5, etiqueta: false })),
  );
}

/** «Fran, Alba y Paco (invitado)» — la línea de gente de una reunión. */
export function lineaDeGente(r) {
  const nombres = (r.asistentes || [])
    .map((id) => String(store.persona(id).nombre || '').trim().split(/\s+/)[0])
    .filter(Boolean);
  for (const inv of r.invitados || []) {
    nombres.push(`${String(inv).split(/\s+/)[0]} (invitado)`);
  }
  if (!nombres.length) return 'Sin asistentes apuntados';
  if (nombres.length === 1) return nombres[0];
  const ultimo = nombres[nombres.length - 1];
  // «Francisco e Íñigo», no «y Íñigo»: la conjunción cambia ante i.
  const conjuncion = /^(i|í|hi)/i.test(ultimo) ? 'e' : 'y';
  return `${nombres.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}

/** La segunda línea de una tarea: alcance, responsable, fecha y origen. */
export function subDeEncargo(e, { origen = false } = {}) {
  const partes = [];
  partes.push(e.general ? 'General' : (unidad(e.unidadId)?.nombre || 'Vivienda'));
  if (e.responsableNombre) partes.push(`para ${e.responsableNombre}`);
  if (e.fechaLimite) partes.push(`antes del ${fechaDeActa(e.fechaLimite)}`);
  if (origen && e.reunionFecha) partes.push(`de la reunión del ${diaDeLaSemana(e.reunionFecha)} ${fechaDeActa(e.reunionFecha)}`);
  if (e.estado === 'hecho' && e.hechoPorNombre) partes.push(`la tachó ${e.hechoPorNombre}`);
  return partes.join(' · ');
}

/**
 * Una tarea de reunión en pastilla. El redondel de tachar es un botón
 * propio: tacharla puede hacerlo cualquiera del equipo y en cualquier
 * momento, también con el acta ya sellada. Abrirla para editar
 * (`alAbrir`) solo se ofrece a quien puede y mientras el acta está
 * abierta: eso lo decide quien pinta.
 */
export function filaEncargo(e, { alTachar, alAbrir, origen = false } = {}) {
  const bola = h('button.d-encargo-bola', {
    'aria-label': e.estado === 'hecho' ? 'Volver a dejarla pendiente' : 'Marcar como hecha',
    onclick: alTachar ? () => alTachar(e) : null,
  }, icon('check'));
  const cuerpo = h(alAbrir ? 'button.grow' : 'div.grow',
    alAbrir ? { onclick: () => alAbrir(e) } : null,
    h('div.d-encargo-texto', null, e.texto),
    h('div.d-encargo-sub', null, subDeEncargo(e, { origen })),
  );
  return h('div.d-encargo', { class: e.estado === 'hecho' ? 'hecho' : '' }, bola, cuerpo);
}

/** Tacha o destacha contra el servidor. Devuelve true si se guardó. */
export async function tacharEncargo(e) {
  try {
    await api.editarEncargo(e.id, { estado: e.estado === 'hecho' ? 'pendiente' : 'hecho' });
    return true;
  } catch (err) {
    toast(err.codigo === 'red' ? 'Sin conexión: no se ha guardado' : err.message, 'err');
    return false;
  }
}

/**
 * La hoja de los datos de una tarea de reunión: texto, alcance,
 * responsable y fecha. Es la misma para las tareas de verdad y para
 * las propuestas de la IA; lo único que cambia es qué se hace al
 * guardar, y eso lo pone quien la abre.
 *
 * Resuelve a { valores } al guardar, { borrar: true } si se borra, o
 * null si se cierra sin más.
 */
export function hojaDatosDeTarea({ promoId, valores = null, titulo, botonTexto, conBorrar = false, textoBorrar = 'Borrar la tarea' }) {
  return sheet((cerrar) => {
    let general = valores ? !!valores.general : true;
    let unidadId = valores?.unidadId || '';
    let responsable = valores && (valores.responsableId || valores.responsableNombre)
      ? { id: valores.responsableId || null, nombre: valores.responsableNombre }
      : null;
    let fechaLimite = valores?.fechaLimite || '';

    const area = h('textarea.d-area', {
      placeholder: 'Qué hay que hacer…', autocapitalize: 'sentences', rows: 3,
    });
    if (valores) area.value = valores.texto || '';

    const selecto = (alPinchar) => {
      const b = h('button.d-desplegable', { style: { width: '100%' }, onclick: alPinchar },
        h('span'), icon('caretAbajo'));
      return b;
    };
    const campo = (rotulo, pastilla) => h('div.d-campo', null,
      h('label.d-campo-rotulo', null, rotulo), pastilla);

    /* Toda la obra o una vivienda: el caso normal es el general
       —«Limpiar la obra»—, así que es el de serie. */
    const selAlcance = selecto(() => {
      menuFlotante((cerrarMenu) => [
        filaMenu(null, 'Toda la obra (general)', () => { cerrarMenu(); general = true; unidadId = ''; repintar(); }),
        ...unidades(promoId).slice(0, 60).map((v) => filaMenu(null, v.nombre, () => {
          cerrarMenu(); general = false; unidadId = v.id; repintar();
        })),
      ], { conX: true });
    });

    const selResponsable = selecto(() => {
      menuFlotante((cerrarMenu) => [
        filaMenu(null, 'Sin responsable', () => { cerrarMenu(); responsable = null; repintar(); }),
        ...store.equipo().slice(0, 60).map((p) => filaMenu(null, p.nombre, () => {
          cerrarMenu(); responsable = { id: p.id, nombre: p.nombre }; repintar();
        })),
        filaMenu(null, 'Alguien de fuera…', async () => {
          cerrarMenu();
          const nombre = await pedirNombre('¿Quién se encarga?', responsable?.id ? '' : (responsable?.nombre || ''));
          if (nombre) { responsable = { id: null, nombre }; repintar(); }
        }),
      ], { conX: true });
    });

    // El calendario del propio diseño, el mismo que en los repasos.
    const selFecha = selecto(async () => {
      const f = await hojaFecha(fechaLimite ? `${fechaLimite}T12:00:00.000Z` : null);
      if (f === null) return;
      fechaLimite = f ? String(f).slice(0, 10) : '';
      repintar();
    });

    const guardar = h('button.d-boton-negro', {
      onclick: () => {
        const texto = area.value.trim();
        if (!texto) return;
        cerrar({ valores: {
          texto,
          general,
          unidadId,
          responsableId: responsable?.id || null,
          responsableNombre: responsable?.nombre || '',
          fechaLimite,
        } });
      },
    }, botonTexto);

    const repintar = () => {
      poner(selAlcance, general ? 'Toda la obra (general)' : (unidad(unidadId)?.nombre || 'Elegir vivienda'), general || !!unidadId);
      poner(selResponsable, responsable?.nombre || 'Sin responsable', !!responsable);
      poner(selFecha, fechaLimite ? `Antes del ${fechaDeActa(fechaLimite)}` : 'Sin fecha límite', !!fechaLimite);
      guardar.disabled = !area.value.trim() || (!general && !unidadId);
    };
    area.addEventListener('input', repintar);
    repintar();
    setTimeout(() => { if (!valores) area.focus(); }, 60);

    return [
      h('h2.title', null, titulo),
      area,
      campo('Dónde', selAlcance),
      campo('Quién se encarga', selResponsable),
      campo('Para cuándo', selFecha),
      guardar,
      conBorrar ? h('button.btn.ghost.full', {
        onclick: async () => {
          if (!await confirmSheet({
            title: '¿Borrar esta tarea?',
            text: 'Desaparece del acta y de los pendientes.',
            ok: 'Borrar', danger: true,
          })) return;
          cerrar({ borrar: true });
        },
      }, textoBorrar) : null,
    ];
  });
}

/**
 * La hoja de crear o editar una tarea de reunión DE VERDAD: la de
 * datos, más la llamada al servidor. Resuelve a true si algo cambió,
 * para que quien la abrió sepa si tiene que repintar.
 */
export async function hojaEncargo({ reunionId, promoId, encargo = null }) {
  const salida = await hojaDatosDeTarea({
    promoId,
    valores: encargo,
    titulo: encargo ? 'Editar la tarea' : 'Tarea de la reunión',
    botonTexto: encargo ? 'Guardar los cambios' : 'Apuntar la tarea',
    conBorrar: !!encargo,
  });
  if (!salida) return false;
  try {
    if (salida.borrar) {
      await api.editarEncargo(encargo.id, { borrada: true });
      toast('Tarea borrada');
    } else if (encargo) {
      await api.editarEncargo(encargo.id, salida.valores);
      toast('Tarea guardada');
    } else {
      await api.crearEncargo({ reunionId, ...salida.valores });
      toast('Tarea apuntada');
    }
    return true;
  } catch (err) {
    avisarDeError(err);
    return false;
  }
}

/** El aviso que corresponde: sin cobertura, acta sellada o lo que diga el servidor. */
export function avisarDeError(err) {
  if (err?.codigo === 'red') toast('Sin conexión: la obra se lleva en directo', 'err');
  else if (err?.codigo === 'sellada') toast('El acta de ese día ya está sellada', 'err');
  else if (err?.codigo === 'grabando-otra') toast(err?.message || 'Otra persona ya está grabando esta reunión', 'err');
  else toast(err?.message || 'No se pudo guardar', 'err');
}

function poner(desplegable, textoVisible, puesto) {
  desplegable.querySelector('span').textContent = textoVisible;
  desplegable.classList.toggle('puesto', !!puesto);
}

export function pedirNombre(titulo, valor) {
  return sheet((cerrar) => {
    const caja = h('input.input', { type: 'text', value: valor || '', maxlength: 80, autocomplete: 'off' });
    const listo = () => { const t = caja.value.trim(); if (t) cerrar(t); };
    caja.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') listo(); });
    setTimeout(() => caja.focus(), 60);
    return [
      h('h2.title', null, titulo),
      caja,
      h('button.btn.accent.full', { style: { marginTop: '14px' }, onclick: listo }, 'Vale'),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
    ];
  });
}
