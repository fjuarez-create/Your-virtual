-- ═══════════════════════════════════════════════════════════════
-- UNIK repasos — esquema de la base de datos (MySQL / MariaDB).
--
-- Las marcas de tiempo son cadenas ISO-8601 en UTC de longitud fija
-- (2026-08-22T09:15:03.412Z). Ordenarlas como texto es ordenarlas por
-- fecha, así que la sincronización funciona igual sea cual sea la zona
-- horaria del hosting, y no hay conversiones que se puedan torcer.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS usuarios (
  id            CHAR(36)     NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol           VARCHAR(10)  NOT NULL DEFAULT 'usuario',
  empresa       VARCHAR(120) NOT NULL DEFAULT '',
  verifica      TINYINT(1)   NOT NULL DEFAULT 0,
  avatar        VARCHAR(24)  NOT NULL DEFAULT '',
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado        CHAR(24)     NOT NULL,
  actualizado   CHAR(24)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones (
  token      CHAR(64)     NOT NULL,   -- SHA-256 del token real
  usuario_id CHAR(36)     NOT NULL,
  creado     CHAR(24)     NOT NULL,
  visto      CHAR(24)     NOT NULL,
  caduca     CHAR(24)     NOT NULL,
  agente     VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (token),
  KEY ix_sesiones_usuario (usuario_id),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intentos fallidos de entrada, para frenar la fuerza bruta.
CREATE TABLE IF NOT EXISTS intentos (
  id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email  VARCHAR(190) NOT NULL,
  ip     VARCHAR(45)  NOT NULL,
  cuando CHAR(24)     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_intentos_email (email, cuando),
  KEY ix_intentos_ip (ip, cuando)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS listas (
  id                CHAR(36)     NOT NULL,
  unidad_id         VARCHAR(80)  NOT NULL,   -- p. ej. 'brassie:04'
  promo_id          VARCHAR(60)  NOT NULL,
  fase              VARCHAR(20)  NOT NULL DEFAULT 'pre',
  nombre            VARCHAR(120) NOT NULL DEFAULT '',   -- vacío = el de la vivienda
  cerrada           TINYINT(1)   NOT NULL DEFAULT 0,
  borrada           TINYINT(1)   NOT NULL DEFAULT 0,
  creado            CHAR(24)     NOT NULL,
  actualizado       CHAR(24)     NOT NULL,
  creado_por        CHAR(36)     DEFAULT NULL,
  creado_por_nombre VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_listas_unidad (unidad_id),
  KEY ix_listas_actualizado (actualizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tareas (
  id                CHAR(36)     NOT NULL,
  lista_id          CHAR(36)     NOT NULL,
  texto             TEXT         NOT NULL,
  estado            VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  oficio            VARCHAR(30)  NOT NULL DEFAULT 'general',
  zona              VARCHAR(40)  NOT NULL DEFAULT '',
  fecha_limite      VARCHAR(32)  DEFAULT NULL,
  orden             INT          NOT NULL DEFAULT 0,
  portada_id        CHAR(36)     DEFAULT NULL,
  estado_por        VARCHAR(120) DEFAULT NULL,
  estado_en         CHAR(24)     DEFAULT NULL,
  rechazada         TINYINT(1)   NOT NULL DEFAULT 0,
  borrada           TINYINT(1)   NOT NULL DEFAULT 0,
  creado            CHAR(24)     NOT NULL,
  actualizado       CHAR(24)     NOT NULL,
  creado_por        CHAR(36)     DEFAULT NULL,
  creado_por_nombre VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_tareas_lista (lista_id),
  KEY ix_tareas_actualizado (actualizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comentarios (
  id                 CHAR(36)     NOT NULL,
  tarea_id           CHAR(36)     NOT NULL,
  texto              TEXT         NOT NULL,
  tipo               VARCHAR(20)  NOT NULL DEFAULT 'nota',   -- nota | rechazo
  borrada            TINYINT(1)   NOT NULL DEFAULT 0,
  creado             CHAR(24)     NOT NULL,
  actualizado        CHAR(24)     NOT NULL,
  creado_por         CHAR(36)     DEFAULT NULL,
  creado_por_nombre  VARCHAR(120) NOT NULL,
  creado_por_empresa VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_comentarios_tarea (tarea_id),
  KEY ix_comentarios_actualizado (actualizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS medios (
  id            CHAR(36)     NOT NULL,
  tarea_id      CHAR(36)     NOT NULL,
  comentario_id CHAR(36)     DEFAULT NULL,
  tipo        VARCHAR(10)  NOT NULL,          -- imagen | video | audio
  mime        VARCHAR(100) NOT NULL,
  tam         BIGINT       NOT NULL DEFAULT 0,
  ancho       INT          NOT NULL DEFAULT 0,
  alto        INT          NOT NULL DEFAULT 0,
  duracion    INT          NOT NULL DEFAULT 0,
  ruta        VARCHAR(255) NOT NULL,
  borrada     TINYINT(1)   NOT NULL DEFAULT 0,
  creado      CHAR(24)     NOT NULL,
  actualizado CHAR(24)     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_medios_tarea (tarea_id),
  KEY ix_medios_actualizado (actualizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de control: guarda la versión del esquema para que el backend
-- sepa, al arrancar, si tiene que añadir algo por su cuenta.
CREATE TABLE IF NOT EXISTS meta (
  clave VARCHAR(60)  NOT NULL,
  valor VARCHAR(255) NOT NULL,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes (
  id                 CHAR(36)     NOT NULL,
  unidad_id          VARCHAR(60)  NOT NULL,
  promo_id           VARCHAR(40)  NOT NULL DEFAULT '',
  texto              TEXT         NOT NULL,
  borrada            TINYINT(1)   NOT NULL DEFAULT 0,
  creado             CHAR(24)     NOT NULL,
  actualizado        CHAR(24)     NOT NULL,
  creado_por         CHAR(36)     DEFAULT NULL,
  creado_por_nombre  VARCHAR(120) NOT NULL,
  creado_por_empresa VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_mensajes_unidad (unidad_id),
  KEY ix_mensajes_actualizado (actualizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quién ha leído qué. Una fila por mensaje y persona, con el id
-- compuesto por los dos: así dos lecturas que lleguen a la vez no se
-- pisan —son filas distintas— y volver a subir la misma no duplica
-- nada, porque tiene la misma clave.
CREATE TABLE IF NOT EXISTS lecturas (
  id           VARCHAR(80) NOT NULL,
  mensaje_id   CHAR(36)    NOT NULL,
  usuario_id   CHAR(36)    NOT NULL,
  creado       CHAR(24)    NOT NULL,
  actualizado  CHAR(24)    NOT NULL,
  PRIMARY KEY (id),
  KEY ix_lecturas_mensaje (mensaje_id),
  KEY ix_lecturas_actualizado (actualizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══ La obra: reuniones y encargos ═══════════════════════════════
-- Una reunión de obra al día, con su acta. Los ENCARGOS son las tareas
-- que nacen de una reunión: en pantalla se llaman «tareas», pero por
-- dentro llevan nombre propio para no chocar jamás con la tabla
-- `tareas`, que guarda repasos (ver CLAUDE.md, el diccionario).
CREATE TABLE IF NOT EXISTS reuniones (
  id                CHAR(36)     NOT NULL,
  promo_id          VARCHAR(40)  NOT NULL,
  fecha             CHAR(10)     NOT NULL,
  empezada          CHAR(24)     NOT NULL,
  terminada         CHAR(24)     DEFAULT NULL,
  asistentes        TEXT         NOT NULL,
  invitados         TEXT         NOT NULL,
  resumen           MEDIUMTEXT,
  propuesta         MEDIUMTEXT,
  borrada           TINYINT(1)   NOT NULL DEFAULT 0,
  creado            CHAR(24)     NOT NULL,
  actualizado       CHAR(24)     NOT NULL,
  creado_por        CHAR(36)     DEFAULT NULL,
  creado_por_nombre VARCHAR(120) NOT NULL DEFAULT '',
  acta_firmada      VARCHAR(32)  DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY ix_reuniones_dia (promo_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS encargos (
  id                 CHAR(36)     NOT NULL,
  reunion_id         CHAR(36)     NOT NULL,
  promo_id           VARCHAR(40)  NOT NULL,
  texto              TEXT         NOT NULL,
  general            TINYINT(1)   NOT NULL DEFAULT 1,
  unidad_id          VARCHAR(60)  NOT NULL DEFAULT '',
  responsable_id     CHAR(36)     DEFAULT NULL,
  responsable_nombre VARCHAR(120) NOT NULL DEFAULT '',
  fecha_limite       CHAR(10)     NOT NULL DEFAULT '',
  estado             VARCHAR(12)  NOT NULL DEFAULT 'pendiente',
  hecho_en           CHAR(24)     DEFAULT NULL,
  hecho_por_nombre   VARCHAR(120) NOT NULL DEFAULT '',
  borrada            TINYINT(1)   NOT NULL DEFAULT 0,
  creado             CHAR(24)     NOT NULL,
  actualizado        CHAR(24)     NOT NULL,
  creado_por         CHAR(36)     DEFAULT NULL,
  creado_por_nombre  VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_encargos_reunion (reunion_id),
  KEY ix_encargos_estado (promo_id, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══ El audio de las reuniones y el registro de voces ═══════════
-- Una grabación por reunión, guardada por PARTES: cada parte es un
-- fichero de audio completo (el móvil rota la grabadora cada media
-- hora), porque los trozos de un mp4 de iPhone no se pueden pegar en
-- el servidor. `partes` y `hablantes` van en JSON: cambian de forma
-- con el proveedor de voces y no se consultan por columnas.
CREATE TABLE IF NOT EXISTS grabaciones (
  id                CHAR(36)     NOT NULL,
  reunion_id        CHAR(36)     NOT NULL,
  promo_id          VARCHAR(40)  NOT NULL,
  estado            VARCHAR(14)  NOT NULL DEFAULT 'grabando',
  mime              VARCHAR(60)  NOT NULL DEFAULT '',
  duracion          INT          NOT NULL DEFAULT 0,
  tam               BIGINT       NOT NULL DEFAULT 0,
  partes            MEDIUMTEXT,
  hablantes         TEXT,
  audio_borrado     TINYINT(1)   NOT NULL DEFAULT 0,
  borrada           TINYINT(1)   NOT NULL DEFAULT 0,
  creado            VARCHAR(32)  NOT NULL,
  actualizado       VARCHAR(32)  NOT NULL,
  creado_por        CHAR(36)     DEFAULT NULL,
  creado_por_nombre VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_grabaciones_reunion (reunion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A quién suena cada voz de la obra. La huella (`huella_id`) es el
-- identificador del voiceprint en el proveedor acústico, si lo hay;
-- la muestra apunta a un tramo de una grabación para poder escucharla
-- al asignar, sin recortar ficheros.
CREATE TABLE IF NOT EXISTS voces (
  id                   CHAR(36)     NOT NULL,
  promo_id             VARCHAR(40)  NOT NULL,
  persona_id           CHAR(36)     DEFAULT NULL,
  persona_nombre       VARCHAR(120) NOT NULL DEFAULT '',
  huella               MEDIUMTEXT,
  huella_trabajo       VARCHAR(80)  NOT NULL DEFAULT '',
  muestra_grabacion_id CHAR(36)     DEFAULT NULL,
  muestra_parte        INT          NOT NULL DEFAULT 0,
  muestra_desde        DOUBLE       NOT NULL DEFAULT 0,
  muestra_hasta        DOUBLE       NOT NULL DEFAULT 0,
  borrada              TINYINT(1)   NOT NULL DEFAULT 0,
  creado               VARCHAR(32)  NOT NULL,
  actualizado          VARCHAR(32)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_voces_promo (promo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
