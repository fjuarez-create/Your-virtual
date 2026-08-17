# UMAIA · Plataforma de financiación participativa

Estado: **fase 1 completada**. Modelo de datos, arquitectura base y esqueleto de
las tres superficies. Sin lógica de negocio en las pantallas.

El diseño completo, con el porqué de cada decisión, está en
[`../docs/plataforma/01-modelo-de-datos-y-arquitectura.md`](../docs/plataforma/01-modelo-de-datos-y-arquitectura.md).

> **Esta plataforma no puede captar inversión real todavía.** Falta la
> autorización de la CNMV como proveedor de servicios de financiación
> participativa, y falta contratar los proveedores de verificación de identidad,
> firma electrónica y pagos. Los textos legales son borradores sin valor
> contractual y las cifras de UMAIA son provisionales.

---

## Arranque en local

Requisitos: Node 22+ y Docker.

```bash
cd platform
cp .env.example .env          # y rellena los secretos que pide el fichero
npm install
npm run infra:up              # Postgres, MinIO, Mailpit y Redis
npm run db:migrate            # aplica las dos migraciones
npm run db:seed               # UMAIA, proyectos relacionados y parámetros
npm run dev                   # http://localhost:3000
```

Genera cada secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`INVESTOR_SESSION_SECRET` y `ADMIN_SESSION_SECRET` tienen que ser **distintos**:
los dos perímetros están separados también criptográficamente.

### Comprobar que todo está bien

```bash
npm test                                    # 158 tests de dominio
npm run typecheck

# Las garantías del motor, contra la base de datos real
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/verify-invariants.sql
```

---

## Estructura

```
apps/
  web/       Next.js — las tres superficies, en tres segmentos de ruta:
               /            público (portada UMAIA, proyectos, legales)
               /inversor    área privada       [cookie de inversor]
               /admin       panel interno      [cookie propia + 2FA]
  worker/    Trabajos programados (declarados; se implementan desde la fase 3)

packages/
  core/      Dominio puro: dinero, máquinas de estado, elegibilidad, cascada.
             Sin HTTP ni base de datos. 116 tests.
  db/        Esquema Prisma, migraciones, triggers, seed y cliente.
  auth/      Primitivas compartidas: argon2id, testigos, límite de intentos.
  providers/ Puertos y adaptadores simulados de los proveedores externos.

infra/       Docker Compose para desarrollo.
```

La plataforma vive bajo `platform/` para no interferir con el showroom 3D de
SERENEA, que se sigue sirviendo desde la raíz del repositorio.

---

## Las cinco decisiones que conviene conocer antes de tocar nada

### 1. El dinero va en céntimos enteros

Nunca en coma flotante. Todo campo monetario es `BIGINT` con sufijo `_cents`, y
la aritmética pasa por `@umaia/core/money`. La conversión a texto ocurre solo en
el borde.

### 2. Quien accede no es quien invierte

`investor_user` es el humano que inicia sesión. `investor_account` es la parte
que firma el contrato, y puede ser una sociedad. Los une `account_membership`.

Así, un apoderado puede representar a dos sociedades **e** invertir en su propio
nombre sin necesidad de cuentas duplicadas con correos inventados. Ambos, el
humano y la sociedad, tienen su propio expediente de verificación.

### 3. El log de auditoría es inmutable de verdad

No por convención de la aplicación, sino por tres capas:

1. Al rol de aplicación se le **revocan** `UPDATE` y `DELETE` sobre `audit_log`.
2. Un trigger aborta cualquier mutación aunque alguien escale privilegios.
3. Cada fila encadena `hash = sha256(prev_hash ‖ contenido)`, **calculado por la
   base de datos**, de modo que el código no puede falsificar un eslabón.

Una manipulación no es imposible —con permisos de superusuario nada lo es— pero
sí **detectable**: `verify_audit_log_chain()` la encuentra, y hay un test que lo
demuestra desactivando el trigger a propósito.

Por eso `writeAudit()` se llama **dentro de la misma transacción** que el cambio:
si el registro falla, la operación falla.

### 4. Ningún proveedor externo decide nada

Los proveedores aportan hechos; las decisiones son de un revisor humano.
`applyKycEvent()` exige actor `REVIEWER` para llegar a `APPROVED`, así que un
webhook no puede aprobar un expediente ni por error ni por manipulación.

Los adaptadores simulados **nunca aprueban**: dejan el expediente en revisión
manual y quedan marcados como `mock` de forma permanente en `kyc_check.provider`.
Siempre se puede responder a «¿qué expedientes se resolvieron sin proveedor
real?».

Y la aplicación **se niega a arrancar en producción** con la verificación de
identidad simulada. Saltárselo exige `ALLOW_MOCK_KYC_IN_PRODUCTION=true`, que
deja un aviso crítico permanente en el panel.

### 5. Las reglas de cumplimiento son configuración, no código

Umbrales, plazos y periodos de reflexión viven en `compliance_setting`, con
histórico de quién los cambió y por qué. Cuando la asesoría legal afine un valor,
es editar una fila.

La única excepción es la verificación de identidad: `kyc.level1.required` está
bloqueada a `true`, y `parseComplianceConfig()` **rechaza arrancar** si alguien
la pone a `false` editando la base de datos directamente.

---

## Cómo enchufar un proveedor real

1. Escribe el adaptador en `packages/providers/src/` implementando el puerto
   correspondiente de `ports.ts`.
2. Regístralo en el `switch` de `registry.ts`.
3. Cambia la variable de entorno (`KYC_PROVIDER=sumsub`) y añade sus credenciales.

No se toca ni el flujo de inversión ni el de verificación. Los puertos ya están
definidos para identidad y sociedades, cribado de PEP y sanciones, firma
electrónica, cobros, almacenamiento y correo.

---

## Estado por fases

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Modelo de datos, arquitectura y esqueleto | **Completada** |
| 2 | Web pública de UMAIA y proyectos relacionados | Pendiente |
| 3 | Registro y verificación, niveles 1 y 2 | Pendiente |
| 4 | Flujo de inversión completo, con pagos simulados | Pendiente |
| 5 | Panel de administración | Pendiente |
| 6 | Integraciones reales | Bloqueada: requiere proveedores contratados |

---

## Lo que la fase 1 deja pendiente a propósito

- **Textos legales.** Los cinco documentos son borradores marcados como tales.
  Los redacta la asesoría jurídica.
- **Parámetros legales.** Los valores marcados `PENDIENTE DE VALIDACIÓN LEGAL`
  en `compliance_setting` llevan su referencia normativa, pero necesitan que la
  asesoría los confirme. No bloquean el desarrollo; sí bloquean producción.
- **Cifras de UMAIA.** Importes, plazos y rentabilidad objetivo son
  provisionales. Los carga el gestor de proyecto desde el panel.
- **Libro mayor de partida doble.** Modelado y con su trigger de cuadre
  funcionando; el flujo de inversión aún no escribe asientos (fase 4).
- **Cifrado de campos.** El esquema reserva las columnas (`*_encrypted`,
  `encryption_key_version`); la implementación del cifrado de sobre entra con el
  primer dato personal real, en la fase 3.
