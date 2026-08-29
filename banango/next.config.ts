import type { NextConfig } from 'next';

/**
 * Dos modos de despliegue con el mismo código:
 * - Servidor (Vercel, Node…): `npm run build` — IA con Claude + fuentes live.
 * - Estático (hosting de ficheros, p. ej. unikdi.com/bng): `npm run build:static`
 *   — la búsqueda demo corre en el navegador. Ver scripts/build-static.mjs.
 */
const isStatic = process.env.BANANGO_STATIC === '1';

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  ...(isStatic ? { output: 'export' as const } : {}),
};

export default nextConfig;
