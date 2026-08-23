/* Ajustes: cuenta, sincronización, administración de usuarios y datos
   guardados en el dispositivo. */
import { h, icon, sheet, toast, confirmSheet, avatar, pesoLegible } from '../ui.js';
import * as store from '../store.js';
import * as api from '../api.js';
import * as db from '../db.js';
import {
  barraSync, chevron, cabecera, CAB_BOLA, hojaFoto, menuTarjeta,
  ctaAccion, ctaCancelar, abrirPagina,
} from '../piezas.js';
import * as ejemplos from '../ejemplos.js';
import { PROMOCIONES } from '../catalog.js';
import {
  usaIA, ponerUsaIA, juntaFotos, ponerJuntaFotos,
  ordenPdf, ponerOrdenPdf, ORDENES_PDF,
} from '../ajustesLocales.js';
import { ir, refrescar, versionEsperando, aplicarVersionEsperando } from '../app.js';

export async function render() {
  const u = store.sesion();
  const ocupacion = await espacioUsado();
  const admin = store.esAdmin();
  const hayEjemplos = admin ? await ejemplos.cuantos() : 0;
  const relevo = await versionEsperando();

  // Si el servidor es viejo y todavía no conoce la ruta, la fila se
  // enseña igual como «sin poner»: es lo que hay, y al pulsarla dirá
  // qué falta en vez de desaparecer sin explicación.
  let claude = null;
  let oido = null;
  let voces = null;
  if (admin && api.HAY_SERVIDOR && !u.local) {
    try { claude = await api.claudeEstado(); } catch { claude = { puesta: false, final: '' }; }
    try { oido = await api.oidoEstado(); } catch { oido = { puesta: false, final: '' }; }
    try { voces = await api.vocesEstado(); } catch { voces = { puesta: false, final: '' }; }
  }

  /** Una fila de tarjeta: icono, rótulo, detalle y lo que haya a la derecha. */
  const item = (ico, rotulo, sub, onclick, { derecha = null, rojo = false } = {}) =>
    h(onclick ? 'button.d-item' : 'div.d-item', { class: rojo ? 'rojo' : '', onclick },
      icon(ico, 22),
      h('span.grow', null, rotulo, sub ? h('span.d-item-sub', null, sub) : null),
      derecha !== null ? derecha : (onclick ? chevron() : null),
    );

  /** El interruptor de la IA, con la palanca del diseño. */
  const casillaIA = h('input', { type: 'checkbox', role: 'switch', checked: usaIA(u) || null });
  casillaIA.addEventListener('change', () => ponerUsaIA(u, casillaIA.checked));

  const casillaJuntar = h('input', { type: 'checkbox', role: 'switch', checked: juntaFotos(u) || null });
  casillaJuntar.addEventListener('change', () => ponerJuntaFotos(u, casillaJuntar.checked));

  /* Cómo se agrupa el PDF de una vivienda. Dos opciones, así que no es
     un interruptor —¿encendido sería cuál?—: es una fila con flechita
     que abre la tarjeta de elegir de siempre y enseña debajo lo que hay
     puesto ahora, para no tener que abrirla solo por mirar. */
  const elegirOrdenPdf = async () => {
    const actual = ordenPdf(u);
    const elegido = await menuTarjeta('Orden del PDF', ORDENES_PDF.map((o) => ({
      id: o.id,
      icono: o.id === actual ? 'check' : (o.id === 'oficio' ? 'users' : 'casa'),
      rotulo: o.rotulo,
      sub: o.sub,
    })));
    if (!elegido || elegido === actual) return;
    ponerOrdenPdf(u, elegido);
    refrescar();
    toast(`Los PDF saldrán ${ORDENES_PDF.find((o) => o.id === elegido).rotulo.toLowerCase()}`);
  };

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      // La cabecera de siempre, con la propia cara a la derecha en vez
      // del menú: quieta, solo para saber de quién son estos ajustes.
      cabecera({
        volver: '#/',
        titulo: 'Ajustes',
        derecha: avatar(u, { tam: CAB_BOLA }),
      }),

      // Quién eres. La plantilla no lo trae, pero en una app con diez
      // usuarios que comparten móviles de obra, verlo evita sustos.
      //
      // Aquí no va la cara: ya está arriba, en la cabecera, a dos dedos
      // de distancia. Dos veces la misma bolita en la misma pantalla no
      // añade nada y ensucia el arranque de la columna, así que el
      // nombre y el correo empiezan en el margen, como todo lo demás.
      h('div', { style: { margin: '18px 2px 4px' } },
        h('div', { style: { fontSize: '18px', fontWeight: '500' } }, u?.nombre || 'Sin identificar'),
        h('div', { style: { fontSize: '14px', color: 'var(--d-gris)' } },
          u?.email || (u?.local ? 'Modo local' : '')),
      ),

      h('div.d-grupo', null,
        h('p.d-grupo-titulo', null, 'Cuenta'),
        api.HAY_SERVIDOR && !u.local ? item('user', u.avatar ? 'Cambiar mi foto' : 'Poner una foto',
          'Si no hay foto se ven tus iniciales', async () => {
            if (await hojaFoto(u)) { await store.refrescarSesion(); refrescar(); }
          }) : null,
        api.HAY_SERVIDOR && !u.local ? item('key', 'Cambiar mi contraseña', null, () => cambiarPassword()) : null,
        admin && api.HAY_SERVIDOR && !u.local
          ? item('users', 'Usuarios', 'Alta y baja del equipo', () => ir('#/usuarios'))
          : null,
        admin && api.HAY_SERVIDOR && !u.local
          ? item('casa', 'Estancias de la obra', 'Añadir, renombrar o quitar', () => ir('#/estancias'))
          : null,
      ),

      /* El grupo sale siempre. Antes colgaba entero de que hubiera
         servidor porque todo lo de dentro era de la IA; el orden del
         PDF se genera en el propio móvil y no depende de nada. */
      h('div.d-grupo', null,
        h('p.d-grupo-titulo', null, 'Preferencias'),
        api.HAY_SERVIDOR ? item('edit', 'Que la IA proponga el texto',
          'Al crear un repaso desde una foto o la galería', null, { derecha: casillaIA }) : null,
        // En un recorrido es normal sacar dos fotos de lo mismo: una de
        // lejos para situarlo y otra de cerca. Encendido, eso es una
        // tarea con dos fotos; apagado, dos tareas.
        api.HAY_SERVIDOR ? item('image', 'Juntar las fotos de un mismo repaso',
          'En un recorrido, varias fotos de la misma cosa salen como un solo repaso',
          null, { derecha: casillaJuntar }) : null,
        // Cómo sale partida la hoja que se imprime o se manda por
        // WhatsApp. El detalle dice lo que hay puesto ahora mismo.
        item('documento', 'Orden del PDF de una vivienda',
          ORDENES_PDF.find((o) => o.id === ordenPdf(u)).rotulo, elegirOrdenPdf),
      ),

      // Solo aparece cuando de verdad hay una versión esperando. Es la
      // salida a mano para quien nunca cierra la aplicación: el iPhone
      // las deja vivas días y podría quedarse atrás sin saberlo.
      relevo ? h('div.d-grupo', null,
        h('p.d-grupo-titulo', null, 'Versión'),
        item('refresh', 'Poner la versión nueva',
          'La aplicación se recarga; lo que no esté mandado se pierde',
          () => ponerVersionNueva(relevo)),
      ) : null,

      h('div.d-grupo', null,
        h('p.d-grupo-titulo', null, 'Datos y sincronización'),
        barraSync(),
        item('refresh', 'Sincronizar ahora', 'Sube lo pendiente y baja lo nuevo', async () => {
          if (!navigator.onLine) return toast('Sin conexión', 'err');
          await store.sincronizar({ forzar: true });
          toast(store.estadoSync.error ? 'No se pudo sincronizar' : 'Sincronizado',
            store.estadoSync.error ? 'err' : '');
        }),
        item('image', `${ocupacion.medios} archivos en este móvil`,
          [pesoLegible(ocupacion.bytes), ocupacion.sinSubir ? `${ocupacion.sinSubir} sin subir` : ''].filter(Boolean).join(' · '),
          null, { derecha: h('span') }),
        item('trash', 'Vaciar la caché local', 'No borra nada del servidor', () => vaciarCache()),
      ),

      // Solo para quien administra: los datos de muestra y el servidor.
      admin ? h('div.d-grupo', null,
        h('p.d-grupo-titulo', null, 'Datos de ejemplo'),
        item('edit', 'Arreglar los textos de prueba',
          'Cambia lo escrito a lo loco por repasos de verdad', () => arreglarPruebas()),
        item('trash', 'Borrar los repasos sin fotografía',
          'Para siempre: un repaso sin foto no existe', () => borrarSinFoto()),
        item('users', 'Crear partes de ejemplo',
          'Tres partes firmados por el equipo, para ver cómo queda', () => montarEjemplos()),
        hayEjemplos ? item('trash', 'Quitar los partes de ejemplo',
          `${hayEjemplos} ${hayEjemplos === 1 ? 'parte puesto' : 'partes puestos'}`,
          () => quitarEjemplos()) : null,
      ) : null,

      admin && api.HAY_SERVIDOR && !u.local ? h('div.d-grupo', null,
        h('p.d-grupo-titulo', null, 'Servidor'),
        item('cloud', 'Comprobar la salida a internet',
          'Si el hosting puede llamar a servicios de fuera', (e) => probarSalida(e)),
        item('key', 'Clave de Anthropic',
          claude?.puesta ? `Puesta · termina en ${claude.final}` : 'Sin poner · el recorrido no redacta solo',
          () => hojaClave(claude)),
        item('mic', 'Clave de OpenAI',
          oido?.puesta ? `Puesta · termina en ${oido.final}` : 'Sin poner · lo que digas no se transcribe',
          () => hojaClaveOido(oido)),
        item('users', 'Clave de pyannote (huellas de voz)',
          voces?.puesta ? `Puesta · termina en ${voces.final}` : 'Sin poner · las voces se asignan a mano cada día',
          () => hojaClaveVoces(voces)),
      ) : null,

      h('div.d-grupo', null,
        item('logout', 'Cerrar sesión', null, () => cerrarSesion(), { rojo: true, derecha: h('span') }),
      ),

      // Lo último de la pantalla, después de cerrar sesión: las
      // condiciones se consultan de vez en cuando y no tienen que
      // estorbar a lo que se usa a diario. Apple exige además que la
      // política de privacidad se pueda leer desde dentro de la propia
      // aplicación, no solo en la ficha de la tienda.
      h('div.d-grupo', null,
        h('p.d-grupo-titulo', null, 'Condiciones'),
        item('periodico', 'Política de privacidad', 'Qué se guarda, quién lo ve y cuánto tiempo',
          () => abrirPagina('privacidad.html')),
        item('hilo', 'Soporte', 'Cómo pedir ayuda o dar de alta a alguien',
          () => abrirPagina('soporte.html')),
      ),

      h('p', { style: { margin: '24px 0 8px', textAlign: 'center', fontSize: '13px', color: 'var(--d-gris)' } },
        'UNIK Works · versión ' + (window.REPASOS_CONFIG?.build || 'local')),
      // El chivato de la letra: dice en el propio móvil si la
      // tipografía del rediseño ha cargado o el navegador la ha
      // sustituido. Para diagnosticar sin ordenador de por medio.
      chivatoDeLetra(),
    ],
  };
}

/**
 * Una fila con interruptor. No lleva flecha ni navega: el cambio pasa
 * aquí mismo, y una flecha prometería una pantalla que no existe.
 *
 * El estado se guarda al soltarlo y no hay botón de guardar: es un
 * sí/no en el propio teléfono, y pedir confirmación para eso sobra.
 */
function interruptor(ico, titulo, sub, puesto, alCambiar) {
  const casilla = h('input', { type: 'checkbox', role: 'switch', checked: puesto || null });
  casilla.addEventListener('change', () => alCambiar(casilla.checked));
  return h('label.row.conmutador', null,
    h('div.row-lead', null, icon(ico, 18)),
    h('div.grow', null,
      h('div.row-title', null, titulo),
      sub && h('div.row-sub', null, sub),
    ),
    casilla,
  );
}

function fila(ico, titulo, sub, onclick, peligro = false) {
  return h('button.row', { class: peligro ? 'danger' : '', onclick },
    h('div.row-lead', null, icon(ico, 18)),
    h('div.grow', null,
      h('div.row-title', null, titulo),
      sub && h('div.row-sub', null, sub),
    ),
    chevron(),
  );
}

/**
 * Comprueba, desde el móvil, si el hosting puede salir a internet por
 * su cuenta. El resultado se escribe en la propia fila en vez de en un
 * aviso que se va: es un dato que hay que poder leer con calma y, si
 * dice que no, copiar tal cual en el correo al hosting.
 */
async function probarSalida(evento) {
  const boton = evento.currentTarget;
  const sub = boton.querySelector('.row-sub');
  sub.classList.add('libre');
  sub.textContent = 'Probando…';
  boton.disabled = true;
  try {
    const r = await api.salidaAInternet();
    sub.textContent = r.puede
      ? `${r.motivo} (${r.ms} ms)`
      : `${r.motivo} — ${r.detalle || ''}`.trim();
    boton.classList.toggle('danger', !r.puede);
  } catch (e) {
    sub.textContent = e?.status === 404
      ? 'El servidor todavía no tiene esta comprobación instalada.'
      : 'No se ha podido preguntar al servidor.';
    boton.classList.add('danger');
  } finally {
    boton.disabled = false;
  }
}

/**
 * La clave de Anthropic. Se pega aquí una vez, desde el móvil, y se
 * queda en el servidor —en api/datos/, la carpeta que el navegador
 * tiene prohibida, junto a la base de datos—. No vuelve nunca: de ahí
 * en adelante lo único que se ve son sus cuatro últimos caracteres.
 *
 * Se pide aquí y no en un fichero del hosting porque el fichero habría
 * que editarlo por FTP, y esto se hace desde el teléfono en veinte
 * segundos y se puede deshacer igual de rápido.
 */
function hojaClave(estado) {
  return sheet((cerrar) => {
    const campo = h('input.input', {
      type: 'password', placeholder: 'sk-ant-…',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    const guardar = ctaAccion('GUARDAR LA CLAVE', { icono: 'check' });

    const fallo = (texto) => {
      aviso.textContent = texto;
      aviso.style.display = 'block';
      guardar.disabled = false;
      guardar.querySelector('.grow').textContent = 'GUARDAR LA CLAVE';
    };

    guardar.addEventListener('click', async () => {
      aviso.style.display = 'none';
      const clave = campo.value.trim();
      if (!clave) return fallo('No has pegado nada.');
      guardar.disabled = true;
      guardar.querySelector('.grow').textContent = 'GUARDANDO…';
      try {
        await api.claudePonerClave(clave);
        cerrar(true);
        toast('Clave guardada · el recorrido ya puede redactar solo');
        refrescar();
      } catch (e) {
        fallo(e?.message || 'No se ha podido guardar.');
      }
    });

    return [
      h('h2.title', null, 'Clave de Anthropic'),
      h('p.sub', { style: { marginTop: '6px' } },
        'Con ella, al terminar un recorrido los repasos salen escritos a partir '
        + 'de lo que dijiste, y tú solo repasas. Se guarda en el servidor y no '
        + 'vuelve a salir de ahí.'),
      estado?.puesta
        ? h('p.hint', { style: { marginTop: '10px' } },
            `Ahora hay una puesta que termina en ${estado.final}. Si pegas otra, la sustituye.`)
        : null,
      h('div.stack', { style: { marginTop: '14px' } }, campo),
      aviso,
      h('p.hint', { style: { marginTop: '10px' } },
        `Modelo: ${estado?.modelo || 'claude-opus-5'}. Cada recorrido cuesta unos céntimos.`),
      guardar,
      estado?.puesta
        ? h('button.btn.ghost.full', {
            style: { marginTop: '8px' },
            onclick: async () => {
              await api.claudeQuitarClave();
              cerrar(true);
              toast('Clave retirada');
              refrescar();
            },
          }, 'Quitar la clave del servidor')
        : null,
      ctaCancelar(() => cerrar(false)),
    ];
  });
}

/**
 * La clave de OpenAI: la del oído.
 *
 * Va aparte de la de Anthropic porque son dos cuentas y dos facturas
 * distintas, y porque se puede tener una sin la otra: con la de
 * Anthropic sola el recorrido se redacta mirando las fotos, y esta lo
 * que añade es que además se use lo que se dijo en voz alta.
 */
function hojaClaveOido(estado) {
  return sheet((cerrar) => {
    const campo = h('input.input', {
      type: 'password', placeholder: 'sk-…',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    const guardar = ctaAccion('GUARDAR LA CLAVE', { icono: 'check' });

    const fallo = (texto) => {
      aviso.textContent = texto;
      aviso.style.display = 'block';
      guardar.disabled = false;
      guardar.querySelector('.grow').textContent = 'GUARDAR LA CLAVE';
    };

    guardar.addEventListener('click', async () => {
      aviso.style.display = 'none';
      const clave = campo.value.trim();
      if (!clave) return fallo('No has pegado nada.');
      guardar.disabled = true;
      guardar.querySelector('.grow').textContent = 'GUARDANDO…';
      try {
        await api.oidoPonerClave(clave);
        cerrar(true);
        toast('Clave guardada · lo que digas ya se transcribe solo');
        refrescar();
      } catch (e) {
        fallo(e?.message || 'No se ha podido guardar.');
      }
    });

    return [
      h('h2.title', null, 'Clave de OpenAI'),
      h('p.sub', { style: { marginTop: '6px' } },
        'Es la que pasa a texto lo que vas diciendo durante el recorrido, para '
        + 'que los repasos salgan de tus palabras y no solo de lo que se ve en '
        + 'la foto. Se guarda en el servidor y no vuelve a salir de ahí.'),
      estado?.puesta
        ? h('p.hint', { style: { marginTop: '10px' } },
            `Ahora hay una puesta que termina en ${estado.final}. Si pegas otra, la sustituye.`)
        : null,
      h('div.stack', { style: { marginTop: '14px' } }, campo),
      aviso,
      h('p.hint', { style: { marginTop: '10px' } },
        `Modelo: ${estado?.modelo || 'gpt-4o-transcribe'}. Medio céntimo por minuto grabado.`),
      guardar,
      estado?.puesta
        ? h('button.btn.ghost.full', {
            style: { marginTop: '8px' },
            onclick: async () => {
              await api.oidoQuitarClave();
              cerrar(true);
              toast('Clave retirada');
              refrescar();
            },
          }, 'Quitar la clave del servidor')
        : null,
      ctaCancelar(() => cerrar(false)),
    ];
  });
}

/**
 * La clave de pyannote: la memoria de las voces. Sin ella, la pantalla
 * de «¿quién es quién?» funciona igual pero pregunta cada día; con
 * ella, la app enrola cada voz asignada y en la reunión siguiente pone
 * los nombres sola.
 */
function hojaClaveVoces(estado) {
  return sheet((cerrar) => {
    const campo = h('input.input', {
      type: 'password', placeholder: 'Clave de api.pyannote.ai…',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    const guardar = ctaAccion('GUARDAR LA CLAVE', { icono: 'check' });

    const fallo = (texto) => {
      aviso.textContent = texto;
      aviso.style.display = 'block';
      guardar.disabled = false;
      guardar.querySelector('.grow').textContent = 'GUARDAR LA CLAVE';
    };

    guardar.addEventListener('click', async () => {
      aviso.style.display = 'none';
      const clave = campo.value.trim();
      if (!clave) return fallo('No has pegado nada.');
      guardar.disabled = true;
      guardar.querySelector('.grow').textContent = 'GUARDANDO…';
      try {
        await api.vocesPonerClave(clave);
        cerrar(true);
        toast('Clave guardada · la app irá aprendiendo las voces');
        refrescar();
      } catch (e) {
        fallo(e?.message || 'No se ha podido guardar.');
      }
    });

    return [
      h('h2.title', null, 'Clave de pyannote'),
      h('p.sub', { style: { marginTop: '6px' } },
        'Es la memoria de las voces de la obra: con ella, cada voz que asignes '
        + 'en un acta queda aprendida y en la reunión siguiente sale ya con su '
        + 'nombre. La huella se guarda en NUESTRO servidor, no en el suyo. '
        + 'La cuenta se hace en pyannote.ai (hay prueba gratuita de 30 días).'),
      estado?.puesta
        ? h('p.hint', { style: { marginTop: '10px' } },
            `Ahora hay una puesta que termina en ${estado.final}. Si pegas otra, la sustituye.`)
        : null,
      h('div.stack', { style: { marginTop: '14px' } }, campo),
      aviso,
      h('p.hint', { style: { marginTop: '10px' } },
        'Ojo: la voz es un dato personal. Avisa al equipo y apunta su conformidad '
        + 'antes de enrolar a nadie; quitar a alguien es borrar su voz en Ajustes.'),
      guardar,
      estado?.puesta
        ? h('button.btn.ghost.full', {
            style: { marginTop: '8px' },
            onclick: async () => {
              await api.vocesQuitarClave();
              cerrar(true);
              toast('Clave retirada');
              refrescar();
            },
          }, 'Quitar la clave del servidor')
        : null,
      ctaCancelar(() => cerrar(false)),
    ];
  });
}

async function espacioUsado() {
  const medios = (await db.getAll('medios')).filter((m) => !m.borrada);
  return {
    medios: medios.length,
    bytes: medios.reduce((s, m) => s + (m.blob?.size || 0), 0),
    sinSubir: medios.filter((m) => !m.subido).length,
  };
}

function cambiarPassword() {
  return sheet((cerrar) => {
    const actual = h('input.input', { type: 'password', placeholder: 'Contraseña actual', autocomplete: 'current-password' });
    const nueva = h('input.input', { type: 'password', placeholder: 'Contraseña nueva', autocomplete: 'new-password' });
    const repetir = h('input.input', { type: 'password', placeholder: 'Repite la nueva', autocomplete: 'new-password' });
    const aviso = h('p.hint.err', { style: { display: 'none' } });

    return [
      h('h2.title', null, 'Cambiar contraseña'),
      h('div.stack', null, actual, nueva, repetir),
      aviso,
      h('button.btn.accent.full', {
        onclick: async () => {
          aviso.style.display = 'none';
          if (nueva.value.length < 8) {
            aviso.textContent = 'La contraseña nueva debe tener al menos 8 caracteres.';
            aviso.style.display = 'block'; return;
          }
          if (nueva.value !== repetir.value) {
            aviso.textContent = 'Las dos contraseñas nuevas no coinciden.';
            aviso.style.display = 'block'; return;
          }
          try {
            await api.cambiarPassword(actual.value, nueva.value);
            cerrar(true);
            toast('Contraseña actualizada');
          } catch (e) {
            aviso.textContent = e.status === 401 ? 'La contraseña actual no es correcta.' : e.message;
            aviso.style.display = 'block';
          }
        },
      }, 'Guardar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}

async function vaciarCache() {
  const pendientes = await db.numPendientes();
  if (pendientes > 0) {
    return toast(`Hay ${pendientes} cambios sin subir. Sincroniza antes de vaciar.`, 'err');
  }
  if (!await confirmSheet({
    title: '¿Vaciar la caché?',
    text: 'Se borran del dispositivo las fotos y los datos ya sincronizados. Se vuelven a descargar del servidor cuando hagan falta.',
    ok: 'Vaciar',
  })) return;
  await db.vaciar('medios');
  await db.vaciar('tareas');
  await db.vaciar('listas');
  await db.meta.del('ultimoSync');
  await store.sincronizar({ forzar: true });
  toast('Caché vaciada');
  location.reload();
}

async function cerrarSesion() {
  const pendientes = await db.numPendientes();
  if (!await confirmSheet({
    title: '¿Cerrar sesión?',
    text: pendientes > 0
      ? `Quedan ${pendientes} cambios sin subir. Se conservarán en este dispositivo hasta que vuelvas a entrar.`
      : 'Se borrarán los datos guardados en este dispositivo.',
    ok: 'Cerrar sesión', danger: true,
  })) return;
  await store.cerrarSesion();
  location.hash = '#/entrar';
  location.reload();
}

/* ─── Datos de ejemplo ────────────────────────────────────────── */
async function montarEjemplos() {
  const p = PROMOCIONES.find((x) => x.activa);
  if (!p) return toast('No hay ninguna promoción activa', 'err');

  const seguir = await confirmSheet({
    title: '¿Crear partes de ejemplo?',
    text: 'Se montan tres partes en viviendas que no tengan nada, firmados por '
      + 'gente del equipo, para ver cómo queda la app con varias personas. '
      + 'Se llaman «Ejemplo · …» y se pueden quitar desde aquí mismo.',
    ok: 'Crear',
  });
  if (!seguir) return;

  try {
    const { actas, tareas } = await ejemplos.crear(p.id);
    toast(`${actas} partes y ${tareas} repasos de ejemplo`);
    refrescar();
  } catch (e) {
    toast(e.message || 'No se pudieron crear', 'err');
  }
}

/**
 * Cambia los textos escritos a lo loco por repasos de verdad.
 *
 * Enseña primero la lista con lo que hay y lo que quedaría, cada uno
 * con su casilla: esto reescribe tareas de la obra, y hacerlo a ciegas
 * sería la manera más rápida de cargarse una que sí valía. Todas vienen
 * marcadas, pero quien mira quita las que no toquen.
 */
async function arreglarPruebas() {
  const p = PROMOCIONES.find((x) => x.activa);
  if (!p) return toast('No hay ninguna promoción activa', 'err');

  const candidatos = await ejemplos.candidatosDePrueba(p.id);
  if (!candidatos.length) return toast('No hay ningún texto de prueba');

  const marcadas = new Set(candidatos.map((c) => c.tarea.id));
  const contador = h('span');
  const pintarContador = () => {
    contador.textContent = marcadas.size === 1 ? 'Arreglar 1 repaso' : `Arreglar ${marcadas.size} repasos`;
  };

  const seguir = await sheet((cerrar) => {
    const boton = h('button.btn.ink.full', {
      onclick: () => cerrar(true),
    }, contador);
    pintarContador();
    return [
      h('h2.title', null, 'Textos de prueba'),
      h('p.sub', null,
        `${candidatos.length} ${candidatos.length === 1 ? 'repaso parece' : 'repasos parecen'} `
        + 'escritas para probar. Cada una pasaría a ser un repaso de verdad, '
        + 'con su oficio y su estancia. Quita las que sí valgan.'),
      h('div.stack', { style: { marginTop: '14px', gap: '10px' } },
        candidatos.map((c) => {
          const casilla = h('input', { type: 'checkbox', checked: true });
          casilla.addEventListener('change', () => {
            if (casilla.checked) marcadas.add(c.tarea.id); else marcadas.delete(c.tarea.id);
            pintarContador();
            boton.disabled = !marcadas.size;
          });
          return h('label.row', null,
            h('div.row-lead', null, casilla),
            h('div.grow', null,
              h('div.row-sub', { style: { textDecoration: 'line-through' } }, c.tarea.texto || 'Sin texto'),
              h('div.row-title', null, c.nuevo.texto),
            ),
          );
        })),
      boton,
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
  if (!seguir || !marcadas.size) return;

  const elegidos = candidatos.filter((c) => marcadas.has(c.tarea.id));
  toast('Arreglando…');
  const { hechas, conFoto } = await ejemplos.arreglarTextos(elegidos);
  toast(`${hechas} ${hechas === 1 ? 'repaso arreglado' : 'repasos arreglados'}`
    + (conFoto ? ` · ${conFoto} con foto` : ''));
  store.sincronizar({ forzar: true });
  refrescar();
}

/**
 * Borra PARA SIEMPRE las tareas que no tienen ninguna fotografía.
 *
 * Es la orden de Fran para los restos de la época de pruebas: una
 * tarea sin foto no existe, así que ni se viste ni se guarda — se va.
 * La purga automática ya barre sola tras sincronizar (ver store.js);
 * este botón es la escoba a mano: enseña la lista con sus casillas y
 * borra lo marcado, también lo recién creado, porque aquí quien mira
 * decide.
 */
async function borrarSinFoto() {
  const p = PROMOCIONES.find((x) => x.activa);
  if (!p) return toast('No hay ninguna promoción activa', 'err');

  const cojas = await ejemplos.tareasSinFotografia(p.id);
  if (!cojas.length) return toast('Ningún repaso está sin fotografía');

  const marcadas = new Set(cojas.map((t) => t.id));
  const contador = h('span');
  const pintarContador = () => {
    contador.textContent = marcadas.size === 1 ? 'Borrar 1 para siempre' : `Borrar ${marcadas.size} para siempre`;
  };

  const seguir = await sheet((cerrar) => {
    const boton = h('button.btn.danger.full', { onclick: () => cerrar(true) }, contador);
    pintarContador();
    return [
      h('h2.title', null, 'Repasos sin fotografía'),
      h('p.sub', null,
        `${cojas.length} ${cojas.length === 1 ? 'repaso no tiene' : 'repasos no tienen'} ninguna imagen. `
        + 'Un repaso sin foto no existe: los marcados se borran para siempre, '
        + 'en todos los móviles. No se pueden recuperar.'),
      h('div.stack', { style: { marginTop: '14px', gap: '10px' } },
        cojas.map((t) => {
          const casilla = h('input', { type: 'checkbox', checked: true });
          casilla.addEventListener('change', () => {
            if (casilla.checked) marcadas.add(t.id); else marcadas.delete(t.id);
            pintarContador();
            boton.disabled = !marcadas.size;
          });
          return h('label.row', null,
            h('div.row-lead', null, casilla),
            h('div.grow', null, h('div.row-title', null, t.texto || 'Sin texto')),
          );
        })),
      boton,
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
  if (!seguir || !marcadas.size) return;

  for (const t of cojas.filter((x) => marcadas.has(x.id))) {
    await store.borrarTarea(t.id);
  }
  toast(`${marcadas.size} ${marcadas.size === 1 ? 'repaso borrado' : 'repasos borrados'} para siempre`, '', { icono: 'trash' });
  store.sincronizar({ forzar: true });
  refrescar();
}

/**
 * Pone la versión que estuviera esperando, ahora mismo.
 *
 * Se avisa de lo que cuesta: recargar es empezar de cero, y una foto
 * hecha y sin mandar se queda por el camino. Por eso esto es un botón
 * y no algo que pase solo mientras alguien trabaja.
 */
async function ponerVersionNueva(registro) {
  const seguir = await confirmSheet({
    title: '¿Poner la versión nueva?',
    text: 'La aplicación se recarga. Si tienes una foto hecha y sin mandar o algo a medio escribir, mándalo antes.',
    ok: 'Poner la versión nueva',
  });
  if (!seguir) return;
  toast('Poniendo la versión nueva…');
  // Resuelve cuando el salto ha prendido de verdad. Si no prende —un
  // fetch colgado puede bloquear la activación, ver app.js—, la
  // recarga limpia la sesión y el arranque lo pone él solo.
  if (!await aplicarVersionEsperando(registro)) location.reload();
}

async function quitarEjemplos() {
  const seguir = await confirmSheet({
    title: '¿Quitar los partes de ejemplo?',
    text: 'Solo se retiran las que empiezan por «Ejemplo · ». El repaso real no se toca.',
    ok: 'Quitar', danger: true,
  });
  if (!seguir) return;
  const n = await ejemplos.borrar();
  toast(n ? `${n} ${n === 1 ? 'parte retirado' : 'partes retirados'}` : 'No había ninguna');
  refrescar();
}

/**
 * El chivato de la letra. `document.fonts.check` dice si la familia
 * está cargada de verdad; se pregunta también al cabo de un momento,
 * porque con `font-display: swap` puede estar aún de camino cuando se
 * pinta esta pantalla.
 */
function chivatoDeLetra() {
  const linea = h('p', {
    style: { margin: '0 0 8px', textAlign: 'center', fontSize: '13px', color: 'var(--d-gris)' },
  });
  const mirar = () => {
    const cargada = document.fonts?.check?.('500 16px "Neue Haas Grotesk Display Pro"');
    linea.textContent = cargada
      ? 'Letra del rediseño: cargada'
      : 'Letra del rediseño: SIN CARGAR (el móvil está usando la de reserva)';
    if (!cargada) linea.style.color = 'var(--d-rojo)';
  };
  mirar();
  document.fonts?.ready?.then(mirar);
  setTimeout(mirar, 2500);
  return linea;
}
