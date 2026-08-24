-- ═══════════════════════════════════════════════════════════════
-- UNIK repasos — esquema para SQLite.
--
-- Mismo modelo que schema.sql (MySQL), traducido: sin ENGINE ni
-- COLLATE, los índices como sentencias aparte y el autoincremento con
-- INTEGER PRIMARY KEY. Útil si el hosting no da base de datos, y es lo
-- que se usa para probar la API en local.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS usuarios (
  id            TEXT NOT NULL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'usuario',
  empresa       TEXT NOT NULL DEFAULT '',
  verifica      INTEGER NOT NULL DEFAULT 0,
  avatar        TEXT NOT NULL DEFAULT '',
  activo        INTEGER NOT NULL DEFAULT 1,
  creado        TEXT NOT NULL,
  actualizado   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT NOT NULL PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  creado     TEXT NOT NULL,
  visto      TEXT NOT NULL,
  caduca     TEXT NOT NULL,
  agente     TEXT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones (usuario_id);

CREATE TABLE IF NOT EXISTS intentos (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  email  TEXT NOT NULL,
  ip     TEXT NOT NULL,
  cuando TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_intentos_email ON intentos (email, cuando);
CREATE INDEX IF NOT EXISTS ix_intentos_ip ON intentos (ip, cuando);

CREATE TABLE IF NOT EXISTS listas (
  id                TEXT NOT NULL PRIMARY KEY,
  unidad_id         TEXT NOT NULL,
  promo_id          TEXT NOT NULL,
  fase              TEXT NOT NULL DEFAULT 'pre',
  nombre            TEXT NOT NULL DEFAULT '',
  cerrada           INTEGER NOT NULL DEFAULT 0,
  borrada           INTEGER NOT NULL DEFAULT 0,
  creado            TEXT NOT NULL,
  actualizado       TEXT NOT NULL,
  creado_por        TEXT,
  creado_por_nombre TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_listas_unidad ON listas (unidad_id);
CREATE INDEX IF NOT EXISTS ix_listas_actualizado ON listas (actualizado);

CREATE TABLE IF NOT EXISTS tareas (
  id                TEXT NOT NULL PRIMARY KEY,
  lista_id          TEXT NOT NULL,
  texto             TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'pendiente',
  oficio            TEXT NOT NULL DEFAULT 'general',
  zona              TEXT NOT NULL DEFAULT '',
  fecha_limite TEXT DEFAULT NULL,
  orden             INTEGER NOT NULL DEFAULT 0,
  portada_id        TEXT,
  estado_por        TEXT,
  estado_en         TEXT,
  rechazada         INTEGER NOT NULL DEFAULT 0,
  borrada           INTEGER NOT NULL DEFAULT 0,
  creado            TEXT NOT NULL,
  actualizado       TEXT NOT NULL,
  creado_por        TEXT,
  creado_por_nombre TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tareas_lista ON tareas (lista_id);
CREATE INDEX IF NOT EXISTS ix_tareas_actualizado ON tareas (actualizado);

CREATE TABLE IF NOT EXISTS comentarios (
  id                 TEXT NOT NULL PRIMARY KEY,
  tarea_id           TEXT NOT NULL,
  texto              TEXT NOT NULL,
  tipo               TEXT NOT NULL DEFAULT 'nota',
  borrada            INTEGER NOT NULL DEFAULT 0,
  creado             TEXT NOT NULL,
  actualizado        TEXT NOT NULL,
  creado_por         TEXT,
  creado_por_nombre  TEXT NOT NULL,
  creado_por_empresa TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_comentarios_tarea ON comentarios (tarea_id);
CREATE INDEX IF NOT EXISTS ix_comentarios_actualizado ON comentarios (actualizado);

CREATE TABLE IF NOT EXISTS medios (
  id            TEXT NOT NULL PRIMARY KEY,
  tarea_id      TEXT NOT NULL,
  comentario_id TEXT,
  tipo        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  tam         INTEGER NOT NULL DEFAULT 0,
  ancho       INTEGER NOT NULL DEFAULT 0,
  alto        INTEGER NOT NULL DEFAULT 0,
  duracion    INTEGER NOT NULL DEFAULT 0,
  ruta        TEXT NOT NULL,
  borrada     INTEGER NOT NULL DEFAULT 0,
  creado      TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_medios_tarea ON medios (tarea_id);
CREATE INDEX IF NOT EXISTS ix_medios_actualizado ON medios (actualizado);

-- Tabla de control: guarda la versión del esquema para que el backend
-- sepa, al arrancar, si tiene que añadir algo por su cuenta.
CREATE TABLE IF NOT EXISTS meta (
  clave TEXT NOT NULL PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mensajes (
  id                 TEXT NOT NULL PRIMARY KEY,
  unidad_id          TEXT NOT NULL,
  promo_id           TEXT NOT NULL DEFAULT '',
  texto              TEXT NOT NULL,
  borrada            INTEGER NOT NULL DEFAULT 0,
  creado             TEXT NOT NULL,
  actualizado        TEXT NOT NULL,
  creado_por         TEXT,
  creado_por_nombre  TEXT NOT NULL,
  creado_por_empresa TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_mensajes_unidad ON mensajes (unidad_id);
CREATE INDEX IF NOT EXISTS ix_mensajes_actualizado ON mensajes (actualizado);

CREATE TABLE IF NOT EXISTS lecturas (
  id          TEXT NOT NULL PRIMARY KEY,
  mensaje_id  TEXT NOT NULL,
  usuario_id  TEXT NOT NULL,
  creado      TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lecturas_mensaje ON lecturas (mensaje_id);
CREATE INDEX IF NOT EXISTS ix_lecturas_actualizado ON lecturas (actualizado);

-- ═══ La obra: reuniones y encargos ═══════════════════════════════
-- Una reunión de obra al día, con su acta. Los ENCARGOS son las tareas
-- que nacen de una reunión: en pantalla se llaman «tareas», pero por
-- dentro llevan nombre propio para no chocar jamás con la tabla
-- `tareas`, que guarda repasos (ver CLAUDE.md, el diccionario).
CREATE TABLE IF NOT EXISTS reuniones (
  id                TEXT NOT NULL PRIMARY KEY,
  promo_id          TEXT NOT NULL,
  fecha             TEXT NOT NULL,
  empezada          TEXT NOT NULL,
  terminada         TEXT,
  asistentes        TEXT NOT NULL,
  invitados         TEXT NOT NULL,
  resumen           TEXT,
  propuesta         TEXT,
  borrada           INTEGER NOT NULL DEFAULT 0,
  creado            TEXT NOT NULL,
  actualizado       TEXT NOT NULL,
  creado_por        TEXT,
  creado_por_nombre TEXT NOT NULL DEFAULT '',
  acta_firmada      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_reuniones_dia ON reuniones (promo_id, fecha);

CREATE TABLE IF NOT EXISTS encargos (
  id                 TEXT NOT NULL PRIMARY KEY,
  reunion_id         TEXT NOT NULL,
  promo_id           TEXT NOT NULL,
  texto              TEXT NOT NULL,
  general            INTEGER NOT NULL DEFAULT 1,
  unidad_id          TEXT NOT NULL DEFAULT '',
  responsable_id     TEXT,
  responsable_nombre TEXT NOT NULL DEFAULT '',
  fecha_limite       TEXT NOT NULL DEFAULT '',
  estado             TEXT NOT NULL DEFAULT 'pendiente',
  hecho_en           TEXT,
  hecho_por_nombre   TEXT NOT NULL DEFAULT '',
  borrada            INTEGER NOT NULL DEFAULT 0,
  creado             TEXT NOT NULL,
  actualizado        TEXT NOT NULL,
  creado_por         TEXT,
  creado_por_nombre  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_encargos_reunion ON encargos (reunion_id);
CREATE INDEX IF NOT EXISTS ix_encargos_estado ON encargos (promo_id, estado);

-- ═══ El audio de las reuniones y el registro de voces ═══════════
-- (ver el comentario del esquema de MySQL: partes por fichero completo
-- y JSON para lo que cambia de forma con el proveedor)
CREATE TABLE IF NOT EXISTS grabaciones (
  id                TEXT NOT NULL PRIMARY KEY,
  reunion_id        TEXT NOT NULL,
  promo_id          TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'grabando',
  mime              TEXT NOT NULL DEFAULT '',
  duracion          INTEGER NOT NULL DEFAULT 0,
  tam               INTEGER NOT NULL DEFAULT 0,
  partes            TEXT,
  hablantes         TEXT,
  audio_borrado     INTEGER NOT NULL DEFAULT 0,
  borrada           INTEGER NOT NULL DEFAULT 0,
  creado            TEXT NOT NULL,
  actualizado       TEXT NOT NULL,
  creado_por        TEXT,
  creado_por_nombre TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_grabaciones_reunion ON grabaciones (reunion_id);

CREATE TABLE IF NOT EXISTS voces (
  id                   TEXT NOT NULL PRIMARY KEY,
  promo_id             TEXT NOT NULL,
  persona_id           TEXT,
  persona_nombre       TEXT NOT NULL DEFAULT '',
  huella               TEXT,
  huella_trabajo       TEXT NOT NULL DEFAULT '',
  muestra_grabacion_id TEXT,
  muestra_parte        INTEGER NOT NULL DEFAULT 0,
  muestra_desde        REAL NOT NULL DEFAULT 0,
  muestra_hasta        REAL NOT NULL DEFAULT 0,
  borrada              INTEGER NOT NULL DEFAULT 0,
  creado               TEXT NOT NULL,
  actualizado          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_voces_promo ON voces (promo_id);
