# Showroom SERENEA · versión de renders (/nuevo)

El showroom nuevo de Residencial Serenea (1 Apolo, 2 Zeus, 3 Atenea, 4 Hera,
5 Hermes) se construye con renders, vídeo y 360, no con 3D en tiempo real.
Vive solo en `nuevo/` y se publica en https://showroom.unikdi.com/nuevo/.

## Reglas de esta carpeta

- Rama de trabajo: `claude/busy-pasteur-6daj36`. La publica
  `.github/workflows/deploy-nuevo.yml`, que sube solo `nuevo/` (sin `docs/`,
  `tools/`, `plantilla/`, `data/fuentes/` ni este fichero) y nunca borra
  `nuevo/gestion/datos/`. `[wip]` en el mensaje de commit salta el deploy.
- El panel de `nuevo/gestion/` tiene que compilar en PHP 5.6 (el hosting
  corre 7.0.33); el guardián `comprobar-php56.sh nuevo/gestion` lo vigila.
- **Figma (incluido Figma Weave) está autorizado por Fran de forma
  permanente** (18-nov-2026): se usa sin pedir permiso cada vez. Se informa
  de lo gastado, pero no se pregunta antes.
- Las capturas del visor 3D antiguo **no** sirven como referencia de luz ni
  de realismo: solo como base geométrica (máscaras, polígonos, estructura de
  los 360). La referencia visual son los renders y las referencias que mande
  Fran.
- La geometría que se vende (muros, ventanas, puertas, superficies) sale del
  BIM; la IA solo pone acabado, luz y ambiente. Ventanas: planta 1 con
  antepecho blanco; plantas 2, 3 y áticos, suelo-techo.
- Tipografía Neue Haas Grotesk: los ficheros del repositorio son de prueba
  (sin tildes); antes de abrir al público hace falta la licencia web.

## Documentos

- `docs/DECISIONES.md`: lo que Fran ha decidido, con fecha. Leerlo primero.
- `docs/ARQUITECTURA.md`, `docs/DATOS.md`, `docs/PRODUCCION_IMAGENES.md`,
  `docs/REFERENTES_Y_FLUJO.md`.
- `tools/captura/LEEME.md`: capturas, máscaras y 360 desde el BIM.
