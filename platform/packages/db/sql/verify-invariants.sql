-- =============================================================================
-- Verificación de las garantías del motor.
--
-- Comprueba que las invariantes que sostienen dinero, identidad y trazabilidad
-- legal se cumplen DE VERDAD en la base de datos, no solo en el código.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/verify-invariants.sql
--
-- El guion trabaja dentro de una transacción y hace ROLLBACK al final: no deja
-- nada. Es seguro ejecutarlo contra un entorno con datos, aunque lo natural es
-- lanzarlo en CI contra una base de datos recién migrada.
--
-- Si alguna garantía deja de cumplirse, el guion aborta con el mensaje de qué
-- invariante se rompió.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- -----------------------------------------------------------------------------
-- Fixtures mínimos
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE t (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;

INSERT INTO t VALUES
  ('user',        gen_random_uuid()),
  ('acct_nat',    gen_random_uuid()),
  ('acct_legal',  gen_random_uuid()),
  ('project',     gen_random_uuid()),
  ('round',       gen_random_uuid()),
  ('legal_doc',   gen_random_uuid()),
  ('ledger_txn',  gen_random_uuid()),
  ('ledger_acct', gen_random_uuid());

INSERT INTO investor_user (id, email, password_hash, updated_at)
SELECT v, 'verificacion@ejemplo.test', 'argon2id$dummy', now() FROM t WHERE k = 'user';

INSERT INTO investor_account (id, type, display_name, updated_at)
SELECT v, 'NATURAL', 'Persona de prueba', now() FROM t WHERE k = 'acct_nat';

INSERT INTO investor_account (id, type, display_name, updated_at)
SELECT v, 'LEGAL', 'Sociedad de prueba SL', now() FROM t WHERE k = 'acct_legal';

INSERT INTO project (id, slug, name, asset_class, updated_at)
SELECT v, 'verificacion', 'Proyecto de verificación', 'RESIDENTIAL', now() FROM t WHERE k = 'project';

INSERT INTO funding_round (
  id, project_id, round_number, status,
  target_amount_cents, minimum_amount_cents, min_ticket_cents, updated_at)
SELECT (SELECT v FROM t WHERE k = 'round'), (SELECT v FROM t WHERE k = 'project'),
       1, 'OPEN', 100000000, 60000000, 50000, now();


-- =============================================================================
-- 1. El log de auditoría es de solo inserción
-- =============================================================================

INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id)
VALUES (gen_random_uuid(), 'SYSTEM', 'verify.start', 'system', NULL);

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE audit_log SET action = 'manipulado';
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se pudo MODIFICAR una fila de audit_log';
  END IF;
  RAISE NOTICE 'OK  · audit_log rechaza UPDATE';
END $$;

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    DELETE FROM audit_log;
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se pudo BORRAR una fila de audit_log';
  END IF;
  RAISE NOTICE 'OK  · audit_log rechaza DELETE';
END $$;


-- =============================================================================
-- 2. La cadena de hashes la calcula el motor y encadena correctamente
-- =============================================================================

INSERT INTO audit_log (id, actor_type, action, entity_type)
VALUES (gen_random_uuid(), 'SYSTEM', 'verify.second', 'system');
INSERT INTO audit_log (id, actor_type, action, entity_type)
VALUES (gen_random_uuid(), 'SYSTEM', 'verify.third', 'system');

DO $$
DECLARE
  total INT;
  encadenados INT;
  rotos INT;
BEGIN
  SELECT count(*) INTO total FROM audit_log;
  IF total < 3 THEN
    RAISE EXCEPTION 'ROTO: se esperaban al menos 3 filas de auditoría, hay %', total;
  END IF;

  -- Toda fila tiene hash calculado, y todas menos la primera enlazan con la anterior.
  IF EXISTS (SELECT 1 FROM audit_log WHERE hash IS NULL OR length(trim(hash)) <> 64) THEN
    RAISE EXCEPTION 'ROTO: hay filas de auditoría sin hash de 64 caracteres';
  END IF;

  SELECT count(*) INTO encadenados
    FROM audit_log a
    JOIN audit_log b ON b.seq = (
      SELECT max(seq) FROM audit_log x WHERE x.seq < a.seq
    )
   WHERE a.prev_hash = b.hash;

  IF encadenados <> total - 1 THEN
    RAISE EXCEPTION 'ROTO: la cadena de hashes no enlaza (% enlaces de % esperados)',
      encadenados, total - 1;
  END IF;

  -- La función de verificación no debe encontrar nada.
  SELECT count(*) INTO rotos FROM verify_audit_log_chain(0);
  IF rotos <> 0 THEN
    RAISE EXCEPTION 'ROTO: verify_audit_log_chain() reporta % eslabones rotos', rotos;
  END IF;

  RAISE NOTICE 'OK  · la cadena de hashes se calcula en el motor y verify_audit_log_chain() la valida';
END $$;


-- =============================================================================
-- 2b. Una manipulación del log se DETECTA
--
-- Esta es la prueba que de verdad importa. Los triggers frenan a la aplicación,
-- pero no a quien tenga privilegios para desactivarlos. La cadena de hashes es
-- lo que hace que, aun así, la manipulación deje huella.
--
-- Aquí desactivamos el trigger a propósito —simulando a un atacante con
-- privilegios de administrador de la base de datos— y comprobamos que
-- verify_audit_log_chain() canta.
-- =============================================================================

DO $$
DECLARE
  rotos INT;
  victima UUID;
BEGIN
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only;

  -- Caso A: alguien reescribe el contenido de un registro.
  SELECT id INTO victima FROM audit_log ORDER BY seq LIMIT 1;
  UPDATE audit_log SET action = 'accion.encubierta' WHERE id = victima;

  SELECT count(*) INTO rotos FROM verify_audit_log_chain(0);
  IF rotos = 0 THEN
    RAISE EXCEPTION 'ROTO: se modificó un registro de auditoría y la cadena no lo detectó';
  END IF;
  RAISE NOTICE 'OK  · modificar un registro rompe la cadena y se detecta (% eslabón(es))', rotos;

  UPDATE audit_log SET action = 'verify.start' WHERE id = victima;

  -- Caso B: alguien borra un registro intermedio para tapar un rastro.
  SELECT id INTO victima FROM audit_log ORDER BY seq OFFSET 1 LIMIT 1;
  DELETE FROM audit_log WHERE id = victima;

  SELECT count(*) INTO rotos FROM verify_audit_log_chain(0);
  IF rotos = 0 THEN
    RAISE EXCEPTION 'ROTO: se borró un registro de auditoría y la cadena no lo detectó';
  END IF;
  RAISE NOTICE 'OK  · borrar un registro rompe la cadena y se detecta (% eslabón(es))', rotos;

  ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only;
END $$;


-- =============================================================================
-- 3. Un perfil de verificación pertenece a UN sujeto, no a dos ni a ninguno
-- =============================================================================

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO kyc_profile (id, subject_type, investor_user_id, investor_account_id, updated_at)
    VALUES (gen_random_uuid(), 'INVESTOR_USER',
            (SELECT v FROM t WHERE k = 'user'),
            (SELECT v FROM t WHERE k = 'acct_nat'), now());
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se aceptó un kyc_profile con DOS sujetos';
  END IF;
  RAISE NOTICE 'OK  · kyc_profile rechaza tener dos sujetos';
END $$;

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO kyc_profile (id, subject_type, updated_at)
    VALUES (gen_random_uuid(), 'INVESTOR_USER', now());
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se aceptó un kyc_profile huérfano';
  END IF;
  RAISE NOTICE 'OK  · kyc_profile rechaza quedarse sin sujeto';
END $$;

-- Un rechazo sin motivo es indefendible ante una reclamación.
DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO kyc_profile (id, subject_type, investor_user_id, status, updated_at)
    VALUES (gen_random_uuid(), 'INVESTOR_USER',
            (SELECT v FROM t WHERE k = 'user'), 'REJECTED', now());
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se aceptó un expediente RECHAZADO sin motivo';
  END IF;
  RAISE NOTICE 'OK  · un expediente rechazado exige motivo';
END $$;


-- =============================================================================
-- 4. Los datos societarios solo aplican a cuentas LEGAL
-- =============================================================================

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO legal_entity_details (id, investor_account_id, legal_name, tax_id, updated_at)
    VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'acct_nat'),
            'No debería entrar SL', 'B00000000', now());
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se colgaron datos societarios de una persona física';
  END IF;
  RAISE NOTICE 'OK  · los datos societarios exigen una cuenta LEGAL';
END $$;

INSERT INTO legal_entity_details (id, investor_account_id, legal_name, tax_id, updated_at)
VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'acct_legal'),
        'Sociedad de prueba SL', 'B12345678', now());
DO $$ BEGIN RAISE NOTICE 'OK  · los datos societarios sí entran en una cuenta LEGAL'; END $$;


-- =============================================================================
-- 5. Una sola ronda abierta por proyecto
-- =============================================================================

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO funding_round (
      id, project_id, round_number, status,
      target_amount_cents, minimum_amount_cents, min_ticket_cents, updated_at)
    VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'project'), 2, 'OPEN',
            50000000, 30000000, 50000, now());
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: dos rondas ABIERTAS en el mismo proyecto';
  END IF;
  RAISE NOTICE 'OK  · solo una ronda abierta por proyecto';
END $$;

-- Mínimo por encima del objetivo: una ronda que no puede tener éxito.
DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO funding_round (
      id, project_id, round_number, status,
      target_amount_cents, minimum_amount_cents, min_ticket_cents, updated_at)
    VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'project'), 3, 'DRAFT',
            10000000, 20000000, 50000, now());
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se aceptó una ronda con mínimo mayor que el objetivo';
  END IF;
  RAISE NOTICE 'OK  · el mínimo de la ronda no puede superar el objetivo';
END $$;


-- =============================================================================
-- 6. Importes: nada de ceros ni negativos
-- =============================================================================

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO investment (
      id, investor_account_id, placed_by_investor_user_id,
      funding_round_id, project_id, amount_cents, reference, updated_at)
    VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'acct_nat'),
            (SELECT v FROM t WHERE k = 'user'), (SELECT v FROM t WHERE k = 'round'),
            (SELECT v FROM t WHERE k = 'project'), 0, 'REF-CERO', now());
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se aceptó una inversión de importe cero';
  END IF;
  RAISE NOTICE 'OK  · una inversión no puede valer cero ni menos';
END $$;


-- =============================================================================
-- 7. La cascada reparte exactamente el 100 %
-- =============================================================================

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO return_tier (id, funding_round_id, tier_order, label,
                             split_investors_pct, split_sponsor_pct)
    VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'round'), 1,
            'Tramo mal repartido', 80, 30);
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: un tramo de la cascada reparte más (o menos) del 100 %%';
  END IF;
  RAISE NOTICE 'OK  · cada tramo de la cascada suma 100 %%';
END $$;


-- =============================================================================
-- 8. Partida doble: todo asiento cuadra al cerrar la transacción
-- =============================================================================

INSERT INTO ledger_account (id, type, code)
SELECT v, 'ESCROW', 'ESCROW:verificacion' FROM t WHERE k = 'ledger_acct';

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO ledger_transaction (id, description, source_type)
    VALUES ((SELECT v FROM t WHERE k = 'ledger_txn'), 'Asiento descuadrado', 'test');

    INSERT INTO ledger_entry (id, transaction_id, account_id, debit_cents, credit_cents)
    VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'ledger_txn'),
            (SELECT v FROM t WHERE k = 'ledger_acct'), 100000, 0);

    -- Fuerza la comprobación diferida sin cerrar la transacción exterior.
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: un asiento descuadrado sobrevivió';
  END IF;
  RAISE NOTICE 'OK  · un asiento descuadrado no puede confirmarse';
END $$;

-- Y el asiento cuadrado sí pasa.
DO $$
DECLARE txn UUID := gen_random_uuid();
        cuenta2 UUID := gen_random_uuid();
BEGIN
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO ledger_account (id, type, code) VALUES (cuenta2, 'BANK', 'BANK:verificacion');
  INSERT INTO ledger_transaction (id, description, source_type)
  VALUES (txn, 'Asiento cuadrado', 'test');
  INSERT INTO ledger_entry (id, transaction_id, account_id, debit_cents, credit_cents)
  VALUES (gen_random_uuid(), txn, (SELECT v FROM t WHERE k = 'ledger_acct'), 100000, 0);
  INSERT INTO ledger_entry (id, transaction_id, account_id, debit_cents, credit_cents)
  VALUES (gen_random_uuid(), txn, cuenta2, 0, 100000);
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'OK  · un asiento cuadrado se confirma sin problema';
END $$;

-- Una línea que es cargo y abono a la vez no es partida doble.
DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO ledger_entry (id, transaction_id, account_id, debit_cents, credit_cents)
    VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'ledger_txn'),
            (SELECT v FROM t WHERE k = 'ledger_acct'), 500, 500);
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: una línea con cargo Y abono fue aceptada';
  END IF;
  RAISE NOTICE 'OK  · una línea es cargo o abono, nunca las dos cosas';
END $$;


-- =============================================================================
-- 9. Una versión legal publicada es inmutable
-- =============================================================================

INSERT INTO legal_document (id, slug, kind, name)
SELECT v, 'terminos-verificacion', 'TERMS_OF_USE', 'Términos (verificación)'
FROM t WHERE k = 'legal_doc';

INSERT INTO legal_document_version (
  id, legal_document_id, version_label, content_md, content_sha256, effective_from)
VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'legal_doc'), 'v1',
        'Texto original', repeat('a', 64), now());

DO $$
DECLARE rechazado BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE legal_document_version SET content_md = 'Texto reescrito a posteriori';
  EXCEPTION WHEN OTHERS THEN rechazado := true;
  END;
  IF NOT rechazado THEN
    RAISE EXCEPTION 'ROTO: se reescribió el contenido de una versión legal publicada';
  END IF;
  RAISE NOTICE 'OK  · el contenido de una versión legal publicada es inmutable';
END $$;

-- Retirarla de circulación sí está permitido: es como se publica una nueva.
UPDATE legal_document_version SET effective_until = now();
DO $$ BEGIN RAISE NOTICE 'OK  · una versión legal sí se puede retirar con effective_until'; END $$;


-- =============================================================================
-- 10. La vista de captación cuenta lo que debe
-- =============================================================================

DO $$
DECLARE
  comprometido BIGINT;
  financiado BIGINT;
BEGIN
  -- Una confirmada, una revocada. Solo la primera cuenta.
  INSERT INTO investment (id, investor_account_id, placed_by_investor_user_id,
                          funding_round_id, project_id, amount_cents, status, reference, updated_at)
  VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'acct_nat'),
          (SELECT v FROM t WHERE k = 'user'), (SELECT v FROM t WHERE k = 'round'),
          (SELECT v FROM t WHERE k = 'project'), 500000, 'CONFIRMED', 'REF-OK', now());

  INSERT INTO investment (id, investor_account_id, placed_by_investor_user_id,
                          funding_round_id, project_id, amount_cents, status, reference, updated_at)
  VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'acct_legal'),
          (SELECT v FROM t WHERE k = 'user'), (SELECT v FROM t WHERE k = 'round'),
          (SELECT v FROM t WHERE k = 'project'), 900000, 'WITHDRAWN', 'REF-REVOCADA', now());

  SELECT committed_cents, funded_cents INTO comprometido, financiado
    FROM funding_round_progress WHERE funding_round_id = (SELECT v FROM t WHERE k = 'round');

  IF comprometido <> 500000 THEN
    RAISE EXCEPTION 'ROTO: comprometido = % (se esperaba 500000; ¿cuenta las revocadas?)', comprometido;
  END IF;
  IF financiado <> 500000 THEN
    RAISE EXCEPTION 'ROTO: financiado = % (se esperaba 500000)', financiado;
  END IF;

  RAISE NOTICE 'OK  · la captación ignora las inversiones revocadas';
END $$;


DO $$ BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===============================================';
  RAISE NOTICE ' Todas las garantías del motor se cumplen.';
  RAISE NOTICE '===============================================';
END $$;

ROLLBACK;
