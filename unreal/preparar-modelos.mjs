/** Preparación reproducible de GLB para Interchange; no necesita Unreal.
 * Conserva jerarquía, coordenadas, índices, UV, colores y píxeles decodificados.
 * Los GLB generados son fuentes de importación, no recursos web de producción.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { MeshoptDecoder } from '../new/vendor/three/addons/libs/meshopt_decoder.module.js';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEST = path.join(ROOT, 'unreal/SourceAssets');
export const MODELOS = ['apolo_envolvente', 'apolo_mobiliario', 'apolo_corte_baja',
  'apolo_corte_p1', 'apolo_corte_p2', 'apolo_corte_atico', 'entorno_200m'];
export const sha = b => createHash('sha256').update(b).digest('hex');
export function leerGLB(b) {
  assert.equal(b.readUInt32LE(0), 0x46546c67);
  assert.equal(b.readUInt32LE(4), 2);
  assert.equal(b.readUInt32LE(8), b.length);
  const n = b.readUInt32LE(12);
  assert.equal(b.readUInt32LE(16), 0x4e4f534a);
  assert.equal(b.readUInt32LE(24+n), 0x004e4942);
  return { json: JSON.parse(b.subarray(20, 20+n)), bin: b.subarray(28+n) };
}
const componentes = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 };
const tipos = {
  5120:[1,'readInt8',127], 5121:[1,'readUInt8',255],
  5122:[2,'readInt16LE',32767], 5123:[2,'readUInt16LE',65535],
  5125:[4,'readUInt32LE',4294967295], 5126:[4,'readFloatLE',1],
};
export async function vistasDecodificadas(json, bin) {
  await MeshoptDecoder.ready;
  return json.bufferViews.map(v => {
    const e = v.extensions?.EXT_meshopt_compression;
    if (!e) {
      assert.equal(v.buffer, 0, 'No se admiten buffers externos');
      return Buffer.from(bin.subarray(v.byteOffset||0, (v.byteOffset||0)+v.byteLength));
    }
    assert.equal(e.buffer, 0);
    const dst = Buffer.alloc(e.count*e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(dst, e.count, e.byteStride,
      bin.subarray(e.byteOffset||0,(e.byteOffset||0)+e.byteLength), e.mode, e.filter);
    assert.equal(dst.length, v.byteLength);
    return dst;
  });
}
export function valores(json, vistas, a) {
  assert.ok(!a.sparse, 'Los accesores sparse requieren una conversión específica');
  const n = componentes[a.type]; assert.ok(n, 'Accesor no vectorial');
  const [bytes, getter, max] = tipos[a.componentType];
  const stride = json.bufferViews[a.bufferView].byteStride || n*bytes;
  const data = vistas[a.bufferView], out = new Float64Array(a.count*n);
  for(let i=0;i<a.count;i++) for(let c=0;c<n;c++) {
    let v = data[getter]((a.byteOffset||0)+i*stride+c*bytes);
    if(a.normalized) v = Math.max(v/max,-1);
    assert.ok(Number.isFinite(v), 'Valor de atributo no finito');
    out[i*n+c]=v;
  }
  return out;
}
function empaquetar(j, vistas) {
  // Solo conservar vistas referenciadas: no duplicar los atributos enteros.
  const usados = new Set([...j.accessors.map(a=>a.bufferView), ...j.images.map(i=>i.bufferView)]);
  const map = new Map(), chunks=[]; let offset=0;
  const nuevos=[];
  for(const i of usados) {
    assert.ok(Number.isInteger(i));
    const b=vistas[i], padding=(4-b.length%4)%4;
    const v={...j.bufferViews[i], buffer:0, byteOffset:offset, byteLength:b.length};
    delete v.extensions;
    map.set(i,nuevos.length); nuevos.push(v); chunks.push(b,Buffer.alloc(padding));
    offset+=b.length+padding;
  }
  for(const a of j.accessors) a.bufferView=map.get(a.bufferView);
  for(const i of j.images) i.bufferView=map.get(i.bufferView);
  j.bufferViews=nuevos; j.buffers=[{byteLength:offset}];
  const json0=Buffer.from(JSON.stringify(j));
  const json=Buffer.concat([json0,Buffer.alloc((4-json0.length%4)%4,32)]);
  const bin=Buffer.concat(chunks), b=Buffer.alloc(28+json.length+bin.length);
  [0x46546c67,2,b.length,json.length,0x4e4f534a].forEach((v,i)=>b.writeUInt32LE(v,i*4));
  json.copy(b,20); b.writeUInt32LE(bin.length,20+json.length);
  b.writeUInt32LE(0x004e4942,24+json.length); bin.copy(b,28+json.length);
  return b;
}
export async function convertir(nombre) {
  const original=await fs.readFile(path.join(ROOT,'assets/serenea',nombre+'.glb'));
  const {json:j,bin}=leerGLB(original), vistas=await vistasDecodificadas(j,bin);
  assert.ok(!j.skins?.length && !j.animations?.length, 'El modelo debe ser estático');
  const atributos = new Set(j.meshes.flatMap(m=>m.primitives.flatMap(p=>Object.values(p.attributes))));
  for(const i of atributos) {
    const a=j.accessors[i]; if(a.componentType===5126) continue;
    const f=Float32Array.from(valores(j,vistas,a));
    const data=Buffer.alloc(f.length*4); for(let k=0;k<f.length;k++)data.writeFloatLE(f[k],k*4);
    const n=componentes[a.type], min=Array(n).fill(Infinity),max=Array(n).fill(-Infinity);
    for(let k=0;k<f.length;k++){min[k%n]=Math.min(min[k%n],f[k]);max[k%n]=Math.max(max[k%n],f[k]);}
    a.bufferView=vistas.length; a.byteOffset=0; a.componentType=5126;
    delete a.normalized; if(a.min)a.min=min; if(a.max)a.max=max;
    vistas.push(data); j.bufferViews.push({buffer:0,byteLength:data.length,target:34962});
  }
  // WebP no forma parte del núcleo glTF. PNG conserva sus píxeles decodificados.
  const hashesImagenes=[];
  for(const i of j.images||[]) {
    const src=vistas[i.bufferView];
    const pixels=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const png=await sharp(pixels.data,{raw:pixels.info}).png().toBuffer();
    const restored=await sharp(png).ensureAlpha().raw().toBuffer();
    assert.equal(sha(restored),sha(pixels.data),'Píxeles modificados al convertir');
    hashesImagenes.push({width:pixels.info.width,height:pixels.info.height,rgbaSha256:sha(restored)});
    i.bufferView=vistas.length; i.mimeType='image/png'; delete i.uri;
    vistas.push(png); j.bufferViews.push({buffer:0,byteLength:png.length});
  }
  for(const t of j.textures||[]) {
    const e=t.extensions?.EXT_texture_webp;
    if(e){t.source=e.source;delete t.extensions.EXT_texture_webp;}
    if(t.extensions&&!Object.keys(t.extensions).length)delete t.extensions;
  }
  // El visor actual usa pbrMetallicRoughness; se conserva ese mismo material.
  for(const m of j.materials||[]) {
    assert.ok(m.pbrMetallicRoughness,'Material sin equivalente PBR del visor');
    if(m.extensions){delete m.extensions.KHR_materials_pbrSpecularGlossiness;
      if(!Object.keys(m.extensions).length)delete m.extensions;}
  }
  const quitadas=['EXT_meshopt_compression','EXT_texture_webp','KHR_mesh_quantization','KHR_materials_pbrSpecularGlossiness'];
  for(const k of ['extensionsUsed','extensionsRequired']) {
    j[k]=(j[k]||[]).filter(e=>!quitadas.includes(e)); if(!j[k].length)delete j[k];
  }
  const output=empaquetar(j,vistas);
  const file=path.join(DEST,nombre+'.glb'); await fs.writeFile(file,output);
  return {nombre,fuente:'assets/serenea/'+nombre+'.glb',salida:'SourceAssets/'+nombre+'.glb',
    origenSha256:sha(original),salidaSha256:sha(output),bytesFuente:original.length,bytesSalida:output.length,
    mallas:j.meshes.length,nodos:j.nodes.length,imagenes:hashesImagenes};
}
async function main(){
  await fs.mkdir(DEST,{recursive:true});
  try { await fs.access(path.join(ROOT,'assets/serenea/entorno_200m.glb')); }
  catch {
    const r=spawnSync(process.execPath,['tools/recortar_entorno.mjs','assets/serenea/entorno.glb','assets/serenea/entorno_200m.glb'],{cwd:ROOT,stdio:'inherit'});
    assert.equal(r.status,0,'Falló el recorte a 200 m');
  }
  const modelos=[];
  for(const m of MODELOS){const r=await convertir(m);modelos.push(r);console.log(m+': '+(r.bytesSalida/1e6).toFixed(1)+' MB preparados');}
  for(const f of ['serenea_modelo.json','cortes.json','viviendas_serenea.json','availability.json'])
    await fs.copyFile(path.join(ROOT,'data',f),path.join(DEST,f));
  const manifest={version:1,estado:'fuentes_preparadas_pendientes_de_importar_en_unreal',
    motorObjetivo:'Unreal Engine 5.7',unidadesFuente:'metros',ejeVerticalFuente:'Y',
    conversion:'Interchange debe convertir glTF a centímetros y Z arriba; no aplicar una segunda escala.',
    interfaz:'Conservar new/index.html, new/css y new/js/shell.js; integración Pixel Streaming pendiente.',
    apolo:JSON.parse(await fs.readFile(path.join(ROOT,'data/serenea_modelo.json'))).apolo,
    radioEntornoMetros:200,baseGeograficaConservada:true,modelos};
  await fs.writeFile(path.join(DEST,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
