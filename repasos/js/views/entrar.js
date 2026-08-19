/* La pantalla de entrada del rediseño 2026, calcada del Figma: la
   marca UNIK WORKS en dos imágenes a un cuarto de pantalla, los campos
   en pastilla blanca con el ojo para ver la contraseña, el error en
   rojo, el botón negro y el pie abajo del todo.

   El «WORKS» está dibujado con la Neue Haas Roman 55, la tipografía de
   la aplicación. El «UNIK» de encima es el original y su letra tiene el
   trazo algo más grueso, así que se leen ligeramente distintos; el día
   que llegue el «WORKS» exportado del Figma solo hay que reemplazar la
   imagen y aquí no se toca nada.

   Con backend pide correo y contraseña; sin él (modo local, útil para
   probar antes de publicar) basta con el nombre de quien va a firmar
   los repasos. */
import { h, icon, toast } from '../ui.js';
import * as store from '../store.js';
import * as api from '../api.js';
import { ir } from '../app.js';
import { abrirPagina } from '../piezas.js';

export async function render() {
  return {
    sinTabs: true,
    clase: 'pantalla-diseno pantalla-entrar',
    contenido: [
      h('div.d-entrar', null,
        h('div.d-entrar-marca', null,
          h('img', { src: 'assets/logo/marca-unik.png', alt: 'UNIK' }),
          h('img', { src: 'assets/logo/marca-works.png', alt: 'WORKS' }),
        ),
        api.HAY_SERVIDOR ? formularioServidor() : formularioLocal(),
        // La privacidad tiene que poder leerse sin haber entrado: es lo
        // que mira el revisor de Apple, y quien no tenga cuenta también
        // tiene derecho a saber qué se guarda aquí.
        h('p.d-entrar-pie', null,
          h('button.d-entrar-enlace', { type: 'button', onclick: () => abrirPagina('privacidad.html') }, 'Privacidad'),
          ' · ',
          h('button.d-entrar-enlace', { type: 'button', onclick: () => abrirPagina('soporte.html') }, 'Soporte'),
          h('span.d-entrar-firma', null, '2026 Unik Desarrollos Inmobiliarios, S.L.'),
        ),
      ),
    ],
  };
}

function formularioServidor() {
  const email = h('input', { type: 'email', name: 'email', placeholder: 'Introduce tu email', autocomplete: 'username', inputmode: 'email' });
  const pass = h('input', { type: 'password', name: 'password', placeholder: 'Introduce tu contraseña', autocomplete: 'current-password' });

  /* El ojo enseña o esconde la contraseña, como en el diseño. */
  const ojo = h('button.d-entrar-ojo', {
    type: 'button', 'aria-label': 'Mostrar contraseña',
    onclick: () => {
      const ver = pass.type === 'password';
      pass.type = ver ? 'text' : 'password';
      ojo.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
      ojo.replaceChildren(icon(ver ? 'ojo' : 'ojoTachado'));
      pass.focus();
    },
  }, icon('ojoTachado'));

  const aviso = h('span.d-entrar-error', { style: { display: 'none' } });
  const boton = h('button.d-entrar-boton', { type: 'submit' }, 'Iniciar sesión');

  const forma = h('form.d-entrar-form', { onsubmit: async (e) => {
    e.preventDefault();
    forma.classList.remove('error');
    aviso.style.display = 'none';
    if (!email.value.trim() || !pass.value) {
      fallo('Escribe tu correo y tu contraseña');
      return;
    }
    boton.disabled = true;
    boton.replaceChildren(h('div.spin.claro', { style: { width: '18px', height: '18px' } }));
    try {
      await store.iniciarSesion(email.value.trim(), pass.value);
      ir('#/', { reemplazar: true });
      location.reload();
    } catch (err) {
      fallo(err.status === 401
        ? 'Usuario o contraseña incorrectos'
        : err.codigo === 'red'
          ? 'No hay conexión con el servidor. Inténtalo de nuevo.'
          : err.message);
      boton.disabled = false;
      boton.replaceChildren(document.createTextNode('Iniciar sesión'));
    }
  } },
    h('label.d-entrar-rotulo', { for: 'entrar-email' }, 'Email'),
    h('div.d-entrar-campo', null, email),
    h('label.d-entrar-rotulo', { for: 'entrar-pass' }, 'Contraseña'),
    h('div.d-entrar-campo.con-ojo', null, pass, ojo),
    aviso,
    boton,
    h('div.d-entrar-o', null, 'Las cuentas las crea el administrador de Unik.'),
  );
  email.id = 'entrar-email';
  pass.id = 'entrar-pass';

  /** El error del diseño: bordes y texto en rojo, con su mensaje. */
  function fallo(mensaje) {
    forma.classList.add('error');
    aviso.textContent = mensaje;
    aviso.style.display = 'block';
  }
  return forma;
}

function formularioLocal() {
  const nombre = h('input', { type: 'text', placeholder: 'Tu nombre y apellido', autocomplete: 'name' });

  return h('form.d-entrar-form', { onsubmit: async (e) => {
    e.preventDefault();
    const v = nombre.value.trim();
    if (v.length < 3) { toast('Escribe tu nombre para firmar los repasos', 'err'); return; }
    await store.iniciarSesionLocal(v);
    ir('#/', { reemplazar: true });
    location.reload();
  } },
    h('label.d-entrar-rotulo', null, 'Modo local'),
    h('div.d-entrar-campo', null, nombre),
    h('button.d-entrar-boton', { type: 'submit' }, 'Empezar'),
    h('div.d-entrar-o', null, 'Sin servidor: los repasos se guardan solo en este dispositivo.'),
  );
}
