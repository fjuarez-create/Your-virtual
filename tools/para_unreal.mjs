/* ── Assets del visor → assets importables en Unreal ─────────────────────────
   Los GLB que consume el visor están comprimidos para la web: geometría con
   EXT_meshopt_compression y KHR_mesh_quantization, y texturas en WebP dentro
   de EXT_texture_webp. El importador de glTF de Unreal NO entiende ninguna de
   las tres, así que arrastrar esos ficheros al editor no funciona: o falla la
   importación o entra la malla deformada y sin texturas.

   Esto los deja como los quiere Unreal: geometría descomprimida en float32,
   texturas en PNG y materiales en metallic-roughness (el exportador de
   SketchUp los deja en specular-glossiness, que también está retirado).

     node tools/para_unreal.mjs [carpeta de salida]

   La salida es MUCHO más pesada que la entrada —esa es la idea: en Unreal el
   peso del fichero da igual, lo que importa es que la geometría llegue intacta
   y con todos los nombres, que son los que usa la lógica de plantas
   (`__T<n>__` para el tramo y `__y<cota>` en el mobiliario). */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, metalRough, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ENTRADAS = ['apolo_envolvente.glb', 'apolo_mobiliario.glb', 'entorno.glb'];
const SALIDA = path.resolve(process.argv[2] || path.join(RAIZ, 'unreal'));

/* Extensiones que Unreal no sabe leer y que, una vez aplicada la conversión,
   ya no describen nada: se retiran para que el fichero no las declare. */
const SOBRAN = /meshopt|texture_webp|mesh_quantization|specular_glossiness/i;

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

await mkdir(SALIDA, { recursive: true });

for (const nombre of ENTRADAS) {
  const entrada = path.join(RAIZ, 'assets', 'serenea', nombre);
  const salida = path.join(SALIDA, nombre);
  const doc = await io.read(entrada);

  await doc.transform(
    unpartition(),                                              // todo en un solo búfer
    metalRough(),                                               // specGloss → metallic-roughness
    dequantize(),                                               // posiciones y normales a float32
    textureCompress({ encoder: sharp, targetFormat: 'png' }),   // WebP → PNG
  );

  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (SOBRAN.test(ext.extensionName)) ext.dispose();
  }

  await io.write(salida, doc);
  const [a, b] = await Promise.all([stat(entrada), stat(salida)]);
  const quedan = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  console.log(`${nombre}: ${mb(a.size)} → ${mb(b.size)}`
    + `  ·  mallas ${doc.getRoot().listMeshes().length}`
    + `  ·  materiales ${doc.getRoot().listMaterials().length}`
    + `  ·  extensiones ${quedan.length ? quedan.join(', ') : 'ninguna'}`);
}

console.log(`\nListo en ${SALIDA}. En Unreal: File → Import Into Level, o arrastrar al Content Browser.`);
