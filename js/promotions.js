/* ═══════════════════════════════════════════════════════════════
   promotions.js — Catálogo de desarrollos de UNIK.

   El sistema está preparado para varios desarrollos y varios
   edificios por desarrollo. Para añadir un edificio futuro basta
   con añadir una entrada a `buildings` con:
     - center/camera: encuadre 3D (coords de escena)
     - units / availability / bim: sus ficheros de datos y modelo
     - active: false + comingSoon: true → aparece deshabilitado
   Cuando llegue el BIM del resto de SERENEA, cada edificio vecino
   tendrá su propia entrada con su GLB y su listado.
   ═══════════════════════════════════════════════════════════════ */
export const DEVELOPMENTS = [
  {
    id: 'serenea',
    name: 'SERENEA',
    location: 'Las Huesas · Telde',
    tagline: '166 viviendas de 1, 2 y 3 dormitorios · Áticos con terraza',
    buildings: [
      {
        id: 'apolo',
        name: 'Apolo',
        active: true,
        center: [0, 5, 0],       // objetivo de cámara
        camera: [64, 48, 92],    // posición de cámara del encuadre general
        units: 'data/units.json',
        availability: 'data/availability.json',
        bim: 'assets/apolo_levels.glb',
      },
      // Próximos edificios de SERENEA (parcelas contiguas):
      // { id: 'artemisa', name: 'Artemisa', active: false, comingSoon: true },
    ],
  },
  // Futuros desarrollos de UNIK: añadir aquí.
];

export const ACTIVE_DEV = DEVELOPMENTS[0];
export const ACTIVE_BUILDING = ACTIVE_DEV.buildings.find((b) => b.active);
