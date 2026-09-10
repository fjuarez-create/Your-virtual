/* Resolución del lienzo 3D, independiente del DOM y del motor. La interfaz
   mantiene su resolución nativa. Solo se ajusta durante el movimiento y
   vuelve al detalle completo al detenerse; no cambia materiales ni luces. */
export function crearControlResolucion({ minimo = 0.75, maximo = 1.5, alCambiar = () => {} } = {}) {
  let techo, suelo, actual, movimiento;
  let tiempo = 0, muestras = 0, ventanasRapidas = 0;

  function limpiar() { tiempo = 0; muestras = 0; }
  function aplicar(valor) {
    if (Math.abs(valor - actual) < 0.001) return;
    actual = valor;
    alCambiar(valor);
  }

  const control = {
    get estado() { return { actual, movimiento, minimo: suelo, maximo: techo }; },
    setLimites(min, max) {
      techo = Number.isFinite(max) && max > 0 ? max : 1;
      suelo = Math.min(techo, Number.isFinite(min) && min > 0 ? min : 0.75);
      movimiento = techo;
      ventanasRapidas = 0;
      limpiar();
      aplicar(techo);
    },
    update(dt, { moviendo = false, medir = true } = {}) {
      if (!medir || !moviendo) {
        limpiar();
        ventanasRapidas = 0;
        aplicar(techo);
        return;
      }
      aplicar(movimiento);
      /* Una pausa de pestaña o una descarga/compilación larga no describe
         la capacidad de dibujar. Tampoco se acumula entre dos gestos. */
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.12) { limpiar(); return; }
      tiempo += dt;
      muestras++;
      if (tiempo < 0.8 || muestras < 12) return;
      const media = tiempo / muestras;
      limpiar();
      if (media > 1 / 45) {
        movimiento = Math.max(suelo, Math.round((movimiento - 0.15) * 100) / 100);
        ventanasRapidas = 0;
      } else if (media < 1 / 58) {
        /* Recuperar más despacio evita alternar calidades cuando el equipo
           está justo en el umbral. Las decisiones reasignan buffers. */
        if (++ventanasRapidas >= 2) {
          movimiento = Math.min(techo, Math.round((movimiento + 0.1) * 100) / 100);
          ventanasRapidas = 0;
        }
      } else ventanasRapidas = 0;
      aplicar(movimiento);
    },
  };
  actual = maximo;
  control.setLimites(minimo, maximo);
  return control;
}
