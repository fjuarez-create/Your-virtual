import { PrismaClient, Prisma } from '@prisma/client';

export * from '@prisma/client';
export { Prisma };

/**
 * Cliente único. En desarrollo se reutiliza entre recargas en caliente para no
 * agotar el pool de conexiones de Postgres.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Cliente dentro de una transacción. */
export type PrismaTransaction = Prisma.TransactionClient;

// -----------------------------------------------------------------------------
// Auditoría
// -----------------------------------------------------------------------------

export type AuditActor =
  | { type: 'INVESTOR'; id: string; ip?: string | undefined }
  | { type: 'ADMIN'; id: string; ip?: string | undefined }
  | { type: 'SYSTEM'; id?: undefined; ip?: undefined }
  | { type: 'PROVIDER'; id?: undefined; ip?: undefined };

export interface AuditEntry {
  actor: AuditActor;
  /** Acción en punto: `kyc.approved`, `investment.confirmed`, … */
  action: string;
  entityType: string;
  entityId?: string | undefined;
  /** Estados antes y después. Redáctalos ANTES de llamar: ver `redact()`. */
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown> | undefined;
  requestId?: string | undefined;
}

/**
 * Campos que jamás deben acabar en el log de auditoría. Un log lleno de números
 * de documento en claro es un problema de protección de datos, no una defensa.
 */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'idDocumentNumber',
  'idDocumentNumberEncrypted',
  'id_document_number_encrypted',
  'iban',
  'ibanEncrypted',
  'iban_encrypted',
  'destinationIbanEncrypted',
  'secretEncrypted',
  'secret_encrypted',
  'tokenHash',
  'token_hash',
  'codeHash',
  'code_hash',
]);

/** Sustituye los valores sensibles por un marcador, conservando la forma. */
export function redact<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key) ? '[redactado]' : redact(val);
  }
  return out;
}

/**
 * Escribe una entrada de auditoría DENTRO de la transacción que hace el cambio.
 *
 * Esto es deliberado: si el log falla, la operación falla. Un cambio sobre una
 * inversión o un expediente de KYC que no queda registrado no debe existir.
 *
 * El `hash` y el `prev_hash` NO se pasan desde aquí: los calcula un trigger de
 * la base de datos, de modo que el código de aplicación no puede falsificar un
 * eslabón de la cadena.
 */
export async function writeAudit(
  tx: PrismaTransaction,
  entry: AuditEntry,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO audit_log (
      id, actor_type, actor_id, actor_ip, request_id,
      action, entity_type, entity_id, "before", "after", metadata
    ) VALUES (
      gen_random_uuid(),
      ${entry.actor.type}::actor_type,
      ${entry.actor.id ?? null}::uuid,
      ${entry.actor.ip ?? null}::inet,
      ${entry.requestId ?? null},
      ${entry.action},
      ${entry.entityType},
      ${entry.entityId ?? null}::uuid,
      ${entry.before === undefined ? null : JSON.stringify(redact(entry.before))}::jsonb,
      ${entry.after === undefined ? null : JSON.stringify(redact(entry.after))}::jsonb,
      ${entry.metadata === undefined ? null : JSON.stringify(redact(entry.metadata))}::jsonb
    )
  `;
}

/**
 * Recorre la cadena de hashes del log de auditoría.
 * Devuelve los eslabones rotos; vacío significa que nadie ha tocado nada.
 * Lo ejecuta el worker a diario.
 */
export async function verifyAuditChain(
  client: PrismaClient | PrismaTransaction = prisma,
  fromSeq = 0n,
): Promise<Array<{ seq: bigint; id: string; problem: string }>> {
  return client.$queryRaw`SELECT * FROM verify_audit_log_chain(${fromSeq}::bigint)`;
}
