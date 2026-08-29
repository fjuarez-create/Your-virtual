#!/usr/bin/env node
/**
 * Build estático de banango para hostings de solo-ficheros
 * (p. ej. la subcarpeta unikdi.com/bng).
 *
 * La ruta API no existe en un export estático, así que durante este build se
 * aparta `src/app/api` (los directorios con «_» quedan fuera del enrutador) y
 * la página usa la búsqueda en cliente (src/lib/client-search.ts).
 *
 *   npm run build:static                  → basePath /bng (por defecto)
 *   NEXT_PUBLIC_BASE_PATH=/otra npm run build:static
 *
 * Salida en out/.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL('.', import.meta.url).pathname.replace(/\/$/, ''));
const api = path.join(root, 'src', 'app', 'api');
const hidden = path.join(root, 'src', 'app', '_api');

if (!fs.existsSync(api)) {
  console.error('No encuentro src/app/api — ¿ya hay otro build:static a medias?');
  process.exit(1);
}

fs.renameSync(api, hidden);
try {
  execSync('next build', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      BANANGO_STATIC: '1',
      NEXT_PUBLIC_STATIC: '1',
      NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? '/bng',
    },
  });
} finally {
  fs.renameSync(hidden, api);
}

console.log('\nExport estático listo en out/ (búsqueda demo en el navegador).');
