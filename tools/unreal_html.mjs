#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   unreal_html.mjs — Genera unreal.html a partir de index.html.

   Es la misma interfaz de /new, preparada para abrirse **desde disco**
   dentro del ejecutable de Unreal (plugin Web UI), donde no hay servidor:

   · Un solo archivo de JavaScript clásico (esbuild junta motor/puente.js,
     shell.js y lo que importan). Desde file:// el navegador bloquea los
     módulos ES y el fetch de archivos locales; así no hace falta ninguno.
   · El catálogo (data/units.json) y la copia de estados
     (data/availability.json) van incrustados. Los estados vivos se piden al
     panel publicado y, sin internet, vale la copia.
   · <base href="./">: hoja de estilos, logos e iconos relativos a su propia
     carpeta. El paquete lleva unreal.html, css/ y assets/ juntos.
   · Motor forzado al puente: dentro del .exe nunca hay three.js.

   Se ejecuta con `node tools/unreal_html.mjs` cada vez que cambie la
   interfaz, el puente o los datos; el resultado se commitea. Falla en voz
   alta si index.html ya no tiene lo que espera, para que no salga a medias.
   ═══════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'index.html');
const destino = join(raiz, 'unreal.html');

let s = readFileSync(origen, 'utf8');

/* Sustitución que exige encontrar exactamente `veces` apariciones. */
function cambiar(de, a, veces = 1) {
  const n = s.split(de).length - 1;
  if (n !== veces) throw new Error(`unreal_html: esperaba ${veces} × «${de.split('\n')[0]}» en index.html y hay ${n}`);
  s = s.split(de).join(a);
}
function sustituir(regex, a, que) {
  if (!regex.test(s)) throw new Error(`unreal_html: no encuentro ${que} en index.html`);
  s = s.replace(regex, () => a); // función: con cadena, «$$» y «$1» del JavaScript se interpretarían
}
/* Dentro de un <script> inline, «</script» cerraría la etiqueta. */
const seguro = (texto) => texto.replace(/<\/(script)/gi, '<\\/$1');

/* ── 1. El JavaScript, en un solo archivo clásico ── */
const bundle = await esbuild.build({
  stdin: { contents: "import 'app/motor/puente.js';\nimport 'app/shell.js';\n", resolveDir: join(raiz, 'js'), loader: 'js' },
  bundle: true, format: 'iife', write: false, minify: false, charset: 'utf8', legalComments: 'none',
  target: ['es2019'], // el CEF de Unreal va por detrás de Chrome
  plugins: [{
    name: 'app',
    setup(b) { b.onResolve({ filter: /^app\// }, (arg) => ({ path: join(raiz, 'js', arg.path.slice('app/'.length)) })); },
  }],
});
const js = seguro(bundle.outputFiles[0].text);

/* ── 2. Los datos incrustados ── */
const units = JSON.parse(readFileSync(join(raiz, 'data/units.json'), 'utf8'));
const availability = JSON.parse(readFileSync(join(raiz, 'data/availability.json'), 'utf8'));
const datos = seguro(JSON.stringify({ units, availability }));

/* ── 3. La página ── */
cambiar('<!DOCTYPE html>\n', `<!DOCTYPE html>
<!-- GENERADO por tools/unreal_html.mjs a partir de index.html: no editar a
     mano. Es la misma interfaz, abierta desde disco dentro del ejecutable de
     Unreal (Web UI): un solo archivo de JavaScript, datos incrustados, rutas
     relativas a su carpeta y el puente motor/puente.js en lugar de three.js. -->
`);
cambiar('<title>UNIK · SERENEA — Edificio Apolo</title>', '<title>SERENEA · Edificio Apolo</title>');
cambiar('<base href="/">', '<base href="./">');
cambiar('href="/css/shell.css?v=__BUILD__"', 'href="css/shell.css"');

/* La portada del enlace (Open Graph) no pinta nada en un ejecutable. */
sustituir(/<!-- Portada del enlace[\s\S]*?-->\n/, '', 'la nota de la portada del enlace');
s = s.replace(/^<meta (?:property="og:|name="twitter:)[^\n]*\n/gm, '');

/* Sin servidor no hay mapa de importación: en su lugar, los datos. */
sustituir(/<!-- Mapa de importación del contrato[\s\S]*?<script type="importmap">[\s\S]*?<\/script>\n/, `<!-- Dentro del ejecutable no hay servidor: el catálogo y la copia de estados
     van incrustados (generados desde data/). Los estados vivos se piden al
     panel publicado y, sin internet, vale la copia. -->
<script>
window.APOLO_API = { availabilityUrl: 'https://showroom.unikdi.com/gestion/api/estado.php' };
window.APOLO_DATOS = ${datos};
</script>
`, 'el mapa de importación');

/* El selector de motor se sustituye por el puente, ya empaquetado. */
sustituir(/<!-- Qué hay debajo de la interfaz\.[\s\S]*?<\/script>\n/, `<!-- Dentro del ejecutable siempre está Unreal debajo: el puente y, encima,
     la misma interfaz, todo en un archivo clásico (empaquetado con esbuild
     desde js/). ?simulador=1 sigue valiendo para probar sin Unreal. -->
<script>
  document.documentElement.classList.add('motor-unreal');
  if (new URLSearchParams(location.search).get('simulador') === '1') document.documentElement.classList.add('simulador');
</script>
<script>
${js}</script>
`, 'el selector de motor');

for (const resto of ['__BUILD__', 'type="module"', 'importmap']) {
  if (s.includes(resto)) throw new Error(`unreal_html: queda «${resto}» en la página generada`);
}

writeFileSync(destino, s);
console.log(`unreal_html: escrito unreal.html (${(s.length / 1024).toFixed(0)} KB; JavaScript ${(js.length / 1024).toFixed(0)} KB, datos ${(datos.length / 1024).toFixed(0)} KB)`);
