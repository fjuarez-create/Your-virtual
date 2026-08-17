/**
 * @umaia/auth — primitivas de autenticación compartidas por los dos perímetros.
 *
 * Lo que este paquete comparte: hashing, testigos, limitación de intentos.
 * Lo que NO comparte, y no debe: las tablas de credenciales, las tablas de
 * sesión, las cookies y los guardias de autorización. Esa separación es la
 * decisión de diseño que impide que un fallo en el área de inversor abra el
 * panel de administración.
 */

export * from './passwords.js';
export * from './sessions.js';
export * from './rate-limit.js';
