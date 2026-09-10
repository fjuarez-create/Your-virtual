/* Recorte físico del GLB de contexto. Conserva terreno, viales y costa.
   node tools/recortar_entorno.mjs entrada.glb salida.glb [encoder.mjs]
   Usa el decoder del visor y meshoptimizer (tools/package.json) para escribir.
   Las piezas que cruzan el límite se conservan completas, sin caras abiertas. */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Matrix4, Vector3, Quaternion } from '../new/vendor/three/three.core.min.js';
import { MeshoptDecoder } from '../new/vendor/three/addons/libs/meshopt_decoder.module.js';

const [entrada, salida, encoder] = process.argv.slice(2);
if (!entrada || !salida) throw new Error('Indicar GLB de entrada y salida');
const { MeshoptEncoder } = await import(encoder ? pathToFileURL(encoder).href : 'meshoptimizer');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const modelo = JSON.parse(fs.readFileSync(new URL('../data/serenea_modelo.json', import.meta.url)));
if (modelo.unidades !== 'metros') throw new Error('El radio requiere coordenadas en metros');
const [cx, , cz] = modelo.apolo.centro, radio = 200, r2 = radio * radio;
const esBase = (nombre) => /^(ortho|PNOA_|asphalt$|curb$|sidewalk$|grass$|tactile$)|mar.atlantico|Bordillo claro|Loseta neutra|Registros y rejillas/i.test(nombre);
const bytes = fs.readFileSync(entrada);
if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('No es GLB');
const largoJSON = bytes.readUInt32LE(12);
const original = JSON.parse(bytes.subarray(20, 20 + largoJSON));
const bin = bytes.subarray(28 + largoJSON);
if (original.animations?.length || original.skins?.length) throw new Error('Solo modelos estáticos');
const tipos = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const tamanos = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const vistas = new Map(), atributos = new Map();
function vista(i) {
  if (vistas.has(i)) return vistas.get(i);
  const v = original.bufferViews[i], ext = v.extensions?.EXT_meshopt_compression;
  let datos;
  if (ext) {
    datos = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(datos, ext.count, ext.byteStride,
      bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength), ext.mode, ext.filter || 'NONE');
  } else datos = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  vistas.set(i, datos); return datos;
}
function atributo(i) {
  if (atributos.has(i)) return atributos.get(i);
  const a = original.accessors[i];
  if (a.sparse) throw new Error('Accessor sparse no previsto');
  const T = tipos[a.componentType], n = tamanos[a.type];
  if (!T || !n) throw new Error('Formato de accessor no previsto');
  const v = original.bufferViews[a.bufferView], fuente = vista(a.bufferView);
  const paso = v.byteStride || n * T.BYTES_PER_ELEMENT;
  const raw = new T(a.count * n), dst = new Uint8Array(raw.buffer);
  for (let k = 0; k < a.count; k++) {
    const p = (a.byteOffset || 0) + k * paso;
    dst.set(fuente.subarray(p, p + n * T.BYTES_PER_ELEMENT), k * n * T.BYTES_PER_ELEMENT);
  }
  const normalizar = a.normalized ? (a.componentType === 5122 ? 32767 : a.componentType === 5120 ? 127 : a.componentType === 5121 ? 255 : 65535) : 1;
  const res = { raw, n, a, normalizar }; atributos.set(i, res); return res;
}
function matriz(n) {
  return n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(
    new Vector3(...(n.translation || [0, 0, 0])), new Quaternion(...(n.rotation || [0, 0, 0, 1])), new Vector3(...(n.scale || [1, 1, 1])));
}
// Distancia al triángulo en planta: incluye aristas que atraviesan el círculo
// aunque ninguno de los vértices caiga dentro.
function toca(a, b, c) {
  const signo = (p, q) => (q[0] - p[0]) * (-p[1]) - (q[1] - p[1]) * (-p[0]);
  const s = [signo(a, b), signo(b, c), signo(c, a)];
  const area = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  if (Math.abs(area) > 1e-10 && (s.every(v => v >= 0) || s.every(v => v <= 0))) return true;
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx*dx + dz*dz;
    const t = l2 ? Math.max(0, Math.min(1, -(p[0]*dx + p[1]*dz)/l2)) : 0;
    if ((p[0]+t*dx)**2 + (p[1]+t*dz)**2 <= r2) return true;
  }
  return false;
}
function seleccionar(p, world) {
  const pos = atributo(p.attributes.POSITION), idx = p.indices === undefined ? Uint32Array.from({ length: pos.a.count }, (_, i) => i) : atributo(p.indices).raw;
  if (esBase(original.materials[p.material]?.name || '')) return { idx, seleccion: idx, base: true };
  const xyz = [], v = new Vector3();
  let xmin=Infinity, xmax=-Infinity, zmin=Infinity, zmax=-Infinity, todosDentro=true;
  for (let i=0; i<pos.a.count; i++) {
    v.set(...Array.from(pos.raw.subarray(i*3, i*3+3), x => pos.a.normalized ? Math.max(-1, x/pos.normalizar) : x)).applyMatrix4(world);
    const x=v.x-cx, z=v.z-cz; xyz.push([x,z]);
    xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);
    if(x*x+z*z>r2) todosDentro=false;
  }
  if (todosDentro) return { idx, seleccion: idx };
  if (Math.max(xmin,0,-xmax)**2 + Math.max(zmin,0,-zmax)**2 > r2) return { idx, seleccion: [] };
  // Islas soldadas por posición: una pared/copa no se fragmenta por sus UV.
  const padre=Int32Array.from({length:pos.a.count},(_,i)=>i), porPos=new Map();
  function raiz(i){while(padre[i]!==i){padre[i]=padre[padre[i]];i=padre[i];}return i;}
  function unir(a,b){padre[raiz(a)]=raiz(b);}
  for(let i=0;i<pos.a.count;i++){
    const k=Array.from(pos.raw.subarray(i*3,i*3+3)).join(',');
    if(porPos.has(k))unir(i,porPos.get(k));else porPos.set(k,i);
  }
  for(let t=0;t<idx.length;t+=3){unir(idx[t],idx[t+1]);unir(idx[t],idx[t+2]);}
  const cerca=new Set();
  for(let t=0;t<idx.length;t+=3)if(toca(xyz[idx[t]],xyz[idx[t+1]],xyz[idx[t+2]]))cerca.add(raiz(idx[t]));
  const seleccion=[];
  for(let t=0;t<idx.length;t+=3)if(cerca.has(raiz(idx[t])))seleccion.push(idx[t],idx[t+1],idx[t+2]);
  return { idx, seleccion };
}

const doc=structuredClone(original);
doc.nodes=[];doc.meshes=[];doc.accessors=[];doc.bufferViews=[];
delete doc.buffers;
const trozos=[];let offset=0, fallback=0;
const cacheAccessor=new Map();
function agregar(datos){const inicio=offset;trozos.push(Buffer.from(datos));offset+=datos.byteLength;const pad=(4-offset%4)%4;if(pad){trozos.push(Buffer.alloc(pad));offset+=pad;}return inicio;}
function escribirAccessor(a, raw, modo) {
  const clave=createHash('sha256').update(`${a.type}/${a.componentType}/${!!a.normalized}/${modo}`).update(Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength)).digest('hex');
  if(cacheAccessor.has(clave))return cacheAccessor.get(clave);
  const n=tamanos[a.type], tam=raw.BYTES_PER_ELEMENT*n;
  const stride=modo==='TRIANGLES'?raw.BYTES_PER_ELEMENT:Math.ceil(tam/4)*4;
  const count=raw.length/n, packed=new Uint8Array(count*stride), src=new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);
  for(let k=0;k<count;k++)packed.set(src.subarray(k*tam,(k+1)*tam),k*stride);
  const comp=MeshoptEncoder.encodeGltfBuffer(packed,count,stride,modo);
  const v={buffer:1,byteOffset:fallback,byteLength:packed.length,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:agregar(comp),byteLength:comp.length,byteStride:stride,count,mode:modo}}};
  if(modo==='ATTRIBUTES')v.byteStride=stride;
  fallback+=packed.length;
  const nuevo={...a,bufferView:doc.bufferViews.length,byteOffset:0,count};
  delete nuevo.min;delete nuevo.max;
  if(a.type!=='SCALAR'){
    nuevo.min=Array(n).fill(Infinity);nuevo.max=Array(n).fill(-Infinity);
    for(let k=0;k<raw.length;k++){const j=k%n;nuevo.min[j]=Math.min(nuevo.min[j],raw[k]);nuevo.max[j]=Math.max(nuevo.max[j],raw[k]);}
  }
  doc.bufferViews.push(v);doc.accessors.push(nuevo);cacheAccessor.set(clave,doc.accessors.length-1);return doc.accessors.length-1;
}
// Imágenes intactas; solo cambia la ubicación dentro del contenedor.
for(const img of doc.images||[]){if(img.bufferView===undefined)continue;const data=vista(img.bufferView);img.bufferView=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:agregar(data),byteLength:data.length});}
const cacheMalla=new Map(), balance=new Map();
let antes=0,despues=0,nodosAntes=0,nodosDespues=0,baseAntes=0,baseDespues=0;
function visitar(i,padre){
  const n=original.nodes[i], world=padre.clone().multiply(matriz(n));
  for(const h of n.children||[])visitar(h,world);
  if(n.mesh===undefined)return;
  nodosAntes++;
  const m=original.meshes[n.mesh], elegidas=[];
  for(const p of m.primitives){
    if((p.mode??4)!==4||p.targets)throw new Error('Solo triángulos estáticos');
    const sel=seleccionar(p,world), a=sel.idx.length/3, d=sel.seleccion.length/3;
    antes+=a;despues+=d;if(sel.base){baseAntes+=a;baseDespues+=d;}
    const nombre=original.materials[p.material]?.name||'sin material';
    const b=balance.get(nombre)||{antes:0,despues:0,base:!!sel.base};b.antes+=a;b.despues+=d;balance.set(nombre,b);
    if(d)elegidas.push({p,seleccion:sel.seleccion});
  }
  if(!elegidas.length)return;
  nodosDespues++;
  const hash=createHash('sha256').update(String(n.mesh));
  for(const {p,seleccion} of elegidas)hash.update(String(m.primitives.indexOf(p))).update(Buffer.from(new Uint32Array(seleccion).buffer));
  const key=hash.digest('hex');let mi=cacheMalla.get(key);
  if(mi===undefined){
    const nuevo={name:m.name,primitives:[]};
    for(const {p,seleccion} of elegidas){
      const usados=[...new Set(seleccion)].sort((a,b)=>a-b), remap=new Map(usados.map((v,i)=>[v,i]));
      const q={...p,attributes:{}};
      for(const [semantica,id] of Object.entries(p.attributes)){
        const {raw,n,a}=atributo(id), datos=new raw.constructor(usados.length*n);
        usados.forEach((v,i)=>datos.set(raw.subarray(v*n,v*n+n),i*n));
        q.attributes[semantica]=escribirAccessor(a,datos,'ATTRIBUTES');
      }
      const T=usados.length>65535?Uint32Array:Uint16Array;
      q.indices=escribirAccessor({type:'SCALAR',componentType:T===Uint32Array?5125:5123,normalized:false},T.from(seleccion,v=>remap.get(v)),'TRIANGLES');
      nuevo.primitives.push(q);
    }
    mi=doc.meshes.length;doc.meshes.push(nuevo);cacheMalla.set(key,mi);
  }
  doc.nodes.push({name:n.name,matrix:world.toArray(),mesh:mi,extras:{nodoOrigen:i}});
}
for(const i of original.scenes[original.scene||0].nodes)visitar(i,new Matrix4());
doc.scenes=[{nodes:doc.nodes.map((_,i)=>i)}];doc.scene=0;
doc.buffers=[{byteLength:offset},{byteLength:fallback,extensions:{EXT_meshopt_compression:{fallback:true}}}];
doc.extras={...doc.extras,recorte:{centro:[cx,cz],radio,criterio:'islas que intersectan el círculo; terreno, viales y costa intactos'}};
const json=Buffer.from(JSON.stringify(doc)), jp=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jp);
const datos=Buffer.concat(trozos), header=Buffer.alloc(20), bh=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jp.length+datos.length,8);header.writeUInt32LE(jp.length,12);header.writeUInt32LE(0x4e4f534a,16);
bh.writeUInt32LE(datos.length,0);bh.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(salida,Buffer.concat([header,jp,bh,datos]));
const informe={centro:[cx,cz],radio,bytesAntes:bytes.length,bytesDespues:fs.statSync(salida).size,nodosAntes,nodosDespues,triangulosAntes:antes,triangulosDespues:despues,baseAntes,baseDespues,materiales:Object.fromEntries(balance)};
fs.writeFileSync(salida+'.json',JSON.stringify(informe,null,2)+'\n');
console.log(JSON.stringify({...informe,materiales:undefined},null,2));
