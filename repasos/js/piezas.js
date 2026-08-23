/* ═══════════════════════════════════════════════════════════════
   piezas.js — componentes compartidos entre pantallas: cabecera con
   botón de volver, cinta de sincronización y fila de lista de repaso.
   ═══════════════════════════════════════════════════════════════ */
import {
  h, icon, sheet, toast, confirmSheet, avatar, grupoAvatares, anillo,
  logoUnik, fechaCorta, fechaRelativa, hora,
} from './ui.js';
import * as media from './media.js';
import * as store from './store.js';
import * as api from './api.js';
import {
  unidad, oficio, estado, rebotada, imagenDeOficio, ESTADOS, OFICIOS, ZONAS, PLANTAS,
} from './catalog.js';
import { ir, conFiltros } from './app.js';

/* Medidas de la cabecera, en un sitio para que las dos —la de las
   raíces y la de dentro— no se puedan separar nunca. */
const ALTO_LOGO = 14.4;    // 16 − 10 %
const TAM_CUENTA = 41;     // 55 − 25 %

/**
 * Cabecera de las cuatro pantallas con bolitas: el logotipo a la
 * izquierda, la cuenta a la derecha y debajo el titular a todo lo ancho.
 *
 * Aquí NO hay flecha de volver, y es a propósito: son las cuatro raíces
 * de la app, no hay un atrás al que ir. La flecha aparece solo al entrar
 * en un acta o en una tarea, y allí ocupa el sitio del logotipo.
 */
export function cabeceraTab(titulo) {
  return [
    h('div.topbar', null,
      h('div.grow', null, logoUnik({ alto: ALTO_LOGO })),
      avatar(store.sesion(), { tam: TAM_CUENTA, onclick: () => ir('#/ajustes') }),
    ),
    // Las tres raíces comparten cuerpo y arrancan alineadas con el
    // logotipo: no se estiran para llenar el ancho.
    ajustarTitulo(h('h1.titulo-pantalla.titulo-raiz', null, titulo),
      { hermanos: TITULOS_RAIZ, optico: true, escala: 0.85 }),
  ];
}

/**
 * Cabecera de dentro: la flecha de volver donde en las pantallas raíz va
 * el logotipo, y el titular igual de grande, para que se note que sigues
 * en la misma app y solo has bajado un nivel.
 */
export function cabeceraDentro(titulo, { volverA, sub, acciones = [] } = {}) {
  return [
    h('div.topbar', null,
      h('button.icon-btn', {
        'aria-label': 'Volver',
        onclick: () => (volverA ? ir(volverA) : history.back()),
      }, icon('arrowLeft')),
      h('div.grow', null, sub ? h('p.eyebrow', null, sub) : null),
      ...acciones,
      avatar(store.sesion(), { tam: TAM_CUENTA, onclick: () => ir('#/ajustes') }),
    ),
    ajustarTitulo(h('h1.titulo-pantalla', null, titulo)),
  ];
}

/**
 * Cierra la puerta de atrás de una cabecera ya montada: la flecha y los
 * botones de acción se quedan a la vista pero apagados.
 *
 * Lo usa la pantalla de validar un recorrido, de la que se sale creando
 * las tareas o descartándolas y no por la flecha. Se apagan y no se
 * esconden porque un hueco donde siempre hay una flecha se lee como un
 * fallo de la app; una flecha gris se lee como «por aquí no».
 *
 * Vive aquí, con la cabecera, para que quien la cambie vea también a
 * quién le está tocando el botón.
 */
export function cerrarVuelta(cabecera, motivo) {
  for (const b of cabecera[0].querySelectorAll('.icon-btn')) {
    b.disabled = true;
    b.style.opacity = '.35';
    b.style.pointerEvents = 'none';
    if (motivo) b.title = motivo;
  }
}

/**
 * Los titulares de las tres pantallas raíz. El cuerpo de las tres lo
 * marca el más ancho de esta lista, así que salen exactamente del mismo
 * tamaño y el más largo sigue cabiendo justo, sea cual sea el ancho del
 * móvil. La lista se mide, no se supone cuál es el más largo: con esta
 * tipografía «VIVIENDAS» y «AJUSTES» no ocupan lo que uno diría.
 *
 * El titular de la portada es el nombre de la promoción, que puede
 * cambiar; por eso el propio texto entra siempre en la medida aunque no
 * esté aquí. Si algún día una promoción se llamara más largo que
 * «VIVIENDAS», esa pantalla saldría con el cuerpo algo menor en lugar
 * de salirse, que es la manera correcta de fallar.
 */
const TITULOS_RAIZ = ['BRASSIE', 'VIVIENDAS', 'AJUSTES'];

/**
 * Ajusta el cuerpo del titular. Se mide una vez con canvas en lugar de
 * probar tamaños en el DOM: una sola medición y ninguna relectura de
 * estilos, que es lo que evita el parpadeo al entrar en la pantalla.
 *
 * `hermanos` fija el cuerpo midiendo también OTRAS palabras además de
 * la propia —las tres raíces se pasan la lista entera para compartir
 * tamaño—. Sin ellos, cada título se estira hasta llenar el ancho, que
 * es lo que interesa dentro de una vivienda o de un acta, donde los
 * nombres son de largos muy distintos.
 *
 * `escala` deja el cuerpo por debajo de lo que cabría: las tres raíces
 * no llenan el ancho a propósito.
 *
 * `optico` corrige el desajuste que da el TOC: una tipografía deja
 * siempre un hueco entre el borde de la caja del texto y donde empieza
 * de verdad la tinta —el «espaciado lateral» del glifo—, y ese hueco no
 * es igual en una B que en una V. Alineando la caja, la letra queda
 * metida hacia dentro respecto al logotipo de la cabecera. Aquí se mide
 * dónde empieza la tinta de verdad y se corre el titular esos pocos
 * píxeles a la izquierda, de modo que lo que queda alineado es la letra
 * y no su caja, que es lo que ve el ojo.
 */
function ajustarTitulo(nodo, { hermanos = null, optico = false, escala = 1 } = {}) {
  const medir = () => {
    // El ancho del PROPIO titular, no el de su contenedor: clientWidth
    // de un contenedor incluye su relleno, y medir contra él hacía los
    // títulos 40 px más anchos de lo que cabe, así que se salían.
    const ancho = nodo.clientWidth || 0;
    if (!ancho) return;
    const lienzo = ajustarTitulo.lienzo ||= document.createElement('canvas').getContext('2d');
    const REF = 100;
    const familia = getComputedStyle(nodo).fontFamily;
    lienzo.font = `200 ${REF}px ${familia}`;
    // El propio texto entra siempre: así ninguno se sale, aunque no
    // estuviera en la lista de hermanos.
    const suyo = Math.max(...[...(hermanos || []), nodo.textContent]
      .map((t) => lienzo.measureText(t).width));
    if (suyo <= 0) return;
    // Con tope por arriba y por abajo: una palabra corta no debe salir
    // gigante ni un nombre largo quedar ilegible por caber a la fuerza.
    const cuerpo = Math.min(150, Math.max(26, Math.floor((REF * ancho * escala) / suyo)));
    nodo.style.fontSize = cuerpo + 'px';
    // Si aun al mínimo no cabe, se deja partir en dos líneas.
    nodo.style.whiteSpace = (REF * ancho) / suyo < 26 ? 'normal' : 'nowrap';

    if (!optico) return;
    lienzo.font = `200 ${cuerpo}px ${familia}`;
    const m = lienzo.measureText(nodo.textContent);
    // Cuánto se mete la tinta desde el borde izquierdo de la caja.
    // `actualBoundingBoxLeft` va al revés de lo que parece: es positivo
    // cuando la tinta se sale por la izquierda del origen, así que el
    // hueco que buscamos es su negativo.
    const holgura = -(m.actualBoundingBoxLeft ?? 0);
    // Se corre con margen y no con transform: los hijos de .screen
    // llevan la animación de entrada, que acaba en `transform: none` con
    // fill-mode «both», y una animación pisa siempre al estilo en línea.
    // El margen negativo saca la caja esos píxeles a la izquierda y la
    // tinta cae justo bajo la U del logotipo.
    nodo.style.marginLeft = Math.abs(holgura) > 0.5 ? `${(-holgura).toFixed(2)}px` : '';
  };
  requestAnimationFrame(medir);
  // La medida se hace con la tipografía ya cargada: si se midiera con
  // la de reserva, el titular saldría con el cuerpo equivocado.
  document.fonts?.ready.then(medir);
  return nodo;
}

/* Cabecera con flecha de volver, título, subtítulo y acciones.

   Es la del diseño de antes y solo la usan las dos pantallas que aún no
   se han rediseñado —Promociones y Usuarios—. El nombre bueno,
   cabecera(), se lo lleva la de ahora, que está más abajo. */
export function cabeceraClasica(titulo, sub, { volverA, acciones = [] } = {}) {
  return h('div.topbar', null,
    volverA && h('button.icon-btn', {
      'aria-label': 'Volver',
      onclick: () => ir(volverA),
    }, icon('arrowLeft')),
    h('div.grow', null,
      h('h1', null, titulo),
      sub && h('div.sub', null, sub),
    ),
    ...acciones,
  );
}

/** Cinta de estado: conexión y cambios pendientes de subir. */
export function barraSync() {
  const led = h('span.led');
  const texto = h('span.grow');
  const boton = h('button', {
    'aria-label': 'Sincronizar ahora',
    style: { display: 'flex', color: 'inherit' },
    onclick: () => store.sincronizar({ forzar: true }),
  }, icon('refresh', 16));
  const barra = h('div.syncbar', null, led, texto, boton);

  const pintar = (e) => {
    barra.className = 'syncbar ' + (
      !e.online ? 'offline' : e.pendientes > 0 || e.sincronizando ? 'pending' : 'online'
    );
    if (!e.online) {
      texto.textContent = e.pendientes
        ? `Sin conexión · ${e.pendientes} ${e.pendientes === 1 ? 'cambio' : 'cambios'} en espera`
        : 'Sin conexión · se guarda en el dispositivo';
    } else if (e.sincronizando) {
      texto.textContent = 'Sincronizando…';
    } else if (e.error === 'sesion') {
      texto.textContent = 'Sesión caducada · vuelve a entrar';
    } else if (e.error) {
      texto.textContent = `No se pudo sincronizar · ${e.pendientes} en espera`;
    } else if (e.pendientes > 0) {
      texto.textContent = `Subiendo ${e.pendientes} ${e.pendientes === 1 ? 'cambio' : 'cambios'}…`;
    } else {
      texto.textContent = e.ultimo ? `Todo sincronizado · ${hora(e.ultimo)}` : 'Todo sincronizado';
    }
    boton.style.display = e.online && !e.sincronizando ? 'flex' : 'none';
  };

  // Cuando todo está bien la cinta no se enseña: en Ajustes está el
  // detalle y aquí sobra. Aparece sola si no hay cobertura o si queda
  // algo por subir, que es cuando de verdad hay que enterarse.
  const original = pintar;
  const pintarSiHaceFalta = (e) => {
    const hayQueContarlo = !e.online || e.pendientes > 0 || e.sincronizando || !!e.error;
    barra.style.display = hayQueContarlo ? '' : 'none';
    if (hayQueContarlo) original(e);
  };
  pintarSiHaceFalta(store.estadoSync);
  const quitar = store.alCambiarSync(pintarSiHaceFalta);
  // Cuando la cinta sale del documento deja de escuchar.
  new MutationObserver((_, obs) => {
    if (!barra.isConnected) { quitar(); obs.disconnect(); }
  }).observe(document.getElementById('app'), { childList: true, subtree: true });

  return barra;
}

/** Aviso de modo local, para que nadie crea que sus repasos viajan. */
export function avisoLocal() {
  if (api.HAY_SERVIDOR && !store.sesion()?.local) return null;
  return h('div.syncbar', null,
    h('span.led'),
    h('span.grow', null, 'Modo local · los datos no salen de este dispositivo'),
  );
}

/** Fila de una lista de repaso. `conteo` = { total, pendientes }. */
export function filaLista(lista, conteo, { mostrarVivienda = false } = {}) {
  const u = unidad(lista.unidadId);
  const titulo = mostrarVivienda
    ? `${u?.nombre || lista.unidadId} · ${fechaCorta(lista.creado)}`
    : `Inspección ${fechaCorta(lista.creado)}`;

  const partes = [lista.creadoPorNombre];
  if (conteo) {
    partes.push(conteo.total === 0
      ? 'sin repasos'
      : conteo.pendientes > 0
        ? `${conteo.pendientes} de ${conteo.total} pendientes`
        : `${conteo.total} ${conteo.total === 1 ? 'repaso resuelto' : 'repasos resueltos'}`);
  }

  return h('button.row', { onclick: () => ir('#/l/' + lista.id) },
    h('div.row-lead', {
      style: conteo && conteo.pendientes > 0
        ? { background: 'var(--accent)', color: 'var(--on-accent)' }
        : { background: 'var(--bg)' },
    }, conteo ? String(conteo.pendientes || conteo.total) : icon('clipboard', 18)),
    h('div.grow', null,
      h('div.row-title', null, titulo),
      h('div.row-sub', null, partes.join(' · ')),
    ),
    lista.cerrada ? h('span.tag.ok', null, 'Cerrada') : null,
    chevron(),
  );
}

/**
 * Foto de perfil: ponerla, cambiarla o quitarla. Quien administra puede
 * hacerlo sobre cualquiera; el resto, solo sobre sí mismo (y el servidor
 * lo comprueba igualmente).
 */
export function hojaFoto(u) {
  return sheet((cerrar) => {
    const previa = avatar(u, { tam: 92 });

    const poner = async (origen) => {
      const ficheros = origen === 'camara' ? await media.hacerFoto() : await media.elegirFotos();
      if (!ficheros.length) return;
      toast('Preparando la foto…');
      try {
        const blob = await media.prepararAvatar(ficheros[0]);
        await api.subirAvatar(u.id, blob);
        cerrar('puesta');
        toast('Foto actualizada');
      } catch (e) {
        toast(e.status === 403 ? 'No puedes cambiar esta foto' : 'No se pudo subir la foto', 'err');
      }
    };

    return [
      h('h2.title', null, u.nombre),
      h('div', { style: { display: 'flex', justifyContent: 'center', padding: '8px 0 4px' } }, previa),
      h('div.stack', null,
        h('button.row', { onclick: () => poner('camara') },
          h('div.row-lead', null, icon('camera', 18)),
          h('div.grow', null, h('div.row-title', null, 'Hacer una foto')),
        ),
        h('button.row', { onclick: () => poner('galeria') },
          h('div.row-lead', null, icon('image', 18)),
          h('div.grow', null, h('div.row-title', null, 'Elegir de la galería')),
        ),
        u.avatar ? h('button.row.danger', {
          onclick: async () => {
            if (!await confirmSheet({ title: '¿Quitar la foto?', text: 'Volverán a verse las iniciales.', ok: 'Quitar', danger: true })) return;
            try {
              await api.borrarAvatar(u.id);
              cerrar('quitada');
              toast('Foto quitada');
            } catch { toast('No se pudo quitar', 'err'); }
          },
        },
          h('div.row-lead', null, icon('trash', 18)),
          h('div.grow', null, h('div.row-title', null, 'Quitar la foto')),
        ) : null,
      ),
      h('p.hint', null, 'Se recorta cuadrada y se reduce a 512 px antes de subirla.'),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cerrar'),
    ];
  });
}

/**
 * Tarjeta de un acta. La misma en la portada, en la pestaña de ACTAS y
 * al pie de cada vivienda: quién ha participado, de qué acta se trata,
 * cuándo se hizo y cuánto lleva verificado. Se toca aquí y cambia en
 * los tres sitios.
 *
 * Lo único que depende de dónde se enseñe es el título cuando el acta
 * no tiene nombre puesto. En la lista general hace falta decir de qué
 * vivienda es; dentro de esa misma vivienda eso ya se sabe, y lo que
 * distingue un acta de otra es su fecha. De ahí `dentroDeVivienda`.
 */
export function tarjetaActa({ lista, conteo, gente }, { dentroDeVivienda = false, filtros = null } = {}) {
  const u = unidad(lista.unidadId);
  // «Acta Villa 26» y no «Villa 26»: si el acta se llamara igual que la
  // vivienda, en un listado no habría manera de saber qué se está
  // abriendo. Dentro de la vivienda eso ya se sabe, y lo que distingue
  // un acta de otra es su fecha.
  const porDefecto = dentroDeVivienda
    ? `Parte de ${fechaCorta(lista.creado)}`
    : `Parte ${u?.nombre || lista.unidadId}`;
  const titulo = lista.nombre || porDefecto;

  return h('button.acta', { onclick: () => ir(conFiltros('#/l/' + lista.id, filtros || {})) },
    grupoAvatares(gente.map((g) => store.persona(g.id, g.nombre)), { tam: 55 }),
    h('div.grow', null,
      h('div.acta-tit', null, titulo),
      h('div.acta-pie', null,
        h('span', null, fechaRelativa(lista.creado)),
      ),
    ),
    anillo(store.avance(conteo), { tam: 46 }),
  );
}

/**
 * Chips de estado. Los mismos en las cuatro pantallas que filtran, y
 * con las mismas palabras: el valor que devuelve ES el identificador
 * del estado (`pendiente`, `resuelta`, `verificada`) o `todas`.
 *
 * Que el filtro hable en estados y no en palabras propias es lo que
 * quita la ambigüedad: antes cada pantalla inventaba las suyas
 * —«Pendientes», «Terminadas», «Cerradas»— y no había forma de saber
 * si dos filtros distintos buscaban o no lo mismo.
 */
export function filtroEstado(alCambiar, inicial = 'todas') {
  let activo = inicial;
  const chips = h('div.chips.filtro', null,
    ...[['todas', 'Todas'], ...ESTADOS.map((e) => [e.id, e.plural])].map(([id, txt]) =>
      h('button.chip.accent', {
        'aria-pressed': id === activo ? 'true' : 'false',
        onclick: (e) => {
          if (activo === id) return;
          activo = id;
          [...chips.children].forEach((c) => c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'));
          alCambiar(activo);
        },
      }, txt)),
  );
  return chips;
}

/** Selector de oficio. Abre una hoja con los doce a dos columnas. */
export function filtroOficio(alCambiar, inicial = 'todos') {
  let activo = inicial;
  const rotulo = (id) => (id === 'todos' ? 'Todos los oficios' : oficio(id).nombre);
  const texto = h('span.grow', null, rotulo(activo));

  const boton = h('button.selector', {
    class: activo !== 'todos' ? 'puesto' : '',
    onclick: async () => {
      const elegido = await hojaOficios(activo, { conTodos: true });
      if (elegido === null || elegido === activo) return;
      activo = elegido;
      texto.textContent = rotulo(activo);
      boton.classList.toggle('puesto', activo !== 'todos');
      alCambiar(activo);
    },
  }, texto, icon('chevron', 16));

  return boton;
}

/**
 * La hoja de oficios del diseño «FILTRANDO POR GREMIO U OFICIO»:
 * tarjeta sobre velo desenfocado, una fila por gremio con su cara
 * redonda y su círculo de marcar, y el botón «Seleccionar» que pasa
 * de gris a topo.
 *
 * Con `multiple` marca varios y devuelve un array (vacío = quitar el
 * filtro, si `conTodos`); sin él, devuelve el id elegido. El aspa
 * devuelve null: nada cambia.
 */
export function hojaOficios(actual = null, { conTodos = false, multiple = false, titulo = 'Filtrar por oficio' } = {}) {
  return new Promise((resolver) => {
    const inicial = Array.isArray(actual) ? actual : (actual && actual !== 'todos' ? [actual] : []);
    const marcados = new Set(inicial);
    const cerrar = (v) => { velo.remove(); resolver(v); };

    const boton = h('button', {
      onclick: () => cerrar(multiple ? [...marcados] : ([...marcados][0] || (conTodos ? 'todos' : null))),
    }, 'Seleccionar');
    const pintarBoton = () => {
      // Sin nada marcado solo se puede confirmar si eso significa algo:
      // quitar el filtro. Eligiendo para un formulario, no.
      boton.disabled = !marcados.size && !(conTodos && inicial.length);
    };

    const lista = h('div.d-carta-lista', null, ...OFICIOS.map((o) => {
      const circulo = h('span.d-marcable-circulo');
      const fila = h('button.d-marcable', {
        onclick: () => {
          if (multiple) {
            if (marcados.has(o.id)) marcados.delete(o.id); else marcados.add(o.id);
          } else {
            const estaba = marcados.has(o.id);
            marcados.clear();
            if (!estaba) marcados.add(o.id);
          }
          pintar();
        },
      }, caraDeGremio(o, 36), h('span.grow', null, o.nombre), circulo);
      fila.dataset.oficio = o.id;
      return fila;
    }));
    const pintar = () => {
      for (const fila of lista.children) {
        const puesto = marcados.has(fila.dataset.oficio);
        const c = fila.querySelector('.d-marcable-circulo');
        c.classList.toggle('marcado', puesto);
        c.replaceChildren(puesto ? icon('check') : '');
      }
      pintarBoton();
    };

    const velo = h('div.d-velo.abajo', { onclick: (e) => { if (e.target === velo) cerrar(null); } },
      h('div.d-carta', null,
        h('div.d-carta-cab', null,
          h('span', null, titulo),
          h('button.x', { 'aria-label': 'Cerrar', onclick: () => cerrar(null) }, icon('x')),
        ),
        lista,
        h('div.d-carta-pie', null, boton),
      ),
    );
    pintar();
    document.body.append(velo);
  });
}

/**
 * El calendario del diseño «ELIGIENDO FECHA»: tarjeta sobre velo con
 * el mes navegable, la rejilla de días y el botón «Seleccionar (19
 * nov, 2026)». Devuelve la fecha en ISO, '' si se quita la puesta, o
 * null si se cierra sin tocar nada.
 */
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_TITULO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export function hojaFecha(actualIso = null) {
  return new Promise((resolver) => {
    const hoy = new Date();
    let elegido = actualIso ? new Date(actualIso) : null;
    let vista = new Date((elegido || hoy).getFullYear(), (elegido || hoy).getMonth(), 1);
    const cerrar = (v) => { velo.remove(); resolver(v); };

    const titulo = h('span.grow', { style: { textAlign: 'center' } });
    const rejilla = h('div.d-calendario');
    const boton = h('button', {
      onclick: () => {
        if (!elegido && !actualIso) return;
        cerrar(elegido ? new Date(elegido.getFullYear(), elegido.getMonth(), elegido.getDate(), 12).toISOString() : '');
      },
    });

    const mismaFecha = (a, b) => a && b && a.toDateString() === b.toDateString();
    const pintar = () => {
      titulo.textContent = `${MESES_TITULO[vista.getMonth()]} ${vista.getFullYear()}`;
      const celdas = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
        .map((d) => h('span.dia.cabecera', null, d));
      // La rejilla arranca el lunes de la semana del día 1.
      const desfase = (vista.getDay() + 6) % 7;
      const cursor = new Date(vista);
      cursor.setDate(1 - desfase);
      for (let i = 0; i < 42; i++) {
        const d = new Date(cursor);
        const deOtroMes = d.getMonth() !== vista.getMonth();
        celdas.push(h('button.dia', {
          class: [
            deOtroMes ? 'fuera' : '',
            mismaFecha(d, elegido) ? 'elegido' : '',
            mismaFecha(d, hoy) && !mismaFecha(d, elegido) ? 'hoy' : '',
          ].filter(Boolean).join(' '),
          onclick: () => {
            elegido = mismaFecha(d, elegido) ? null : d;
            if (deOtroMes) vista = new Date(d.getFullYear(), d.getMonth(), 1);
            pintar();
          },
        }, String(d.getDate())));
        cursor.setDate(cursor.getDate() + 1);
        // Seis semanas de rejilla, pero si la sexta ya es toda del mes
        // siguiente, sobra.
        if (i >= 34 && (i + 1) % 7 === 0 && cursor.getMonth() !== vista.getMonth()) break;
      }
      rejilla.replaceChildren(...celdas);
      boton.textContent = elegido
        ? `Seleccionar (${elegido.getDate()} ${MESES_CORTOS[elegido.getMonth()]}, ${elegido.getFullYear()})`
        : (actualIso ? 'Quitar la fecha' : 'Seleccionar');
      boton.disabled = !elegido && !actualIso;
    };

    const velo = h('div.d-velo.abajo', { onclick: (e) => { if (e.target === velo) cerrar(null); } },
      h('div.d-carta', null,
        h('div.d-carta-cab.calendario', null,
          h('button.paso', {
            'aria-label': 'Mes anterior',
            onclick: () => { vista = new Date(vista.getFullYear(), vista.getMonth() - 1, 1); pintar(); },
          }, icon('caretIzquierda')),
          titulo,
          h('button.paso', {
            'aria-label': 'Mes siguiente',
            onclick: () => { vista = new Date(vista.getFullYear(), vista.getMonth() + 1, 1); pintar(); },
          }, icon('chevron')),
        ),
        rejilla,
        h('div.d-carta-pie', null, boton),
      ),
    );
    pintar();
    document.body.append(velo);
  });
}

/**
 * La cara de un gremio. Si todavía no hay foto, la inicial sobre un
 * color sacado de su propio identificador: se ven distintos entre sí y
 * se reconocen por sitio, que es el 90% de lo que hace la foto. Así la
 * pantalla está terminada aunque las imágenes lleguen después.
 */
export function caraDeGremio(o, tam = 40) {
  const ruta = imagenDeOficio(o.id);
  const caja = h('div.gremio-cara', {
    style: { width: tam + 'px', height: tam + 'px', flex: `0 0 ${tam}px` },
  });
  if (ruta) {
    caja.style.backgroundImage = `url("${ruta}")`;
    return caja;
  }
  let n = 0;
  for (let i = 0; i < o.id.length; i++) n = (n * 31 + o.id.charCodeAt(i)) >>> 0;
  caja.style.background = `hsl(${n % 360} 24% 82%)`;
  caja.style.color = `hsl(${n % 360} 40% 26%)`;
  caja.append(h('span', null, (o.nombre || '?').trim()[0].toUpperCase()));
  return caja;
}

/**
 * Hoja de estancias. Igual que la de oficios, con una diferencia: aquí
 * «ninguna» es una respuesta válida —hay remates que no están en una
 * habitación concreta— así que siempre hay por dónde salir sin poner
 * nada. Devuelve `null` si se cancela y `''` si se quita la estancia,
 * que no son lo mismo: uno deja las cosas como están y el otro las
 * cambia a vacío.
 */
/* Qué icono lleva cada estancia.

   No es adorno: una lista de palabras parecidas —«Baño principal»,
   «Baño suite», «Dormitorio 1», «Dormitorio 2»— se lee entera cada vez
   hasta dar con la buena. Con un dibujo delante se recorre con la vista
   y se encuentra de un golpe.

   Los tres dormitorios comparten cama a propósito: son la misma clase
   de habitación, y darles iconos distintos inventaría una diferencia
   que no existe. Lo que los separa es el número, que va al lado. Los
   baños sí llevan iconos distintos porque sí son cosas distintas: un
   aseo no tiene ducha. */
export const ICONO_DE_ESTANCIA = {
  Aseo: 'inodoro',
  Cocina: 'cazuela',
  Entrada: 'puerta',
  Escalera: 'peldanos',
  Lavadero: 'lavadora',
  Salón: 'sofa',
  'Baño principal': 'banera',
  'Baño suite': 'ducha',
  'Dormitorio 1': 'cama',
  'Dormitorio 2': 'cama',
  'Dormitorio suite': 'cama',
  Pasillo: 'camino',
  'Patio trasero p. alta': 'sol',
  'Terraza p. alta': 'sombrilla',
  'Acceso exterior': 'puertaAbierta',
  Cubierta: 'tejado',
  Jardín: 'arbol',
  Sótano: 'archivador',
};

/**
 * Elegir una cosa de una lista, en la tarjeta de siempre.
 *
 * `grupos` son bloques de opciones. Se separan con un hueco, sin
 * rótulo: el hueco ya dice que son grupos, y tres renglones para poner
 * «Planta baja», «Planta alta» y «Otros» sería gastar pantalla en decir
 * lo que se ve solo. En una lista que se consulta de pie en una casa,
 * cada renglón cuenta.
 *
 * Las filas van densas y con flechita, como las de Ajustes: sin el
 * texto pequeño de debajo cada opción ocupa la mitad, y caben el doble
 * en la misma pantalla.
 */
export function menuLista(titulo, grupos, { actual = '', quitar = '', icono = null } = {}) {
  return new Promise((resolver) => {
    const cerrar = (valor) => { velo.remove(); resolver(valor); };

    const fila = (valor, rotulo, ico, clase = '') => h('button.d-fila-elegir', {
      class: [clase, valor === actual ? 'puesta' : ''].filter(Boolean).join(' '),
      'aria-pressed': valor === actual ? 'true' : 'false',
      onclick: () => cerrar(valor),
    },
      ico ? icon(ico) : null,
      h('span.grow', null, rotulo),
      // En la elegida, el check ocupa el sitio de la flecha. Así el
      // borde derecho tiene siempre algo —ninguna fila se queda coja— y
      // dónde estás se ve sin buscarlo.
      valor === actual ? icon('check') : chevron(),
    );

    const bloque = (opciones, clase = '') => h('div.d-bloque-elegir', { class: clase },
      ...opciones.map((o) => (typeof o === 'string'
        ? fila(o, o, icono ? icono(o) : null)
        : fila(o.id, o.rotulo, o.icono))),
    );

    const tarjeta = h('div.d-menu-tarjeta.elegir', { role: 'dialog', 'aria-modal': 'true' },
      h('div.d-menu-cab', null,
        h('span.d-menu-titulo', null, titulo),
        h('button.d-menu-x', { 'aria-label': 'Cerrar', onclick: () => cerrar(null) }, icon('x')),
      ),
      ...grupos.filter((g) => g.length).map((g) => bloque(g)),
      // Quitar la elección solo aparece si hay algo que quitar: un botón
      // que no hace nada enseña a no leer los botones.
      actual && quitar ? bloque([{ id: '', rotulo: quitar, icono: 'x' }], 'rojo') : null,
    );

    const velo = h('div.d-menu-velo', {
      onclick: (e) => { if (e.target === velo) cerrar(null); },
    }, tarjeta);
    document.body.append(velo);
  });
}

/**
 * La estancia de un repaso, por plantas.
 *
 * Si la tarea trae una estancia que ya no está en el catálogo —porque
 * se quitara de la lista después— se añade igualmente, en su propio
 * bloque y la primera. Lo que se guarda en cada tarea es el texto y no
 * un identificador, así que sin esto abrir una tarea vieja y tocar la
 * estancia la borraría sin querer.
 */
export function hojaZonas(actual) {
  const grupos = PLANTAS.map((p) => p.zonas);
  if (actual && !ZONAS.includes(actual)) grupos.unshift([actual]);
  return menuLista('Estancia', grupos, {
    actual,
    quitar: 'Sin estancia',
    icono: (z) => ICONO_DE_ESTANCIA[z] || 'casa',
  });
}
export function hojaBienHecho({ titulo, frase, usuario, boton = 'Seguir' }) {
  // El modal de enhorabuena del Figma: velo con desenfoque, tarjeta
  // clara con su aspa, la cara en grande, el titular, la frase y el
  // botón topo.
  return new Promise((resolver) => {
    const cerrar = () => { velo.remove(); resolver(true); };
    const velo = h('div.d-velo', { onclick: (e) => { if (e.target === velo) cerrar(); } },
      h('div.d-modal', null,
        h('button.d-modal-x', { 'aria-label': 'Cerrar', onclick: cerrar }, icon('x')),
        avatar(usuario, { tam: 100 }),
        h('h2.d-modal-titulo', null, titulo),
        h('p.d-modal-sub', null, frase),
        h('button.d-modal-boton', { onclick: cerrar }, boton),
      ),
    );
    document.body.append(velo);
  });
}

/**
 * El menú flotante del Figma: velo con desenfoque, caja clara de filas
 * centradas y —salvo que se pida sin ella— la bola de cerrar debajo.
 * `construir(cerrar)` devuelve las filas; para una fila normal está
 * `filaMenu`, y para las de elegir fichero, `filaMenuFichero`.
 */
export function menuFlotante(construir, { conX = true } = {}) {
  const cerrar = () => velo.remove();
  const velo = h('div.d-hoja-acciones', { onclick: (e) => { if (e.target === velo) cerrar(); } },
    h('div.d-hoja-acciones-menu', null, ...construir(cerrar)),
    conX ? h('button.d-hoja-acciones-x', { 'aria-label': 'Cerrar', onclick: cerrar }, icon('x')) : null,
  );
  document.body.append(velo);
  return cerrar;
}

/**
 * Una fila del menú flotante: icono topo, rótulo y su acción.
 *
 * Sin icono (`filaMenu(null, ...)`) la fila se alinea a la izquierda.
 * Es para las listas donde todas las filas serían el mismo dibujo —las
 * cincuenta viviendas, por ejemplo—: repetir la misma casita cincuenta
 * veces no distingue nada y roba el sitio por el que se lee.
 */
/**
 * El menú de los tres puntos: una tarjeta sobre el fondo borroso, con
 * su título arriba y su X a la derecha, y las filas con el mismo aire
 * que las de Ajustes —icono a la izquierda, rótulo, y el detalle en
 * pequeño debajo si hace falta—.
 *
 * Devuelve lo que se haya elegido (el `id` de la fila) o null si se
 * cierra sin elegir, para poder escribir `const accion = await …`.
 *
 * Las filas se pasan como datos y no como nodos, y admiten null entre
 * medias: así una opción que solo ve quien creó la tarea se escribe
 * con un `edita ? {...} : null` y no ensucia la llamada.
 */
export function menuTarjeta(titulo, filas, { extra = null } = {}) {
  return new Promise((resolver) => {
    const cerrar = (valor = null) => { velo.remove(); resolver(valor); };
    const tarjeta = h('div.d-menu-tarjeta', null,
      h('div.d-menu-cab', null,
        h('span.d-menu-titulo', null, titulo),
        h('button.d-menu-x', { 'aria-label': 'Cerrar', onclick: () => cerrar(null) }, icon('x')),
      ),
      ...filas.filter(Boolean).map((f) => h('button.d-menu-fila', {
        class: f.rojo ? 'rojo' : '',
        onclick: () => cerrar(f.id),
      },
        f.icono ? icon(f.icono) : null,
        h('span.grow', null,
          f.rotulo,
          f.sub ? h('span.d-menu-sub', null, f.sub) : null),
      )),
      extra,
    );
    // Lo que se cuelga en `extra` son enlaces —las actas de la
    // vivienda—, así que tocar cualquiera cierra el menú: si no, la
    // tarjeta se quedaría flotando encima de la pantalla nueva.
    if (extra) extra.addEventListener('click', () => cerrar(null));

    const velo = h('div.d-menu-velo', {
      onclick: (e) => { if (e.target === velo) cerrar(null); },
    }, tarjeta);
    document.body.append(velo);
  });
}

/* `rojo` es para las filas que destruyen algo. El menú de los tres
   puntos mezcla salidas inofensivas —«salir y seguir luego»— con
   borrados definitivos, y a 55 px de altura y con el pulgar en marcha
   la única forma de distinguirlas de un vistazo es el color. */
export function filaMenu(icono, rotulo, accion, { rojo = false } = {}) {
  const rojaVa = rojo ? '.roja' : '';
  if (!icono) return h(`button.d-hoja-fila.suelta${rojaVa}`, { onclick: accion }, rotulo);
  return h(`button.d-hoja-fila${rojaVa}`, { onclick: accion }, icon(icono), rotulo);
}

/**
 * Entrega un fichero recién generado (un PDF, normalmente).
 *
 * En el iPhone, la hoja de compartir SOLO se abre al calor de un toque
 * recién dado. Si la llamada llega tarde —porque generar el fichero
 * llevó unos segundos de fotos y recortes— iOS la tumba con
 * NotAllowedError, y durante un tiempo eso se leyó como «no se ha
 * podido generar el PDF» cuando el PDF estaba perfectamente generado.
 *
 * Por eso aquí no se comparte directamente: se enseña una hoja con el
 * fichero ya listo, y es el toque en «Compartir» —recién dado— el que
 * abre la de iOS. Donde no hay hoja de compartir (el ordenador), se
 * descarga sin más, como siempre.
 */
export function entregarFichero(fichero, nombre) {
  const bajar = () => {
    const url = URL.createObjectURL(fichero);
    const enlace = h('a', { href: url, download: nombre, style: { display: 'none' } });
    document.body.append(enlace);
    enlace.click();
    setTimeout(() => { enlace.remove(); URL.revokeObjectURL(url); }, 4000);
    toast('PDF descargado', '', { icono: 'documento', detalle: nombre });
  };
  if (!navigator.canShare?.({ files: [fichero] })) {
    bajar();
    return;
  }
  menuFlotante((cerrar) => [
    h('p.d-hoja-titulo', null, 'El PDF está listo'),
    filaMenu('share', 'Compartir', () => {
      cerrar();
      // La llamada sale aquí mismo, dentro del toque: es lo que iOS pide.
      navigator.share({ files: [fichero], title: nombre }).catch((e) => {
        // Cancelar la hoja es legítimo; cualquier otra pega, descarga:
        // que el papel no se quede sin salir.
        if (e?.name !== 'AbortError') bajar();
      });
    }),
    filaMenu('documento', 'Guardar sin compartir', () => { cerrar(); bajar(); }),
  ]);
}

/** Una fila que abre el selector de ficheros del sistema. */
export function filaMenuFichero(cerrar, extra, icono, rotulo, onElegir) {
  return media.botonFichero({
    clase: 'd-hoja-fila', accept: 'image/*', multiple: true, ...extra,
    onElegir: (ficheros) => { cerrar(); onElegir(ficheros); },
  }, icon(icono), rotulo);
}

/**
 * La hoja de «Hacer foto / Seleccionar de la galería» del Figma.
 * Llama a `onElegir(ficheros)` con lo elegido, venga de donde venga.
 */
/**
 * De dónde sale una foto. De serie, SOLO de la cámara.
 *
 * La foto de una tarea no es una ilustración: es la prueba de que
 * alguien estuvo delante del remate. Con el carrete abierto, marcar
 * treinta tareas desde la oficina un viernes por la tarde es cuestión
 * de minutos, y entonces el porcentaje de la obra deja de significar
 * nada. Quien de verdad necesite adjuntar algo de antes —un plano, el
 * detalle de otro día— lo pone en el hilo de la tarea, que para eso
 * está y ahí sí se abre la galería.
 */
export function hojaFotoAcciones(onElegir, { conGaleria = false } = {}) {
  menuFlotante((cerrar) => [
    filaMenuFichero(cerrar, { capture: 'environment' }, 'camera', 'Hacer foto', onElegir),
    conGaleria
      ? filaMenuFichero(cerrar, {}, 'image', 'Seleccionar de la galería', onElegir)
      : null,
  ].filter(Boolean));
}

/**
 * La bandeja: fotos elegidas en una pantalla que viajan a la
 * siguiente. Las direcciones no llevan ficheros, así que el menú de
 * nueva inspección deja aquí lo capturado y el formulario de nueva
 * tarea lo recoge (y la vacía).
 */
export const bandeja = { fotos: [] };

/**
 * Abre una de las páginas sueltas del servidor —privacidad, soporte—
 * sin echar a nadie de la aplicación.
 *
 * Apple obliga (norma 5.1.1) a que la política de privacidad se pueda
 * leer DENTRO de la app, no solo en la ficha de la tienda; sin eso
 * rechazan la publicación. Dentro del envoltorio de iPhone se abre en
 * la ventanita del sistema, que se cierra y devuelve donde estabas; en
 * el navegador, en una pestaña aparte. Lo que no puede pasar es que la
 * página sustituya a la aplicación, porque en el móvil no hay flecha
 * de volver y quien entre se queda encerrado ahí.
 */
export function abrirPagina(ruta) {
  const url = new URL(ruta, location.href).href;
  const navegador = window.Capacitor?.Plugins?.Browser;
  if (navegador?.open) { navegador.open({ url }); return; }
  window.open(url, '_blank', 'noopener');
}

/** Flecha «>» del final de las píldoras. */
export function chevron() {
  const svg = icon('chevron');
  svg.classList.add('chev');
  return svg;
}

/**
 * La llamada a la acción negra de «nueva lista de repasos». La misma en
 * la pestaña de ACTAS y dentro de una vivienda, y en el mismo sitio de
 * la pantalla: debajo de los filtros y encima del listado. Lo único que
 * cambia es a dónde lleva — en ACTAS hay que elegir vivienda primero, y
 * dentro de una ya se sabe cuál es.
 */
export function ctaNuevaLista(alPulsar) {
  return ctaAccion('NUEVA LISTA DE REPASOS', { onclick: alPulsar });
}

/**
 * El botón redondo de añadir, abajo a la derecha. Para las pantallas
 * que son una lista y nada más: allí la llamada a la acción a todo lo
 * ancho parte el listado en dos y estorba justo donde se está mirando.
 *
 * La onda se dispara al soltar y no al apretar: el hundido ya cuenta lo
 * de apretar, y la onda cuenta que la acción ha salido. Se quita y se
 * vuelve a poner la clase forzando un reflujo, para que dos toques
 * seguidos den dos ondas y no una.
 */
export function fabMas(alPulsar, { etiqueta = 'Añadir' } = {}) {
  const boton = h('button.fab-bola', {
    'aria-label': etiqueta, title: etiqueta,
    onclick: () => {
      boton.classList.remove('pulsa');
      void boton.offsetWidth;
      boton.classList.add('pulsa');
      setTimeout(() => boton.classList.remove('pulsa'), 560);
      alPulsar();
    },
  }, icon('plus'));
  return boton;
}

/**
 * La llamada a la acción principal de una pantalla o de una hoja: caja
 * negra a todo lo ancho, el rótulo a la izquierda y el icono en una
 * bolita a la derecha. Es la misma pieza en todas partes para que se
 * reconozca sin leer cuál es la acción que cierra lo que estás
 * haciendo.
 */
export function ctaAccion(texto, { onclick, icono = 'plus', claro = false, disabled = false } = {}) {
  return h('button.cta-accion' + (claro ? '.claro' : ''), { onclick, disabled: disabled || null },
    h('span.grow', null, texto),
    h('span.cta-mas', null, icon(icono, 18)),
  );
}

/** La salida de una hoja: la misma caja, en claro y con la cruz. */
export function ctaCancelar(onclick) {
  return ctaAccion('CANCELAR', { onclick, icono: 'x', claro: true });
}

/**
 * Barra de avance de cuatro tramos con su leyenda. Un anillo de un solo
 * color no puede decir la proporción entre cuatro estados; esta sí, y de
 * paso pone a la vista la cola de «Completadas», que es donde se atasca
 * el trabajo cuando la subcontrata va por delante de quien comprueba.
 *
 * Las rechazadas salen aparte aunque el resumen las tenga sumadas dentro
 * de las pendientes: para el porcentaje son lo mismo —trabajo sin
 * verificar— pero en la leyenda no, porque una rechazada ya se dio por
 * buena una vez y esa es la que hay que ir a mirar antes.
 */
export function barraAvance(c) {
  const total = c.total || 0;
  const rechazadas = c.rechazadas || 0;
  const abiertas = Math.max(0, (c.pendientes || 0) - rechazadas);
  const pct = (n) => (total ? (100 * n) / total : 0);
  const tramo = (clase, n) => (n > 0
    ? h('i', { class: clase, style: { width: pct(n) + '%' } })
    : null);

  const dato = (clase, n, etiqueta) => h('div', null,
    h('div.leyenda-cifra', null,
      h('span.punto', { class: clase }),
      h('b', null, String(n)),
    ),
    h('span', null, etiqueta),
  );

  // Los rótulos salen del catálogo, no escritos aquí: es lo que impide
  // que esta leyenda diga «Validadas» el día que los chips ya dicen
  // «Verificadas», que es exactamente lo que había pasado.
  const rotulo = (id) => estado(id).plural;

  return h('div.widget-avance', null,
    h('p.eyebrow', null, 'Avance'),
    h('div.avance-barra', null,
      tramo('t-resuelta', c.hechas),
      tramo('t-revisar', c.esperando),
      tramo('t-rechazada', rechazadas),
      tramo('t-pendiente', abiertas),
    ),
    h('div.leyenda', null,
      dato('t-resuelta', c.hechas, rotulo('verificada')),
      dato('t-revisar', c.esperando, rotulo('resuelta')),
      dato('t-rechazada', rechazadas, rotulo('rechazada')),
      dato('t-pendiente', abiertas, rotulo('pendiente')),
    ),
  );
}

/**
 * Una tarea en un listado: foto, texto, estado y quién la creó.
 * `donde` es opcional y sitúa la tarea cuando el listado mezcla
 * viviendas (la portada), porque ahí «rodapié sin sellar» no dice nada
 * si no se sabe de qué villa es.
 */
export function tareaFila(t, { portada, donde, filtros = null } = {}) {
  const e = estado(t.estado);
  const clases = ['tarea-fila'];
  if (rebotada(t)) clases.push('rechazada');
  else if (t.estado === 'verificada') clases.push('resuelta');

  return h('button', {
    class: clases.join(' '),
    onclick: () => ir(conFiltros(`#/l/${t.listaId}/t/${t.id}`, filtros || {})),
  },
    portada
      ? h('div.tarea-foto', { style: { backgroundImage: `url("${portada}")` } })
      : h('div.tarea-foto', null, icon('image', 20)),
    h('div.grow', null,
      h('p.tarea-txt', null, t.texto || 'Sin descripción'),
      h('div.tarea-pie', null,
        avatar(store.persona(t.creadoPor, t.creadoPorNombre), { tam: 35 }),
        // Lo verificado lleva su check y no su nombre: en un listado de
        // treinta, una hilera de marcas se cuenta de un vistazo y una
        // hilera de la palabra «Verificada» hay que leerla.
        t.estado === 'verificada'
          ? h('span.tag.hecha', null, icon('check', 12), 'Verificada')
          : h('span.tag', { class: e.tag }, e.nombre),
        t.zona ? h('span.tarea-donde', null, t.zona) : null,
        donde ? h('span.tarea-donde', null, donde) : null,
      ),
    ),
  );
}

/* ═══ Piezas del rediseño 2026 ═══ */

/* ═══════════════════════════════════════════════════════════════
   LA CABECERA — una sola para toda la aplicación.
   ═══════════════════════════════════════════════════════════════ */

/* El diámetro de todo lo redondo que va arriba: la cara, las tres bolas
   de navegación, la flecha de volver y la de los tres puntos.

   Este número vive por duplicado, aquí y en --cab-bola del CSS, porque
   la cara la dibuja avatar() con las medidas puestas a mano en el
   propio elemento y ésas no leen variables de CSS. Si se cambia uno hay
   que cambiar el otro; los dos llevan la misma marca para encontrarse.
   ── GEMELO de --cab-bola en css/app.css ── */
export const CAB_BOLA = 55;

/* En qué sección estaba la última cabecera de fuera que se pintó, para
   saber si el negro de la bola tiene que entrar fundido o ya estaba
   ahí. Empieza en null: al abrir la app no se funde nada, que la
   pantalla entera ya viene con su propia animación de entrada. */
let seccionPintada = null;

/**
 * La cabecera de todas las pantallas, con dos formas y ninguna más.
 *
 *   cabecera({ seccion: 'inicio' })
 *       La de fuera, la de las tres raíces: la cara a la izquierda
 *       —que lleva a Ajustes— y las tres bolas de navegación a la
 *       derecha, con la de la sección en la que estás en negro.
 *
 *   cabecera({ volver: '#/viviendas', titulo: 'Villa 01', menu: abrir })
 *       La de dentro: la flecha a la izquierda, el título centrado y la
 *       acción a la derecha.
 *
 * Antes cada pantalla se escribía la suya a mano, y bastaba con que una
 * pusiera la cara a 54 px y otra la bola a 55 para que se vieran
 * desalineadas sin que nadie supiera por qué: en Ajustes la cara
 * acababa un píxel antes del borde que las bolas de las demás
 * pantallas. Ahora las medidas se deciden aquí y en los tokens --cab-*,
 * y mover un píxel es moverlo en las diez pantallas a la vez.
 *
 * Opciones de la forma de dentro:
 *   volver   ruta ('#/viviendas') o función, para la flecha.
 *   titulo   el texto del centro.
 *   menu     función que abre el menú de los tres puntos.
 *   derecha  un elemento propio para el hueco de la derecha, cuando no
 *            es un menú (Ajustes pone ahí tu cara).
 *
 * Devuelve el nodo con dos apaños encima, para quien tenga que cambiar
 * la cabecera con la pantalla ya montada —el recorrido lo hace al pasar
 * a «nueva lista»—: ponerTitulo() y ponerVuelta().
 */
export function cabecera({ seccion, volver, titulo = '', menu, derecha } = {}) {
  /* ─── La de fuera: la cara y las tres bolas ─── */
  if (seccion) {
    /* El negro de la bola entra fundido solo cuando se CAMBIA de
       sección, no cada vez que se pinta. La pantalla se repinta sola en
       cuanto la sincronización trae algo nuevo, y sin esta cuenta la
       bola parpadearía de blanco a negro sola, sin que nadie la hubiera
       tocado, mientras estás mirando la lista. */
    const cambioDeSeccion = seccionPintada !== null && seccionPintada !== seccion;
    seccionPintada = seccion;

    const bola = (clave, icono, rotulo, adonde) =>
      h('button.d-bola', {
        class: [
          seccion === clave ? 'activa' : '',
          seccion === clave && cambioDeSeccion ? 'entrando' : '',
        ].filter(Boolean).join(' '),
        'aria-label': rotulo,
        'aria-current': seccion === clave ? 'true' : null,
        onclick: seccion === clave ? null : () => ir(adonde),
      }, icon(icono));
    return h('div.d-cab', null,
      avatar(store.sesion(), { tam: CAB_BOLA, onclick: () => ir('#/ajustes') }),
      h('div.d-cab-menu', null,
        bola('inicio', 'brujula', 'Inicio', '#/'),
        bola('obra', 'grua', 'Reuniones de obra', '#/obra'),
        bola('viviendas', 'casa', 'Repasos de viviendas', '#/viviendas'),
        bola('listas', 'periodico', 'Partes', '#/listas'),
      ),
    );
  }

  /* ─── La de dentro: volver, título y acción ───

     La vuelta se guarda en una caja en vez de colgarla directamente del
     botón, para poder cambiarla después. Ponerle un onclick nuevo
     encima no valdría: h() engancha con addEventListener y el de antes
     seguiría disparando también, así que la flecha haría las dos cosas
     a la vez. */
  const salida = { ir: () => (typeof volver === 'function' ? volver() : ir(volver || '#/')) };
  const atras = h('button.d-bola', {
    'aria-label': 'Volver',
    onclick: () => salida.ir(),
  }, icon('arrowLeft'));
  const rotulo = h('div.d-titulo', null, titulo);

  const nodo = h('div.d-cab.dentro', null,
    atras,
    rotulo,
    derecha
      || (menu
        ? h('button.d-bola', { 'aria-label': 'Más opciones', onclick: menu }, icon('puntos'))
        /* Sin nada a la derecha se deja el hueco igualmente: si no, el
           título se descentra y el desplazamiento se nota al pasar de
           una pantalla a la siguiente. */
        : h('span.d-cab-hueco')),
  );

  nodo.ponerTitulo = (t) => { rotulo.textContent = t; };
  nodo.ponerVuelta = (fn) => { salida.ir = fn; };
  return nodo;
}


/** El cuándo de la tarjeta: «Hoy, 9:02 h» · «Ayer, 14:35 h» · «12 agosto, 2026». */
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function cuandoVilla(iso) {
  if (!iso) return 'Sin actividad aún';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${hora(iso)} h`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora(iso)} h`;
  return `${d.getDate()} ${MESES_LARGOS[d.getMonth()]}, ${d.getFullYear()}`;
}

/**
 * Los tres tramos del avance, los mismos en toda la app.
 *
 * Rojo oscuro hasta el 30, naranja oscuro hasta el 70, verde oscuro de
 * ahí para arriba. El color y la frase van juntos y viven aquí una
 * sola vez: si el chip de una tarjeta dijera «verde» y el anillo de
 * al lado saliera ámbar con el mismo porcentaje, quien lo mira deja de
 * fiarse de los dos.
 */
export function tramoAvance(pct) {
  const n = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if (n < 30) return { clase: 'rojo', frase: 'Aún quedan muchos repasos' };
  if (n < 70) return { clase: 'ambar', frase: 'Vamos viendo avances' };
  return { clase: 'verde', frase: 'Estamos a punto' };
}

/**
 * El banner mordido del diseño: rótulo arriba, cifra grande debajo y la
 * bola redonda asomando por la esquina de abajo a la derecha.
 *
 * Vivía metido en la portada, que era donde nació. Ahora lo usa también
 * el aviso de recorrido a medias de la ficha de la vivienda, y dos
 * copias de la misma forma se separan a la primera: basta que alguien
 * toque un relleno en un sitio y no en el otro.
 *
 * `icono` es el de la bola. De serie la flecha, que es lo que hacen los
 * tres de la portada: llevarte a una lista. Cuando el banner hace otra
 * cosa —seguir un recorrido, por ejemplo— el icono lo dice.
 */
export function bannerMordido({ clase, rotulo, cifra, icono = 'flechaSubir', adonde, alPinchar }) {
  return h('button.d-banner', {
    class: clase,
    onclick: () => { alPinchar?.(); if (adonde) ir(adonde); },
  },
    h('span.d-mordida'),
    h('span.d-mordida-esquina'),
    h('span.d-banner-texto', null,
      h('span.d-banner-rotulo', null, rotulo),
      h('span.d-banner-cifra', null, String(cifra)),
    ),
    h('span.d-banner-boton', null, icon(icono)),
  );
}

/**
 * La banda beige del avance de una vivienda: la frase arriba, el
 * porcentaje grande debajo y el anillo asomando por la esquina, con el
 * mordisco del diseño alrededor.
 *
 * La banda es siempre beige y el color lo lleva el anillo. Antes se
 * teñía la tarjeta entera y una villa al 20 % pintaba media pantalla
 * de rojo: la casa no va mal, va empezada.
 */
export function bannerAvance(pct, { total = 0 } = {}) {
  const t = tramoAvance(pct);
  const valor = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return h(`div.d-avance-banda.tramo-${t.clase}`, null,
    // El mordisco se dibuja con las mismas piezas que el banner de la
    // portada. Antes se recortaba con una máscara circular, y no era lo
    // mismo: la máscara agujerea, y donde el agujero llegaba al borde
    // dejaba una punta. El mordisco de verdad remata en curva.
    h('span.d-mordida'),
    h('span.d-mordida-esquina'),
    h('span.d-avance-texto', null,
      h('span.d-avance-rotulo', null, total ? t.frase : 'Sin repasos todavía'),
      h('span.d-avance-cifra', null, `${valor}%`),
    ),
    h('span.d-avance-anillo', null, anillo(valor, { tam: 55, grosor: 5, etiqueta: false })),
  );
}

/**
 * La tarjeta blanca con mordisco del diseño: cabecera con la mano y el
 * cuándo, las caras arriba a la derecha, el título grande, los dos
 * chips y el anillo de avance asomando por la esquina. La usan la
 * lista de viviendas y el módulo de la promoción en la home.
 */
export function tarjetaVilla({ titulo, cuando, caras = [], hechas, total, pct, alPinchar }) {
  const t = tramoAvance(pct);
  const chipPct = pct === 100 && total ? 'macizo' : t.clase;
  return h(`button.d-tarjeta.tramo-${t.clase}`, { onclick: alPinchar },
    h('span.d-mordida'),
    h('span.d-mordida-esquina'),
    h('div.d-tarjeta-cab', null,
      icon('toque'),
      h('span', null, cuando),
      h('span.d-tarjeta-caras', null,
        grupoAvatares(caras.slice(0, 3), { tam: 36, max: 3, solape: 12 })),
    ),
    h('div.d-tarjeta-titulo', null, titulo),
    h('div.d-tarjeta-pie', null,
      h('span.d-chip.grande', null, icon('listaChecks'), `${hechas} / ${total}`),
      h('span.d-chip.grande', { class: chipPct }, icon('fuego'), `${pct}%`),
    ),
    h('span.d-tarjeta-anillo', null, anillo(pct, { tam: 55, grosor: 5, etiqueta: false })),
  );
}


/**
 * La fecha de una tarea en el listado, con el formato del diseño:
 * hoy y ayer con la hora, este año día y mes abreviado con la hora, y
 * los años anteriores día, mes y año. La hora de una tarea de hace dos
 * anos no le importa a nadie; la de esta manana, si.
 */
export function cuandoTarea(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${hora(iso)}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora(iso)}`;
  if (d.getFullYear() === hoy.getFullYear()) return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}, ${hora(iso)}`;
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}, ${d.getFullYear()}`;
}

/**
 * El mismo cuándo, sin hora: «hoy», «ayer», «12 ago», «12 ago 2025».
 *
 * Para los sitios donde la fecha va pegada a otra cosa dentro de una
 * línea que no puede partirse —el rótulo de un banner, por ejemplo—.
 * Ahí la hora no decide nada y sí llega a echar el texto fuera del
 * ancho en un móvil estrecho.
 */
export function cuandoCorto(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'hoy';
  if (d.toDateString() === ayer.toDateString()) return 'ayer';
  const corto = `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() === hoy.getFullYear() ? corto : `${corto} ${d.getFullYear()}`;
}

/**
 * La tarjeta de una tarea en los listados de la obra: misma caja
 * blanca con mordisco que la de vivienda, pero con la fecha y la cara
 * de quien la dejo asi arriba, el texto grande, los chips de vivienda y
 * oficio, y la foto del remate asomando por la esquina.
 *
 * La foto no es decoracion: es lo que mira el arquitecto para decidir
 * sin entrar. Por eso ocupa el mismo sitio que el anillo de avance en
 * la otra tarjeta, que es donde el ojo ya sabe que hay algo.
 */
export function tarjetaTarea({ cuando, quien, titulo, villa, oficioObj, foto, chips = null, alPinchar }) {
  const bola = h('span.d-tarjeta-foto');
  if (foto) {
    bola.style.backgroundImage = `url("${foto}")`;
  } else if (oficioObj) {
    // Sin foto propia, la cara del oficio: su imagen si la tiene y, si
    // no, su inicial en color. Un circulo gris vacio en la esquina se
    // lee como que la app no ha cargado bien.
    bola.append(caraDeGremio(oficioObj, 55));
  }
  return h('button.d-tarjeta.d-tarea-fila', { onclick: alPinchar },
    h('span.d-mordida'),
    h('span.d-mordida-esquina'),
    h('div.d-tarjeta-cab', null,
      h('span', null, cuando),
      quien ? h('span.d-tarjeta-caras', null, avatar(quien, { tam: 36 })) : null,
    ),
    h('div.d-tarjeta-titulo', null, titulo),
    // Fuera de una vivienda los dos chips son la casa y el oficio.
    // Dentro de una, la casa ya la dice el título de la pantalla y lo
    // que hace falta saber es en qué habitación está el remate.
    h('div.d-tarjeta-pie', null,
      (chips || [villa, oficioObj?.nombre]).filter(Boolean)
        .map((c) => h('span.d-chip.tarea', null, c)),
    ),
    bola,
  );
}

/**
 * La hoja «Filtrar tareas»: arriba la vivienda —una sola— y debajo los
 * oficios, que se marcan varios.
 *
 * Solo se ofrece lo que existe. Si no queda nada de pladur, pladur no
 * sale: un filtro que lleva a una lista vacia es una promesa rota, y en
 * obra se traduce en «esto no funciona».
 *
 * @param {object} p
 * @param {string} p.vivienda      unidadId elegida, o '' para todas
 * @param {string[]} p.oficios     ids de oficio marcados
 * @param {Array} p.viviendas      [{id, nombre}] con tareas en este estado
 * @param {Array} p.oficiosLibres  [{id, nombre}] con tareas en este estado
 * @returns {Promise<{vivienda: string, oficios: string[]}|null>} null si se cierra
 */
export function hojaFiltroTareas({ vivienda = '', oficios = [], viviendas = [], oficiosLibres = [], conVivienda = true }) {
  return new Promise((resolve) => {
    let elegida = vivienda;
    const marcados = new Set(oficios);

    const rotuloVivienda = () => viviendas.find((v) => v.id === elegida)?.nombre || 'Todas las viviendas';
    const selector = h('button.d-carta-selector', {
      onclick: () => menuFlotante((cerrar) => [
        filaMenu(null, 'Todas las viviendas', () => { cerrar(); elegida = ''; refrescar(); }),
        ...viviendas.map((v) => filaMenu(null, v.nombre, () => { cerrar(); elegida = v.id; refrescar(); })),
      ], { conX: true }),
    }, h('span', null, rotuloVivienda()), icon('caretAbajo'));

    const boton = h('button', { onclick: () => { cerrar(); resolve({ vivienda: elegida, oficios: [...marcados] }); } }, 'Aplicar filtros');

    const refrescar = () => {
      selector.querySelector('span').textContent = rotuloVivienda();
      // Se puede aplicar cuando hay algo que aplicar, y tambien cuando
      // se quita todo teniendo filtros puestos: quitarlos es aplicar.
      const hayAlgo = !!elegida || marcados.size > 0;
      const habia = !!vivienda || oficios.length > 0;
      boton.disabled = !hayAlgo && !habia;
      lista.querySelectorAll('.d-marcable-circulo').forEach((c) => {
        c.classList.toggle('marcado', marcados.has(c.dataset.oficio));
        c.replaceChildren(marcados.has(c.dataset.oficio) ? icon('check', 18) : '');
      });
    };

    const fila = (o) => {
      const circulo = h('span.d-marcable-circulo', { 'data-oficio': o.id });
      return h('button.d-marcable', {
        onclick: () => {
          if (marcados.has(o.id)) marcados.delete(o.id);
          else marcados.add(o.id);
          refrescar();
        },
      }, caraDeGremio(o, 36), h('span.d-marcable-rotulo', null, o.nombre), circulo);
    };

    const lista = h('div.d-carta-lista', null,
      h('div.d-marcable.cabecera', null, h('span.d-marcable-rotulo', null, 'Oficios')),
      ...oficiosLibres.map(fila),
    );

    const carta = h('div.d-carta.tareas', null,
      h('div.d-carta-cab', null,
        h('span', null, 'Filtrar repasos'),
        h('button.x', { 'aria-label': 'Cerrar', onclick: () => { cerrar(); resolve(null); } }, icon('x')),
      ),
      // Dentro de una vivienda no se elige vivienda: ya estás en ella,
      // y una fila que dice «Todas las viviendas» ahí solo invita a
      // salirse de la casa que estás repasando sin querer.
      conVivienda ? h('div.d-carta-selector-caja', null, selector) : null,
      lista,
      h('div.d-carta-pie', null, boton),
    );

    const velo = h('div.d-velo.abajo', {
      onclick: (ev) => { if (ev.target === velo) { cerrar(); resolve(null); } },
    }, carta);
    const cerrar = () => velo.remove();
    document.body.append(velo);
    refrescar();
  });
}
