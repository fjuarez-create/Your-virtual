-- =============================================================================
-- Invariantes que NO caben en Prisma.
--
-- Todo lo que hay aquí es una garantía que el motor hace cumplir pase lo que
-- pase en la aplicación. La regla que orienta este fichero: si una invariante
-- protege dinero, identidad o trazabilidad legal, no puede depender de que el
-- código de aplicación se porte bien.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. CHECK: coherencia de los datos
-- -----------------------------------------------------------------------------

-- Un perfil de verificación pertenece a un humano O a una sociedad, nunca a los
-- dos ni a ninguno. Esto es lo que hace segura la referencia polimórfica.
ALTER TABLE "kyc_profile"
  ADD CONSTRAINT "kyc_profile_exactly_one_subject" CHECK (
    (subject_type = 'INVESTOR_USER'    AND investor_user_id IS NOT NULL AND investor_account_id IS NULL)
    OR
    (subject_type = 'INVESTOR_ACCOUNT' AND investor_account_id IS NOT NULL AND investor_user_id IS NULL)
  );

ALTER TABLE "kyc_profile"
  ADD CONSTRAINT "kyc_profile_level_range" CHECK (level_reached BETWEEN 0 AND 3);

-- Un expediente rechazado tiene que decir por qué. Sin esto, "rechazado sin
-- motivo" es una respuesta posible, y ante una reclamación es indefendible.
ALTER TABLE "kyc_profile"
  ADD CONSTRAINT "kyc_profile_rejection_needs_reason" CHECK (
    status <> 'REJECTED' OR rejection_reason_code IS NOT NULL
  );

-- Dinero: siempre positivo.
ALTER TABLE "investment"
  ADD CONSTRAINT "investment_amount_positive" CHECK (amount_cents > 0);
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_amount_positive" CHECK (amount_cents > 0);
ALTER TABLE "refund"
  ADD CONSTRAINT "refund_amount_positive" CHECK (amount_cents > 0);
ALTER TABLE "distribution"
  ADD CONSTRAINT "distribution_total_positive" CHECK (total_gross_cents > 0);

-- La retención no puede exceder el bruto, y el neto es exactamente la resta.
ALTER TABLE "distribution_allocation"
  ADD CONSTRAINT "distribution_allocation_arithmetic" CHECK (
    gross_cents >= 0
    AND withholding_cents >= 0
    AND withholding_cents <= gross_cents
    AND net_cents = gross_cents - withholding_cents
  );

-- Parámetros de la ronda coherentes entre sí.
ALTER TABLE "funding_round"
  ADD CONSTRAINT "funding_round_amounts_coherent" CHECK (
    target_amount_cents > 0
    AND minimum_amount_cents > 0
    AND minimum_amount_cents <= target_amount_cents
    AND min_ticket_cents > 0
    AND min_ticket_cents <= target_amount_cents
    AND (max_ticket_per_investor_cents IS NULL OR max_ticket_per_investor_cents >= min_ticket_cents)
  );

ALTER TABLE "funding_round"
  ADD CONSTRAINT "funding_round_dates_coherent" CHECK (
    opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at
  );

-- La cascada reparte exactamente el 100 % en cada tramo.
ALTER TABLE "return_tier"
  ADD CONSTRAINT "return_tier_splits_sum_100" CHECK (
    split_investors_pct + split_sponsor_pct = 100
  );

ALTER TABLE "beneficial_owner"
  ADD CONSTRAINT "beneficial_owner_pct_range" CHECK (
    ownership_pct IS NULL OR (ownership_pct >= 0 AND ownership_pct <= 100)
  );

ALTER TABLE "capital_stack_item"
  ADD CONSTRAINT "capital_stack_amount_positive" CHECK (amount_cents > 0);
ALTER TABLE "capital_stack_item"
  ADD CONSTRAINT "capital_stack_seniority_positive" CHECK (seniority >= 1);

-- Partida doble: cada línea es un cargo o un abono, nunca las dos cosas.
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_single_side" CHECK (
    debit_cents >= 0
    AND credit_cents >= 0
    AND (debit_cents = 0) <> (credit_cents = 0)
  );

-- Una sesión que caduca antes de crearse no tiene sentido.
ALTER TABLE "investor_session"
  ADD CONSTRAINT "investor_session_expiry_future" CHECK (expires_at > created_at);
ALTER TABLE "admin_session"
  ADD CONSTRAINT "admin_session_expiry_future" CHECK (expires_at > created_at);


-- -----------------------------------------------------------------------------
-- 2. Índices únicos parciales: unicidad condicional
-- -----------------------------------------------------------------------------

-- Como máximo UNA ronda abierta por proyecto. Dos rondas abiertas a la vez
-- harían ambigua la pregunta "¿cuánto lleva captado?".
CREATE UNIQUE INDEX "funding_round_one_open_per_project"
  ON "funding_round" (project_id)
  WHERE status = 'OPEN';

-- Un solo documento VIGENTE por tipo y proyecto. Las versiones anteriores
-- siguen ahí, marcadas con superseded_by_id.
CREATE UNIQUE INDEX "project_document_one_current_per_type"
  ON "project_document" (project_id, document_type)
  WHERE superseded_by_id IS NULL;

-- Un solo proyecto destacado en la portada.
CREATE UNIQUE INDEX "project_one_featured"
  ON "project" ((is_featured))
  WHERE is_featured = true;

-- Una sola versión vigente por documento legal e idioma.
CREATE UNIQUE INDEX "legal_document_version_one_current"
  ON "legal_document_version" (legal_document_id, locale)
  WHERE effective_until IS NULL;

-- Una persona física tiene UNA sola cuenta natural: la suya.
CREATE UNIQUE INDEX "account_membership_one_natural_owner"
  ON "account_membership" (investor_user_id)
  WHERE role = 'OWNER';

-- Un titular real no se criba dos veces a la vez.
CREATE UNIQUE INDEX "kyc_check_one_pending_per_owner"
  ON "kyc_check" (beneficial_owner_id, check_type)
  WHERE beneficial_owner_id IS NOT NULL AND status IN ('REQUESTED', 'PENDING');


-- -----------------------------------------------------------------------------
-- 3. Coherencia entre tablas: lo que un CHECK no alcanza
-- -----------------------------------------------------------------------------

-- Los datos societarios solo existen para cuentas de tipo LEGAL.
CREATE OR REPLACE FUNCTION assert_account_is_legal() RETURNS trigger AS $$
DECLARE
  account_type "investor_account_type";
BEGIN
  SELECT type INTO account_type FROM "investor_account" WHERE id = NEW.investor_account_id;
  IF account_type <> 'LEGAL' THEN
    RAISE EXCEPTION
      'Los datos societarios y los titulares reales solo aplican a cuentas LEGAL (la cuenta % es %)',
      NEW.investor_account_id, account_type;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER "legal_entity_details_requires_legal_account"
  BEFORE INSERT OR UPDATE ON "legal_entity_details"
  FOR EACH ROW EXECUTE FUNCTION assert_account_is_legal();

CREATE TRIGGER "beneficial_owner_requires_legal_account"
  BEFORE INSERT OR UPDATE ON "beneficial_owner"
  FOR EACH ROW EXECUTE FUNCTION assert_account_is_legal();


-- -----------------------------------------------------------------------------
-- 4. Partida doble: todo asiento cuadra
--
-- Diferido al final de la transacción: durante la inserción de las líneas el
-- asiento está descuadrado por definición. Lo que no puede es quedarse así.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_ledger_transaction_balances() RETURNS trigger AS $$
DECLARE
  imbalance BIGINT;
  txn_id UUID;
BEGIN
  txn_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT COALESCE(SUM(debit_cents), 0) - COALESCE(SUM(credit_cents), 0)
    INTO imbalance
    FROM "ledger_entry"
   WHERE transaction_id = txn_id;

  IF imbalance <> 0 THEN
    RAISE EXCEPTION
      'El asiento % no cuadra: descuadre de % céntimos', txn_id, imbalance;
  END IF;

  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_entry_must_balance"
  AFTER INSERT OR UPDATE OR DELETE ON "ledger_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balances();


-- -----------------------------------------------------------------------------
-- 5. Tablas de solo inserción
--
-- "Inmutable" a nivel de aplicación no es inmutable. Aquí el motor rechaza
-- cualquier UPDATE o DELETE, venga de donde venga.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    '% es una tabla de solo inserción: % rechazado. Para corregir, inserte un registro nuevo.',
    TG_TABLE_NAME, TG_OP;
END; $$ LANGUAGE plpgsql;

-- El log de auditoría.
CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Qué versión de qué documento legal aceptó cada inversor. Es la defensa
-- jurídica básica ante una reclamación: no se toca.
CREATE TRIGGER "legal_document_acceptance_append_only"
  BEFORE UPDATE OR DELETE ON "legal_document_acceptance"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- La biografía de una inversión.
CREATE TRIGGER "investment_transition_append_only"
  BEFORE UPDATE OR DELETE ON "investment_transition"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- El histórico de cambios de parámetros de cumplimiento.
CREATE TRIGGER "compliance_setting_change_append_only"
  BEFORE UPDATE OR DELETE ON "compliance_setting_change"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Una versión de documento legal publicada es inmutable. Lo único que se puede
-- modificar es `effective_until`, que es como se retira de circulación:
-- corregir una errata es publicar la versión siguiente, no reescribir la vieja.
CREATE OR REPLACE FUNCTION reject_legal_version_content_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una versión de documento legal no se borra: retírela con effective_until.';
  END IF;

  IF NEW.legal_document_id IS DISTINCT FROM OLD.legal_document_id
     OR NEW.version_label   IS DISTINCT FROM OLD.version_label
     OR NEW.locale          IS DISTINCT FROM OLD.locale
     OR NEW.content_md      IS DISTINCT FROM OLD.content_md
     OR NEW.storage_key     IS DISTINCT FROM OLD.storage_key
     OR NEW.content_sha256  IS DISTINCT FROM OLD.content_sha256
     OR NEW.effective_from  IS DISTINCT FROM OLD.effective_from
  THEN
    RAISE EXCEPTION
      'El contenido de una versión legal publicada es inmutable. Publique una versión nueva.';
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER "legal_document_version_content_immutable"
  BEFORE UPDATE OR DELETE ON "legal_document_version"
  FOR EACH ROW EXECUTE FUNCTION reject_legal_version_content_change();


-- -----------------------------------------------------------------------------
-- 6. Cadena de hashes del log de auditoría
--
-- El encadenado lo calcula la BASE DE DATOS, no la aplicación: así el código de
-- aplicación no puede falsificar un eslabón ni saltarse uno. Un borrado o una
-- modificación posterior rompen la cadena y el trabajo diario de verificación
-- lo detecta.
--
-- El bloqueo de aviso serializa los insertos concurrentes: sin él, dos
-- transacciones simultáneas leerían el mismo `prev_hash` y la cadena se
-- bifurcaría.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_log_chain_hash() RETURNS trigger AS $$
DECLARE
  previous_hash CHAR(64);
  canonical_payload TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));

  SELECT hash INTO previous_hash
    FROM "audit_log"
   ORDER BY seq DESC
   LIMIT 1;

  NEW.prev_hash := previous_hash;

  -- Carga canónica: orden fijo y separador que no puede aparecer en los campos.
  canonical_payload := concat_ws(E'\x1f',
    COALESCE(previous_hash, ''),
    NEW.seq::TEXT,
    to_char(NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    NEW.actor_type::TEXT,
    COALESCE(NEW.actor_id::TEXT, ''),
    NEW.action,
    NEW.entity_type,
    COALESCE(NEW.entity_id::TEXT, ''),
    COALESCE(NEW.before::TEXT, ''),
    COALESCE(NEW.after::TEXT, ''),
    COALESCE(NEW.metadata::TEXT, '')
  );

  NEW.hash := encode(digest(canonical_payload, 'sha256'), 'hex');

  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_compute_chain"
  BEFORE INSERT ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain_hash();

-- Verificación de la cadena. La ejecuta a diario el worker, que además sella el
-- último hash en almacenamiento inmutable fuera de esta base de datos.
-- Devuelve las filas donde la cadena está rota; vacío = íntegra.
CREATE OR REPLACE FUNCTION verify_audit_log_chain(from_seq BIGINT DEFAULT 0)
RETURNS TABLE (seq BIGINT, id UUID, problem TEXT) AS $$
  WITH chained AS (
    SELECT
      a.seq,
      a.id,
      a.prev_hash,
      a.hash,
      LAG(a.hash) OVER (ORDER BY a.seq) AS expected_prev_hash,
      encode(digest(concat_ws(E'\x1f',
        COALESCE(LAG(a.hash) OVER (ORDER BY a.seq), ''),
        a.seq::TEXT,
        to_char(a.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        a.actor_type::TEXT,
        COALESCE(a.actor_id::TEXT, ''),
        a.action,
        a.entity_type,
        COALESCE(a.entity_id::TEXT, ''),
        COALESCE(a.before::TEXT, ''),
        COALESCE(a.after::TEXT, ''),
        COALESCE(a.metadata::TEXT, '')
      ), 'sha256'), 'hex') AS expected_hash
    FROM "audit_log" a
    WHERE a.seq >= from_seq
  )
  SELECT c.seq, c.id,
         CASE
           WHEN c.hash <> c.expected_hash THEN 'hash no coincide con el contenido'
           ELSE 'prev_hash roto: falta un eslabón anterior'
         END
    FROM chained c
   WHERE c.hash <> c.expected_hash
      OR c.prev_hash IS DISTINCT FROM c.expected_prev_hash;
$$ LANGUAGE sql STABLE;


-- -----------------------------------------------------------------------------
-- 7. Vista de captación por ronda
--
-- El "% cubierto" del frontend sale de aquí, para que la cifra sea una sola en
-- toda la plataforma. Solo cuenta los compromisos VIVOS: una inversión revocada
-- o caducada libera su importe.
-- -----------------------------------------------------------------------------

CREATE VIEW "funding_round_progress" AS
SELECT
  r.id AS funding_round_id,
  r.project_id,
  r.target_amount_cents,
  r.minimum_amount_cents,
  COALESCE(SUM(i.amount_cents) FILTER (
    WHERE i.status IN ('PENDING_KIIS', 'PENDING_SIGNATURE', 'COOLING_OFF',
                       'PENDING_PAYMENT', 'FUNDS_RECEIVED', 'CONFIRMED')
  ), 0) AS committed_cents,
  COALESCE(SUM(i.amount_cents) FILTER (
    WHERE i.status IN ('FUNDS_RECEIVED', 'CONFIRMED')
  ), 0) AS funded_cents,
  COUNT(DISTINCT i.investor_account_id) FILTER (
    WHERE i.status IN ('PENDING_KIIS', 'PENDING_SIGNATURE', 'COOLING_OFF',
                       'PENDING_PAYMENT', 'FUNDS_RECEIVED', 'CONFIRMED')
  ) AS investor_count
FROM "funding_round" r
LEFT JOIN "investment" i ON i.funding_round_id = r.id
GROUP BY r.id;
