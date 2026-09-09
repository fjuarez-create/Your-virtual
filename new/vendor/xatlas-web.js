// Sustituto vacío: three-gpu-pathtracer solo usa xatlas-web para desplegar UVs
// de lightmaps, algo que no ocurre en el visor. Así el módulo resuelve sin
// arrastrar 600 KB de WebAssembly.
export default function xatlasStub() { throw new Error('xatlas-web no está disponible en el visor'); }
