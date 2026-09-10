/** Compara los modelos originales y preparados con el cargador real del visor.
 * Verifica datos; no es una prueba del importador ni del render de Unreal.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import sharp from 'sharp';
import { ROOT, DEST, MODELOS, leerGLB, sha } from './preparar-modelos.mjs';
registerHooks({resolve(s,c,next){
  if(s==='three')s=new URL('../new/vendor/three/three.core.min.js',import.meta.url).href;
  return next(s,c);
}});
const THREE=await import('three');
const {GLTFLoader}=await import('../new/vendor/three/addons/loaders/GLTFLoader.js');
const {MeshoptDecoder}=await import('../new/vendor/three/addons/libs/meshopt_decoder.module.js');
globalThis.self=globalThis;
THREE.TextureLoader.prototype.load=function(url,onLoad){
  const t=new THREE.Texture({width:1,height:1});queueMicrotask(()=>onLoad(t));return t;
};
async function cargar(b){
  const g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');
  g.scene.updateMatrixWorld(true);const m=[];
  g.scene.traverse(x=>{if(x.isMesh)m.push(x);});return m;
}
async function imagenes(j,bin){
  const out=[];
  for(const i of j.images){
    const v=j.bufferViews[i.bufferView],raw=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
    const r=await sharp(raw).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    out.push([r.info.width,r.info.height,sha(r.data)]);
  }return out;
}
const registros=[];
for(const nombre of MODELOS){
  const src=await fs.readFile(path.join(ROOT,'assets/serenea',nombre+'.glb'));
  const dst=await fs.readFile(path.join(DEST,nombre+'.glb'));
  const a=leerGLB(src), b=leerGLB(dst);
  assert.deepEqual(a.json.nodes,b.json.nodes,'Jerarquía y transformaciones');
  assert.deepEqual(a.json.meshes,b.json.meshes,'Primitivas, índices y material asignado');
  assert.deepEqual(a.json.scenes,b.json.scenes,'Escenas');
  assert.equal(b.json.buffers.length,1);
  assert.ok(!(b.json.extensionsRequired||[]).some(x=>/meshopt|webp|quantization/.test(x)));
  for(let i=0;i<a.json.materials.length;i++){
    const m=structuredClone(a.json.materials[i]);
    if(m.extensions){delete m.extensions.KHR_materials_pbrSpecularGlossiness;
      if(!Object.keys(m.extensions).length)delete m.extensions;}
    assert.deepEqual(m,b.json.materials[i],'Material PBR original');
  }
  assert.deepEqual(await imagenes(a.json,a.bin),await imagenes(b.json,b.bin),'Píxeles RGBA de todas las texturas');
  const am=await cargar(src),bm=await cargar(dst);assert.equal(am.length,bm.length);
  let vertices=0,triangulos=0,errorMaximo=0;
  for(let i=0;i<am.length;i++){
    const x=am[i],y=bm[i];assert.deepEqual(x.matrixWorld.elements,y.matrixWorld.elements);
    const gi=x.geometry.index,gj=y.geometry.index;
    assert.equal(gi?.count,gj?.count);
    for(let k=0;k<(gi?.count||0);k++)assert.equal(gi.getX(k),gj.getX(k));
    for(const key of Object.keys(x.geometry.attributes)){
      const av=x.geometry.getAttribute(key),bv=y.geometry.getAttribute(key);
      assert.equal(av.count,bv.count);assert.equal(av.itemSize,bv.itemSize);
      for(let k=0;k<av.count;k++)for(let c=0;c<av.itemSize;c++){
        const v=av.getComponent(k,c),w=bv.getComponent(k,c),err=Math.abs(v-w);
        assert.ok(Number.isFinite(w));
        assert.ok(err<=Math.max(1e-7,Math.abs(v)*1e-7),key+': precisión Float32');
        errorMaximo=Math.max(errorMaximo,err);
      }
    }
    vertices+=x.geometry.getAttribute('position').count;
    triangulos+=(gi?.count||x.geometry.getAttribute('position').count)/3;
  }
  registros.push({nombre,mallas:am.length,vertices,triangulos,errorMaximoAtributos:errorMaximo,
    jerarquiaIntacta:true,materialesPBRIntactos:true,pixelesTexturasIntactos:true,
    fuenteSha256:sha(src),salidaSha256:sha(dst)});
  console.log(nombre+': '+am.length+' mallas / '+triangulos+' triángulos verificados');
}
const informe={ok:true,alcance:'Geometría y texturas comparadas en CPU con GLTFLoader. Importación y render en Unreal pendientes.',modelos:registros};
await fs.writeFile(path.join(ROOT,'unreal/VALIDACION_MODELOS.json'),JSON.stringify(informe,null,2)+'\n');
