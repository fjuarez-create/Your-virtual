-- =============================================================================
-- Permisos del rol de aplicación.
--
-- Esto NO va en las migraciones: lo ejecuta un operador con privilegios de
-- superusuario al preparar cada entorno, porque crea roles y revoca permisos
-- que la propia aplicación no debe poder concederse.
--
-- Uso:
--   psql "$SUPERUSER_DATABASE_URL" -v app_role=umaia_app -f sql/roles.sql
--
-- Modelo de privilegios:
--   · umaia_migrator → dueño del esquema. Solo lo usan las migraciones.
--   · umaia_app      → el que usa la aplicación en caliente. NO puede modificar
--                      ni borrar las tablas de solo inserción, ni alterar el
--                      esquema. Es la diferencia entre "la aplicación no lo
--                      hace" y "la aplicación no puede hacerlo".
-- =============================================================================

\set ON_ERROR_STOP on
\if :{?app_role} \else \set app_role 'umaia_app' \endif

-- El rol de aplicación no es dueño de nada y no puede hacer DDL.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :app_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO :app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :app_role;

-- Y lo mismo para lo que creen las migraciones futuras.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :app_role;

-- -----------------------------------------------------------------------------
-- Tablas de solo inserción.
--
-- El trigger ya las protege, pero el trigger se puede desactivar con permisos
-- suficientes. Revocar el permiso es la segunda cerradura: para saltársela hay
-- que ser superusuario, y eso deja rastro en la cadena de hashes.
-- -----------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON
  audit_log,
  legal_document_acceptance,
  investment_transition,
  compliance_setting_change
FROM :app_role;

-- `seq` de audit_log es BIGSERIAL: la aplicación necesita la secuencia para
-- insertar, aunque no pueda tocar las filas ya escritas.
GRANT USAGE, SELECT ON SEQUENCE audit_log_seq_seq TO :app_role;

-- -----------------------------------------------------------------------------
-- Comprobación: que el operador vea qué ha quedado revocado.
-- -----------------------------------------------------------------------------
SELECT
  table_name AS "tabla",
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS "permisos del rol de aplicación"
FROM information_schema.table_privileges
WHERE grantee = :'app_role'
  AND table_name IN ('audit_log', 'legal_document_acceptance',
                     'investment_transition', 'compliance_setting_change')
GROUP BY table_name
ORDER BY table_name;
