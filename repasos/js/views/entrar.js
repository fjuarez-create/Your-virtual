/* Pantalla de entrada. Con backend pide correo y contraseña; sin él
   (modo local, útil para probar antes de publicar) basta con el nombre
   de quien va a firmar los repasos. */
import { h, icon, toast } from '../ui.js';
import * as store from '../store.js';
import * as api from '../api.js';
import { ir } from '../app.js';

export async function render() {
  const cabecera = [
    h('div', { style: { paddingTop: '8vh' } },
      h('div.avatar', { style: { width: '54px', height: '54px', flex: '0 0 54px', borderRadius: '17px' } }, icon('check', 26)),
    ),
    h('h1.display', { style: { marginTop: '22px' } }, 'UNIK', h('br'), h('span.thin', null, 'repasos')),
    h('p.sub', { style: { marginTop: '12px', maxWidth: '280px' } },
      'Repasos de pre-entrega y post-entrega de las viviendas.'),
  ];

  return api.HAY_SERVIDOR
    ? { contenido: [...cabecera, formularioServidor()], sinTabs: true }
    : { contenido: [...cabecera, formularioLocal()], sinTabs: true };
}

function formularioServidor() {
  const email = h('input.input', { type: 'email', name: 'email', placeholder: 'nombre@unikdi.com', autocomplete: 'username', inputmode: 'email' });
  const pass = h('input.input', { type: 'password', name: 'password', placeholder: 'Contraseña', autocomplete: 'current-password' });
  const aviso = h('p.hint.err', { style: { display: 'none' } });
  const boton = h('button.btn.accent.full', { type: 'submit' }, 'Entrar');

  const form = h('form', { style: { marginTop: '30px' }, onsubmit: async (e) => {
    e.preventDefault();
    aviso.style.display = 'none';
    if (!email.value.trim() || !pass.value) {
      aviso.textContent = 'Escribe tu correo y tu contraseña.';
      aviso.style.display = 'block';
      return;
    }
    boton.disabled = true;
    boton.replaceChildren(h('div.spin', { style: { width: '18px', height: '18px' } }));
    try {
      await store.iniciarSesion(email.value.trim(), pass.value);
      ir('#/', { reemplazar: true });
      location.reload();
    } catch (err) {
      aviso.textContent = err.status === 401
        ? 'Correo o contraseña incorrectos.'
        : err.codigo === 'red'
          ? 'No hay conexión con el servidor. Inténtalo de nuevo.'
          : err.message;
      aviso.style.display = 'block';
      boton.disabled = false;
      boton.replaceChildren(document.createTextNode('Entrar'));
    }
  } },
    h('div.stack', null, email, pass),
    aviso,
    h('div', { style: { marginTop: '16px' } }, boton),
    h('p.hint', { style: { marginTop: '18px' } },
      'Las cuentas las crea el administrador de UNIK. Si no puedes entrar, pídele que revise tu usuario.'),
  );
  return form;
}

function formularioLocal() {
  const nombre = h('input.input', { type: 'text', placeholder: 'Tu nombre y apellido', autocomplete: 'name' });
  const boton = h('button.btn.accent.full', { type: 'submit' }, 'Empezar');

  return h('form', { style: { marginTop: '30px' }, onsubmit: async (e) => {
    e.preventDefault();
    const v = nombre.value.trim();
    if (v.length < 3) { toast('Escribe tu nombre para firmar los repasos', 'err'); return; }
    await store.iniciarSesionLocal(v);
    ir('#/', { reemplazar: true });
    location.reload();
  } },
    h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Modo local'),
    nombre,
    h('div', { style: { marginTop: '16px' } }, boton),
    h('div.row', { style: { marginTop: '22px', alignItems: 'flex-start' } },
      h('div.row-lead', null, icon('alert', 18)),
      h('div.grow', null,
        h('div.row-title', { style: { whiteSpace: 'normal' } }, 'Sin servidor configurado'),
        h('div.row-sub', { style: { whiteSpace: 'normal', marginTop: '4px' } },
          'Los repasos se guardan solo en este dispositivo y no se comparten con el resto del equipo.'),
      ),
    ),
  );
}
