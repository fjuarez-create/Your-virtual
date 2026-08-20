/* El listado de tareas de la obra, calcado del Figma.

   Aquí llegan las cuatro pastillas de la portada. Antes llevaban a una
   lista de viviendas, y eso obligaba a entrar casa por casa a buscar lo
   que ya te habían contado en la portada: si te dice que hay 16
   completadas esperando visto, lo que quieres ver son esas 16, no las
   nueve casas donde están repartidas.

   Es una sola pantalla para los cuatro estados: el selector de arriba
   cambia de uno a otro sin salir. Y los filtros solo ofrecen lo que
   existe —si no queda nada de pladur, pladur no sale—, así que no se
   puede llegar por descarte a una lista vacía.

   El orden de serie es lo último arriba, como pidió el diseño; en el
   menú están los otros dos: lo que más lleva esperando, para lo que se
   pudre, y por vivienda, que convierte la lista en una ruta de obra. */
import { h, icon, toast } from '../ui.js';
import {
  PROMOCIONES, promocion, unidad, unidades, oficio, estado, ESTADOS, OFICIOS,
} from '../catalog.js';
import * as store from '../store.js';
import {
  cabDiseno, tarjetaTarea, cuandoTarea, hojaFiltroTareas, menuFlotante, menuTarjeta, filaMenu,
  avisoLocal, barraSync,
} from '../piezas.js';
import { ir } from '../app.js';
import { hojaDePuerta, nombreDeFichero } from '../pdf.js';

/** Lo que dice la pantalla cuando no hay ninguna, por estado. */
const VACIO = {
  resuelta: {
    titulo: 'Ninguna tarea completada',
    frase: 'Cuando la obra dé una tarea por arreglada, aparecerá aquí para que le des el visto bueno.',
    salida: { rotulo: 'Revisar tareas pendientes', estado: 'pendiente' },
  },
  verificada: {
    titulo: 'Ninguna tarea verificada',
    frase: 'Aquí se irán guardando todas las que deis por buenas, de la primera a la última.',
    salida: { rotulo: 'Ver lo que falta por verificar', estado: 'resuelta' },
  },
  rechazada: {
    titulo: 'Ninguna tarea rechazada',
    frase: 'Nada devuelto a la obra ahora mismo. Cuando rechacéis una, aparece aquí hasta que la rehagan.',
    salida: { rotulo: 'Revisar tareas completadas', estado: 'resuelta' },
  },
  pendiente: {
    titulo: 'Ninguna tarea pendiente',
    frase: 'No queda trabajo por hacer en la promoción. Si eso no cuadra, revisa lo completado.',
    salida: { rotulo: 'Revisar tareas completadas', estado: 'resuelta' },
  },
};

const ORDENES = [
  { id: 'reciente', rotulo: 'Lo último arriba' },
  { id: 'espera', rotulo: 'Lo que más lleva esperando' },
  { id: 'vivienda', rotulo: 'Por vivienda' },
];

export async function render({ promoId, estadoId = 'resuelta' }) {
  if (!promoId) {
    const activas = PROMOCIONES.filter((x) => x.activa);
    if (activas.length === 1) promoId = activas[0].id;
    else { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }
  }
  const p = promocion(promoId);
  if (!p) { toast('Promoción desconocida', 'err'); ir('#/', { reemplazar: true }); return { contenido: [] }; }
  if (!ESTADOS.some((e) => e.id === estadoId)) estadoId = 'resuelta';

  const todas = await store.tareasDeLaObra(promoId);

  let filtroVivienda = '';
  let filtroOficios = [];
  let orden = 'reciente';

  /* ─── Qué se ve con lo que hay puesto ─── */
  const deEsteEstado = () => todas.filter((x) => x.tarea.estado === estadoId);
  const visibles = () => {
    let lista = deEsteEstado();
    if (filtroVivienda) lista = lista.filter((x) => x.unidadId === filtroVivienda);
    if (filtroOficios.length) lista = lista.filter((x) => filtroOficios.includes(x.tarea.oficio));
    return ordenar(lista);
  };
  const ordenar = (lista) => {
    const copia = [...lista];
    if (orden === 'espera') return copia.sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));
    if (orden === 'vivienda') {
      return copia.sort((a, b) =>
        String(a.unidadId).localeCompare(String(b.unidadId), 'es', { numeric: true })
        || String(b.cuando).localeCompare(String(a.cuando)));
    }
    return copia.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)));
  };

  /* ─── Lo que se puede filtrar: solo lo que existe ───
     Y se recalcula con lo ya elegido, para que ninguna combinación
     lleve a una lista vacía. */
  const viviendasLibres = () => {
    const conTareas = new Set(deEsteEstado()
      .filter((x) => !filtroOficios.length || filtroOficios.includes(x.tarea.oficio))
      .map((x) => x.unidadId));
    return unidades(promoId).filter((u) => conTareas.has(u.id)).map((u) => ({ id: u.id, nombre: u.nombre }));
  };
  const oficiosLibres = () => {
    const conTareas = new Set(deEsteEstado()
      .filter((x) => !filtroVivienda || x.unidadId === filtroVivienda)
      .map((x) => x.tarea.oficio));
    return OFICIOS.filter((o) => conTareas.has(o.id));
  };

  /* ─── La pantalla ─── */
  const selector = h('button.d-selector-estado', {
    onclick: () => menuFlotante((cerrar) => ESTADOS.map((e) => {
      const n = todas.filter((x) => x.tarea.estado === e.id
        && (!filtroVivienda || x.unidadId === filtroVivienda)
        && (!filtroOficios.length || filtroOficios.includes(x.tarea.oficio))).length;
      return filaMenu('listaChecks', `${e.plural} (${n})`, () => { cerrar(); cambiarEstado(e.id); });
    }), { conX: true }),
  }, h('span'), icon('caretAbajo'));

  const bolaFiltros = h('button.d-bola-embudo', {
    'aria-label': 'Filtrar tareas',
    onclick: async () => {
      const r = await hojaFiltroTareas({
        vivienda: filtroVivienda,
        oficios: filtroOficios,
        viviendas: viviendasLibres(),
        oficiosLibres: oficiosLibres(),
      });
      if (!r) return;
      filtroVivienda = r.vivienda;
      filtroOficios = r.oficios;
      pintar();
    },
  }, icon('cursores'));

  const filtros = h('div.d-filtros-tareas');
  const cuantos = h('p.d-cuantos-filtros');
  const lista = h('div.d-lista-tareas');

  /**
   * Al cambiar de estado se conservan los filtros que sigan teniendo
   * sentido. Si la Villa 33 no tiene ninguna rechazada, ese filtro se
   * cae solo: mantenerlo dejaría la pantalla en blanco sin explicar por
   * qué, y quitarlos todos obligaría a ponerlos otra vez cada vez.
   */
  const cambiarEstado = (nuevo) => {
    estadoId = nuevo;
    const hayVivienda = viviendasLibres().some((v) => v.id === filtroVivienda);
    if (filtroVivienda && !hayVivienda) filtroVivienda = '';
    const libres = new Set(oficiosLibres().map((o) => o.id));
    filtroOficios = filtroOficios.filter((id) => libres.has(id));
    ir(`#/tareas/${estadoId}`, { reemplazar: true });
    pintar();
  };

  const pintar = () => {
    const items = visibles();
    selector.querySelector('span').textContent = `${estado(estadoId).plural} (${items.length})`;

    // Las pastillas de lo aplicado, con su única X.
    const piezas = [];
    if (filtroVivienda) piezas.push(h('span.pastilla', null, unidad(filtroVivienda)?.nombre || 'Vivienda'));
    for (const id of filtroOficios) piezas.push(h('span.pastilla', null, oficio(id).nombre));
    if (piezas.length) {
      piezas.push(h('button.quitar', {
        'aria-label': 'Quitar los filtros',
        onclick: () => { filtroVivienda = ''; filtroOficios = []; pintar(); },
      }, icon('x')));
    }
    filtros.replaceChildren(...piezas);
    filtros.style.display = piezas.length ? '' : 'none';
    const n = piezas.length - 1;
    cuantos.textContent = piezas.length ? `Has aplicado ${n} ${n === 1 ? 'filtro' : 'filtros'}` : '';
    cuantos.style.display = piezas.length ? '' : 'none';

    if (!items.length) { lista.replaceChildren(...pantallaVacia()); return; }
    lista.replaceChildren(...items.map((x) => {
      const u = unidad(x.unidadId);
      const o = oficio(x.tarea.oficio);
      return tarjetaTarea({
        cuando: cuandoTarea(x.cuando),
        quien: x.quien ? store.persona(null, x.quien) : null,
        titulo: x.tarea.texto || 'Sin descripción',
        villa: u?.nombre || 'Vivienda',
        // Ninguna tarjeta sin foto: si la tarea es vieja y no llegó a
        // tener ninguna, la tarjeta enseña la cara del oficio. Es
        // genérica y se reconoce como tal, que es justo lo que debe
        // pasar: rellena el hueco sin hacerse pasar por el remate.
        oficioObj: o,
        foto: x.foto,
        alPinchar: () => {
          // De dónde venía, para volver aquí al verificar y seguir
          // bajando por la lista sin dar atrás cada vez. Se apunta con
          // la tarea a la que pertenece: si no, el rastro se queda
          // pegado y la siguiente tarea que se abra desde la ficha de
          // una vivienda acabaría soltando a quien la verifica en esta
          // lista, que no es de donde venía.
          try {
            sessionStorage.setItem('lista-tareas-desde',
              JSON.stringify({ tareaId: x.tarea.id, ruta: `#/tareas/${estadoId}` }));
          } catch { /* modo privado */ }
          ir(`#/l/${x.tarea.listaId}/t/${x.tarea.id}`);
        },
      });
    }));
  };

  /** Sin ninguna: la ilustración, el porqué y una salida útil. */
  const pantallaVacia = () => {
    const hayFiltros = !!filtroVivienda || filtroOficios.length > 0;
    const v = VACIO[estadoId];
    if (hayFiltros) {
      return [
        h('div.d-vacio', null,
          h('img', { src: 'assets/vacio/carpetas.webp', alt: '' }),
          h('h2', null, 'Ninguna tarea con estos filtros'),
          h('p', null, 'Prueba a quitar alguno para ver el resto.')),
        h('div.d-vacio-pie', null,
          h('button.d-boton-topo', {
            onclick: () => { filtroVivienda = ''; filtroOficios = []; pintar(); },
          }, 'Quitar los filtros')),
      ];
    }
    return [
      h('div.d-vacio', null,
        h('img', { src: 'assets/vacio/carpetas.webp', alt: '' }),
        h('h2', null, v.titulo),
        h('p', null, v.frase)),
      h('div.d-vacio-pie', null,
        h('button.d-boton-topo', { onclick: () => cambiarEstado(v.salida.estado) }, v.salida.rotulo)),
    ];
  };

  /* ─── El menú de los tres puntos ─── */
  const menu = async () => {
    const elegido = await menuTarjeta('Tareas', [
      ...ORDENES.map((o) => ({
        id: `orden:${o.id}`,
        icono: orden === o.id ? 'check' : 'listaChecks',
        rotulo: o.rotulo,
      })),
      { id: 'pdf', icono: 'download', rotulo: 'Bajar la lista en PDF' },
    ]);
    if (!elegido) return;
    if (elegido === 'pdf') { bajarPdf(); return; }
    orden = elegido.replace('orden:', '');
    pintar();
  };

  const bajarPdf = () => {
    const items = visibles();
    if (!items.length) { toast('No hay nada que bajar'); return; }
    const rotulo = estado(estadoId).plural;
    const blob = hojaDePuerta({
      vivienda: `Tareas ${rotulo.toLowerCase()}`,
      promocion: p.nombre,
      fecha: new Date().toLocaleDateString('es-ES'),
      autor: store.sesion()?.nombre || '',
      // Cada línea lleva su casa delante: la lista mezcla las cincuenta
      // y en papel no hay chip que lo diga.
      tareas: items.map((x) => ({
        texto: `${unidad(x.unidadId)?.nombre || ''} · ${x.tarea.texto || 'Sin descripción'}`,
        estado: x.tarea.estado,
      })),
    });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: nombreDeFichero(`tareas-${rotulo}`, new Date().toLocaleDateString('es-ES')) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      h('div.d-cab-dentro', null,
        h('button.d-bola', { 'aria-label': 'Volver', onclick: () => ir('#/') }, icon('arrowLeft')),
        h('div.d-titulo', null, 'Tareas'),
        h('button.d-bola', { 'aria-label': 'Más opciones', onclick: menu }, icon('puntos')),
      ),
      avisoLocal() || barraSync(),
      h('div.d-fila-filtro', null, selector, bolaFiltros),
      filtros,
      cuantos,
      lista,
    ],
  };
}
