/* ═══════════════════════════════════════════════════════════════════════════
   texturas.js — Techo de resolución de textura.

   El modelo del cliente trae 19 imágenes por fichero: el entorno, diez de
   2048×2048; el edificio, diecinueve de 1024×1024. Con sus mipmaps eso son
   unos 290 MB de memoria de GPU para el entorno y otros 98 MB para el
   edificio: casi 400 MB. Un iPhone no los tiene, y lo que hace Safari cuando
   se queda sin ellos es tirar el contexto de WebGL, que es exactamente el
   parpadeo y las pantallas en negro que se veían, además del tirón constante.

   Aquí se le pone techo. La imagen se redibuja en un lienzo del tamaño
   permitido y se sustituye DENTRO de la textura que ya existe (`tex.source`),
   no se crea una copia: da igual cuántos materiales la compartan, no se
   duplica nada y la imagen grande se queda sin referencias y la recoge el
   recolector. Se hace antes del primer dibujo, así que la grande no llega a
   subir a la tarjeta.

   No se llama a `ImageBitmap.close()` a propósito: si dos texturas
   compartieran el mismo bitmap por caminos distintos, cerrarlo dejaría una de
   ellas en negro. Soltar la referencia basta.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

const MAPAS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'lightMap', 'bumpMap', 'displacementMap', 'specularMap'];
const vistas = new WeakSet();

/** Reduce en el sitio la imagen de una textura. Devuelve los píxeles ahorrados. */
export function limitarTextura(tex, maxLado) {
  if (!tex || !(maxLado > 0) || tex.isCompressedTexture || tex.isDataTexture) return 0;
  const fuente = tex.source || tex;
  if (vistas.has(fuente)) return 0;
  const img = tex.image;
  const w = img?.width | 0, h = img?.height | 0;
  if (!w || !h) return 0;
  vistas.add(fuente);
  if (Math.max(w, h) <= maxLado) return 0;
  const k = maxLado / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
  let lienzo;
  try {
    lienzo = document.createElement('canvas');
    lienzo.width = nw; lienzo.height = nh;
    const g = lienzo.getContext('2d');
    if (!g) return 0;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, nw, nh);
  } catch (e) {
    console.warn('[texturas] no se pudo reducir', tex.name || '', e.message);
    return 0;
  }
  tex.image = lienzo;
  tex.generateMipmaps = true;
  if (tex.minFilter === THREE.LinearFilter || tex.minFilter === THREE.NearestFilter) tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return w * h - nw * nh;
}

/** Pone techo a todas las texturas de un material. Devuelve píxeles ahorrados. */
export function limitarMaterial(material, maxLado) {
  if (!material || !(maxLado > 0)) return 0;
  let ahorro = 0;
  for (const clave of MAPAS) if (material[clave]) ahorro += limitarTextura(material[clave], maxLado);
  return ahorro;
}

/** Megapíxeles de textura vivos en un conjunto de materiales (diagnóstico). */
export function megapixeles(materiales) {
  const fuentes = new Set();
  let px = 0;
  for (const m of materiales) {
    if (!m) continue;
    for (const clave of MAPAS) {
      const t = m[clave];
      const f = t?.source || t;
      if (!t || !t.image || fuentes.has(f)) continue;
      fuentes.add(f);
      px += (t.image.width | 0) * (t.image.height | 0);
    }
  }
  // RGBA + la pirámide de mipmaps (≈ 4/3 del área)
  return { megapixeles: +(px / 1e6).toFixed(1), mb: Math.round((px * 4 * 4 / 3) / 1048576), texturas: fuentes.size };
}
