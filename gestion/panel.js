/* Adornos del panel. Todo lo importante (marcar y guardar) funciona sin este
   fichero: son radios dentro de un formulario. Esto solo añade el buscador,
   el contador en vivo y el aviso de cambios sin guardar. */
(() => {
  const formulario = document.getElementById('formulario');
  if (!formulario) return;

  const pendiente = document.getElementById('pendiente');
  const buscar = document.getElementById('buscar');
  const contadores = {
    disponible: document.getElementById('nDisponible'),
    reservada: document.getElementById('nReservada'),
    vendida: document.getElementById('nVendida'),
  };
  const tarjetas = [...formulario.querySelectorAll('.vivienda')];
  const inicial = new Map(tarjetas.map((t) => [t, estadoDe(t)]));

  function estadoDe(tarjeta) {
    const marcado = tarjeta.querySelector('input:checked');
    return marcado ? marcado.value : 'disponible';
  }

  function repintar() {
    const cuenta = { disponible: 0, reservada: 0, vendida: 0 };
    let cambios = 0;
    for (const tarjeta of tarjetas) {
      const estado = estadoDe(tarjeta);
      cuenta[estado]++;
      tarjeta.className = `vivienda estado-${estado}`;
      if (inicial.get(tarjeta) !== estado) { tarjeta.classList.add('cambiada'); cambios++; }
    }
    for (const clave of Object.keys(cuenta)) {
      if (contadores[clave]) contadores[clave].textContent = String(cuenta[clave]);
    }
    pendiente.hidden = cambios === 0;
    pendiente.textContent = cambios === 1 ? '1 cambio sin guardar' : `${cambios} cambios sin guardar`;
  }

  formulario.addEventListener('change', repintar);

  /* Cerrar la pestaña con cambios a medias es la forma tonta de perder una
     venta apuntada: el navegador pregunta antes. */
  let guardando = false;
  formulario.addEventListener('submit', () => { guardando = true; });
  window.addEventListener('beforeunload', (e) => {
    if (guardando || pendiente.hidden) return;
    e.preventDefault();
    e.returnValue = '';
  });

  if (buscar) {
    buscar.addEventListener('input', () => {
      const q = buscar.value.trim().toLowerCase();
      for (const tarjeta of tarjetas) {
        tarjeta.hidden = q !== '' && !tarjeta.dataset.id.toLowerCase().includes(q);
      }
      for (const seccion of formulario.querySelectorAll('.planta')) {
        seccion.hidden = ![...seccion.querySelectorAll('.vivienda')].some((t) => !t.hidden);
      }
    });
  }

  repintar();
})();
