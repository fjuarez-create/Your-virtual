/* Pantalla de entrada. Con backend pide correo y contraseña; sin él
   (modo local, útil para probar antes de publicar) basta con el nombre
   de quien va a firmar los repasos.

   El bloque no va centrado a media pantalla: se asienta más abajo, para
   que el logotipo respire arriba y los campos queden a la altura del
   pulgar en un móvil grande. */
import { h, icon, toast, logoUnik } from '../ui.js';
import * as store from '../store.js';
import * as api from '../api.js';
import { ir } from '../app.js';

export async function render() {
  return {
    sinTabs: true,
    clase: 'entrada',
    contenido: [
      h('div.entrada-marca', null,
        logoUnik({ alto: 44 }),
        h('p.entrada-sub', null, 'repasos'),
      ),
      api.HAY_SERVIDOR ? formularioServidor() : formularioLocal(),
      h('p.legal', null, '© 2026 Unik Desarrollos Inmobiliarios SL'),
    ],
  };
}

function formularioServidor() {
  const email = h('input.input', { type: 'email', name: 'email', placeholder: 'nombre@unikdi.com', autocomplete: 'username', inputmode: 'email' });
  const pass = h('input.input', { type: 'password', name: 'password', placeholder: 'Contraseña', autocomplete: 'current-password' });
  const aviso = h('p.hint.err', { style: { display: 'none' } });
  const boton = h('button.btn.ink.full', { type: 'submit' }, 'INICIAR SESIÓN');

  return h('form.entrada-form', { onsubmit: async (e) => {
    e.preventDefault();
    aviso.style.display = 'none';
    if (!email.value.trim() || !pass.value) {
      aviso.textContent = 'Escribe tu correo y tu contraseña.';
      aviso.style.display = 'block';
      return;
    }
    boton.disabled = true;
    boton.replaceChildren(h('div.spin.claro', { style: { width: '18px', height: '18px' } }));
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
      boton.replaceChildren(document.createTextNode('INICIAR SESIÓN'));
    }
  } },
    h('div.stack', null, email, pass),
    aviso,
    h('div', { style: { marginTop: '14px' } }, boton),
    h('p.hint.center', { style: { marginTop: '16px' } },
      'Las cuentas las crea el administrador de UNIK.'),
  );
}

function formularioLocal() {
  const nombre = h('input.input', { type: 'text', placeholder: 'Tu nombre y apellido', autocomplete: 'name' });
  const boton = h('button.btn.ink.full', { type: 'submit' }, 'EMPEZAR');

  return h('form.entrada-form', { onsubmit: async (e) => {
    e.preventDefault();
    const v = nombre.value.trim();
    if (v.length < 3) { toast('Escribe tu nombre para firmar los repasos', 'err'); return; }
    await store.iniciarSesionLocal(v);
    ir('#/', { reemplazar: true });
    location.reload();
  } },
    h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Modo local'),
    nombre,
    h('div', { style: { marginTop: '14px' } }, boton),
    h('div.row', { style: { marginTop: '20px', alignItems: 'flex-start' } },
      h('div.row-lead', null, icon('alert', 18)),
      h('div.grow', null,
        h('div.row-title', { style: { whiteSpace: 'normal' } }, 'Sin servidor configurado'),
        h('div.row-sub', { style: { whiteSpace: 'normal', marginTop: '4px' } },
          'Los repasos se guardan solo en este dispositivo y no se comparten con el resto del equipo.'),
      ),
    ),
  );
}
