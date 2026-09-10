/* ═══════════════════════════════════════════════════════════════════════════
   materiales.js — Ajuste de los materiales del SketchUp al render del estudio.

   Dos cosas, y las dos cambian mucho la imagen.

   1) METALNESS. El exportador escribe 0,5 en todo material al que nadie le
      puso valor: madera, tierra, hoja de olivo, alicatado, rodapié, asfalto,
      bordillo, la ortofoto del terreno… Un dieléctrico renderizado como medio
      metal PIERDE LA MITAD DE SU COLOR difuso y a cambio coge un reflejo gris
      del entorno. Multiplicado por treinta materiales, eso es exactamente el
      aspecto apagado y grisáceo que se veía: nada tiene color propio y todo
      refleja el mismo cielo. Se corrige poniendo 0 en todo lo que valga
      exactamente 0,5 y no traiga mapa de metalness. Los metales de verdad
      llevan su valor puesto a mano (aluminio 0,8, cromado, bronce 0,65) y no
      se tocan.

   2) COLOR. El modelo entregado trae TODO por encima de 200 sobre 255:
      carpintería 227, vidrio 229, bordillo 236, hormigón 214, "interior en
      sombra" 176. No hay un solo valor oscuro en toda la escena, y sin
      oscuros no hay contraste: medido contra el render del estudio, la
      fachada del visor recorría 91 niveles de gris y la del render 176. Aquí
      se devuelven a su color real los pocos materiales que marcan la
      diferencia, tomados de los renders de Memorable (CAM_02, CAM_08,
      CAM_09): la carpintería es ANTRACITA, no plata; el interior tras el
      vidrio es oscuro; el asfalto es gris medio oscuro y neutro, no azulado.

   Si algún día el cliente entrega el modelo con estos materiales bien
   puestos, basta con vaciar AJUSTES y quitar la llamada.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Materiales que SÍ son metal y traen su valor puesto a conciencia. */
const METALES = /aluminio|cromado|bronce|acero|inox|metal_|_metal|FV_Marco/i;

/* nombre exacto → color en sRGB y acabado. Solo lo que se aparta de verdad
   del render entregado. */
export const AJUSTES = {
  /* Las carpinterías son antracita en los tres renders del estudio, y en el
     modelo vienen en 227 (plata casi blanca). Es EL cambio que le da ritmo a
     la fachada: sin él, hueco y muro tienen el mismo valor y el edificio se
     lee como un bloque liso. */
  'APOLO V6 | Aluminio plata grata': { color: 0x34383c, metalness: 0.85, roughness: 0.38 },
  'V6_FV_Marco_aluminio': { color: 0x3d4145, metalness: 0.8, roughness: 0.4 },
  /* Lo que se ve a través del vidrio. En 176 gris claro el hueco parecía
     tapado con un cartón; oscuro se lee como una habitación. */
  'APOLO | Interior en sombra': { color: 0x24272b, metalness: 0, roughness: 0.95 },
  /* Asfalto: 138,144,149 con tinte azul contra los 60,63,75 neutros del
     render. Es la superficie más grande del encuadre a pie de calle. */
  /* `env` baja el reflejo del cielo. Una calzada es horizontal: ve el
     hemisferio entero, así que con reflejo pleno se volvía AZUL (medido
     76,103,129 contra los 60,63,75 neutros del render). */
  asphalt: { color: 0x5e6164, metalness: 0, roughness: 0.95, env: 0.35 },
  curb: { color: 0xbfbdb7, metalness: 0, roughness: 0.9, env: 0.5 },
  metal: { color: 0x6e6f6c, metalness: 0.6, roughness: 0.45 },
  'V6 | Junta grafito': { color: 0x3a3d3c, metalness: 0, roughness: 0.8 },
  'V6_FV_Celulas_antracita': { color: 0x22262b, metalness: 0.25, roughness: 0.25 },
  'EXT_Neumatico': { color: 0x2e3032, metalness: 0, roughness: 0.9 },
};

/**
 * Corrige el metalness heredado del exportador y aplica el ajuste de color si
 * el material tiene uno. Devuelve el mismo material.
 */
export function ajustarMaterial(m) {
  if (!m || m.userData?.ajustado) return m;
  if (m.metalness === undefined) return m;
  m.userData = m.userData || {};
  m.userData.ajustado = true;
  const nombre = m.name || '';

  // 1) metalness heredado
  if (!m.metalnessMap && Math.abs(m.metalness - 0.5) < 1e-6 && !METALES.test(nombre)) {
    m.metalness = 0;
    // el exportador deja 0,5 de rugosidad con el mismo criterio: es plano y falso
    if (Math.abs(m.roughness - 0.5) < 1e-6) m.roughness = 0.85;
  }

  // 2) color y acabado
  const a = AJUSTES[nombre];
  if (a) {
    if (a.color !== undefined) m.color.setHex(a.color);
    if (a.env !== undefined && m.userData) m.userData.baseEnv = a.env;
    if (a.metalness !== undefined) m.metalness = a.metalness;
    if (a.roughness !== undefined) m.roughness = a.roughness;
    if (a.env !== undefined) m.envMapIntensity = a.env;
    if (m.userData.baseColor) m.userData.baseColor.copy(m.color);
  }
  return m;
}
