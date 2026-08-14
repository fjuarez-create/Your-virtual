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
  orden             INT          NOT NULL DEFAULT 0,
  portada_id        CHAR(36)     DEFAULT NULL,
  estado_por        VARCHAR(120) DEFAULT NULL,
  estado_en         CHAR(24)     DEFAULT NULL,
  borrada           TINYINT(1)   NOT NULL DEFAULT 0,
  creado            CHAR(24)     NOT NULL,
  actualizado       CHAR(24)     NOT NULL,
  creado_por        CHAR(36)     DEFAULT NULL,
  creado_por_nombre VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_tareas_lista (lista_id),
  KEY ix_tareas_actualizado (actualizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS medios (
  id          CHAR(36)     NOT NULL,
  tarea_id    CHAR(36)     NOT NULL,
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
